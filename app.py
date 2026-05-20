from pathlib import Path
from datetime import datetime, timezone
import json
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

import requests
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS


app = Flask(__name__)
CORS(app)  # Enables cross-origin requests from the React frontend.

DATABASE_PATH = Path(__file__).parent / "brand_benchmarks.db"
OPENAI_API_URL = "https://api.openai.com/v1/responses"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", OPENAI_MODEL)
AI_REQUEST_TIMEOUT_SECONDS = int(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "25"))
ENABLE_AI_PRICE_ENGINE = os.getenv("ENABLE_AI_PRICE_ENGINE", "true").lower() != "false"
ENABLE_AI_IMAGE_ENGINE = os.getenv("ENABLE_AI_IMAGE_ENGINE", "true").lower() != "false"

# Keyword penalties are intentionally weighted:
# Higher penalty = stronger signal of likely counterfeit behavior.
SUSPICIOUS_KEYWORD_PENALTIES: Dict[str, int] = {
    "replica": 30,
    "no box": 18,
    "aaa quality": 25,
    "unauthorized": 35,
}

# Default benchmark prices are stored in Indian Rupees (INR).
DEFAULT_BENCHMARK_ROWS = [
    ("Nike", "Sneakers", 11999.00),
    ("Apple", "Electronics", 89900.00),
    ("Rolex", "Watches", 950000.00),
    ("Adidas", "Sneakers", 8999.00),
    ("Sony", "Electronics", 54990.00),
]


def _resolve_openai_api_key(provided_api_key: str = "") -> str:
    explicit_key = str(provided_api_key or "").strip()
    if explicit_key:
        return explicit_key

    runtime_env_key = os.getenv("OPENAI_API_KEY", "").strip()
    if runtime_env_key:
        return runtime_env_key

    return OPENAI_API_KEY


def _resolve_openai_model(
    provided_model: str = "", env_variable_name: str = "OPENAI_MODEL", fallback_model: str = "gpt-4o-mini"
) -> str:
    explicit_model = str(provided_model or "").strip()
    if explicit_model:
        return explicit_model

    runtime_model = os.getenv(env_variable_name, "").strip()
    if runtime_model:
        return runtime_model

    return fallback_model


def _format_openai_request_error(error: requests.RequestException, prefix: str) -> str:
    response = getattr(error, "response", None)
    if response is None:
        return f"{prefix}: {error}"

    status_code = response.status_code

    try:
        response_json = response.json()
        error_message = response_json.get("error", {}).get("message")
        if error_message:
            return f"{prefix} (HTTP {status_code}): {error_message}"
    except ValueError:
        pass

    raw_text = (response.text or "").strip()
    if raw_text:
        return f"{prefix} (HTTP {status_code}): {raw_text[:240]}"

    return f"{prefix} (HTTP {status_code}): {response.reason or 'Unknown error'}"


def _post_openai_response(api_key: str, request_payload: Dict[str, Any]) -> Dict[str, Any]:
    response = requests.post(
        OPENAI_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=request_payload,
        timeout=AI_REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_json_from_text(raw_text: str) -> Optional[Dict[str, Any]]:
    cleaned_text = (raw_text or "").strip()
    if not cleaned_text:
        return None

    try:
        parsed_value = json.loads(cleaned_text)
        return parsed_value if isinstance(parsed_value, dict) else None
    except json.JSONDecodeError:
        pass

    start_index = cleaned_text.find("{")
    end_index = cleaned_text.rfind("}")
    if start_index == -1 or end_index == -1 or end_index <= start_index:
        return None

    try:
        parsed_value = json.loads(cleaned_text[start_index : end_index + 1])
        return parsed_value if isinstance(parsed_value, dict) else None
    except json.JSONDecodeError:
        return None


def _extract_response_text(response_payload: Dict[str, Any]) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    collected_segments: List[str] = []
    for item in response_payload.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content_part in item.get("content", []):
            if not isinstance(content_part, dict):
                continue
            content_type = content_part.get("type")
            if content_type in {"output_text", "text"}:
                text_value = content_part.get("text")
                if isinstance(text_value, str) and text_value.strip():
                    collected_segments.append(text_value.strip())

    return "\n".join(collected_segments).strip()


def get_ai_price_benchmark(
    product_name: str,
    description: str,
    listed_price_inr: float,
    openai_api_key: str = "",
    openai_model: str = "",
) -> Dict[str, Any]:
    ai_result_template = {
        "enabled": ENABLE_AI_PRICE_ENGINE,
        "used": False,
        "source": "none",
        "error": "",
        "detected_brand": "",
        "estimated_authentic_price_inr": 0.0,
        "low_price_inr": 0.0,
        "high_price_inr": 0.0,
        "confidence": 0.0,
        "comparable_products": [],
        "notes": "",
    }

    if not ENABLE_AI_PRICE_ENGINE:
        ai_result_template["error"] = "AI pricing is disabled by configuration."
        return ai_result_template

    resolved_api_key = _resolve_openai_api_key(openai_api_key)
    if not resolved_api_key:
        ai_result_template["error"] = (
            "OpenAI API key missing. Set OPENAI_API_KEY or provide openai_api_key from the app."
        )
        return ai_result_template

    resolved_model = _resolve_openai_model(
        provided_model=openai_model, env_variable_name="OPENAI_MODEL", fallback_model=OPENAI_MODEL
    )

    today_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pricing_prompt = f"""
You are an anti-counterfeit pricing analyst.
Today date (UTC): {today_utc}
Listing currency: INR

Analyze this listing and estimate the authentic market benchmark in INR:
- Product name: {product_name}
- Listed price (INR): {listed_price_inr}
- Description: {description}

Return JSON only with this exact shape:
{{
  "detected_brand": "string",
  "estimated_authentic_price_inr": number,
  "low_price_inr": number,
  "high_price_inr": number,
  "confidence": number,
  "comparable_products": [
    {{"name": "string", "typical_price_inr": number}}
  ],
  "notes": "string"
}}

Rules:
- comparable_products should contain 2 to 5 products.
- confidence must be between 0 and 1.
- low_price_inr <= estimated_authentic_price_inr <= high_price_inr.
- Numbers must be positive.
""".strip()

    request_payload = {
        "model": resolved_model,
        "input": [
            {
                "role": "system",
                "content": (
                    "Return only valid JSON. Do not include markdown fences or extra commentary. "
                    "All monetary values must be INR numbers."
                ),
            },
            {"role": "user", "content": pricing_prompt},
        ],
        "text": {"format": {"type": "json_object"}},
        "max_output_tokens": 500,
    }

    try:
        response_payload = _post_openai_response(resolved_api_key, request_payload)
    except requests.RequestException as error:
        ai_result_template["error"] = _format_openai_request_error(error, "AI price request failed")
        return ai_result_template
    except ValueError:
        ai_result_template["error"] = "AI request failed: invalid JSON response."
        return ai_result_template

    response_text = _extract_response_text(response_payload)
    parsed_json = _extract_json_from_text(response_text)
    if not parsed_json:
        ai_result_template["error"] = "AI response was not a valid JSON object."
        return ai_result_template

    estimated_price = _safe_float(parsed_json.get("estimated_authentic_price_inr"), 0.0)
    low_price = _safe_float(parsed_json.get("low_price_inr"), 0.0)
    high_price = _safe_float(parsed_json.get("high_price_inr"), 0.0)
    confidence = _safe_float(parsed_json.get("confidence"), 0.0)

    if estimated_price <= 0:
        ai_result_template["error"] = "AI response missing valid estimated_authentic_price_inr."
        return ai_result_template

    low_price = low_price if low_price > 0 else estimated_price * 0.85
    high_price = high_price if high_price > 0 else estimated_price * 1.15

    if low_price > high_price:
        low_price, high_price = high_price, low_price

    if not (low_price <= estimated_price <= high_price):
        estimated_price = max(low_price, min(high_price, estimated_price))

    comparable_products: List[Dict[str, Any]] = []
    for candidate in parsed_json.get("comparable_products", []):
        if not isinstance(candidate, dict):
            continue
        candidate_name = str(candidate.get("name", "")).strip()
        candidate_price = _safe_float(candidate.get("typical_price_inr"), 0.0)
        if candidate_name and candidate_price > 0:
            comparable_products.append(
                {"name": candidate_name, "typical_price_inr": round(candidate_price, 2)}
            )

    ai_result_template.update(
        {
            "used": True,
            "source": "openai",
            "error": "",
            "detected_brand": str(parsed_json.get("detected_brand", "")).strip(),
            "estimated_authentic_price_inr": round(estimated_price, 2),
            "low_price_inr": round(low_price, 2),
            "high_price_inr": round(high_price, 2),
            "confidence": max(0.0, min(1.0, confidence)),
            "comparable_products": comparable_products[:5],
            "notes": str(parsed_json.get("notes", "")).strip(),
        }
    )

    return ai_result_template


def get_ai_image_authenticity(
    product_name: str,
    description: str,
    listed_price_inr: float,
    image_url: str,
    image_base64: str,
    openai_api_key: str = "",
    openai_image_model: str = "",
) -> Dict[str, Any]:
    ai_result_template = {
        "enabled": ENABLE_AI_IMAGE_ENGINE,
        "used": False,
        "source": "none",
        "error": "",
        "verdict": "unavailable",
        "authenticity_score": 0.0,
        "confidence": 0.0,
        "visual_flags": [],
        "notes": "",
    }

    if not ENABLE_AI_IMAGE_ENGINE:
        ai_result_template["error"] = "AI image analysis is disabled by configuration."
        return ai_result_template

    resolved_api_key = _resolve_openai_api_key(openai_api_key)
    if not resolved_api_key:
        ai_result_template["error"] = (
            "OpenAI API key missing. Set OPENAI_API_KEY or provide openai_api_key from the app."
        )
        return ai_result_template

    resolved_image_model = _resolve_openai_model(
        provided_model=openai_image_model,
        env_variable_name="OPENAI_IMAGE_MODEL",
        fallback_model=OPENAI_IMAGE_MODEL,
    )

    image_reference = image_url if image_url else image_base64
    if not image_reference:
        ai_result_template["error"] = "No image reference provided for AI image analysis."
        return ai_result_template

    today_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    image_prompt = f"""
You are an anti-counterfeit product image analyst.
Today date (UTC): {today_utc}

Analyze whether the uploaded listing image appears visually original or potentially fake/counterfeit.
Product name: {product_name}
Listed price (INR): {listed_price_inr}
Description: {description}

Return JSON only with this exact shape:
{{
  "verdict": "likely_authentic|suspicious|likely_counterfeit|uncertain",
  "authenticity_score": number,
  "confidence": number,
  "visual_flags": ["string"],
  "notes": "string"
}}

Rules:
- authenticity_score must be between 0 and 100 (higher means more likely authentic).
- confidence must be between 0 and 1.
- visual_flags should include concrete observations from the image (if any).
- Keep notes short and objective.
""".strip()

    request_payload = {
        "model": resolved_image_model,
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": image_prompt},
                    {"type": "input_image", "image_url": image_reference, "detail": "high"},
                ],
            }
        ],
        "text": {"format": {"type": "json_object"}},
        "max_output_tokens": 450,
    }

    try:
        response_payload = _post_openai_response(resolved_api_key, request_payload)
    except requests.RequestException as error:
        ai_result_template["error"] = _format_openai_request_error(error, "AI image request failed")
        return ai_result_template
    except ValueError:
        ai_result_template["error"] = "AI image request failed: invalid JSON response."
        return ai_result_template

    response_text = _extract_response_text(response_payload)
    parsed_json = _extract_json_from_text(response_text)
    if not parsed_json:
        ai_result_template["error"] = "AI image response was not a valid JSON object."
        return ai_result_template

    authenticity_raw = parsed_json.get("authenticity_score")
    if authenticity_raw is None:
        ai_result_template["error"] = "AI image response missing authenticity_score."
        return ai_result_template

    authenticity_score = max(0.0, min(100.0, _safe_float(authenticity_raw, 0.0)))
    confidence = max(0.0, min(1.0, _safe_float(parsed_json.get("confidence"), 0.0)))
    verdict = str(parsed_json.get("verdict", "uncertain")).strip().lower()
    allowed_verdicts = {"likely_authentic", "suspicious", "likely_counterfeit", "uncertain"}
    if verdict not in allowed_verdicts:
        verdict = "uncertain"

    visual_flags: List[str] = []
    for flag in parsed_json.get("visual_flags", []):
        flag_text = str(flag).strip()
        if flag_text:
            visual_flags.append(flag_text)

    ai_result_template.update(
        {
            "used": True,
            "source": "openai",
            "error": "",
            "verdict": verdict,
            "authenticity_score": round(authenticity_score, 2),
            "confidence": confidence,
            "visual_flags": visual_flags[:8],
            "notes": str(parsed_json.get("notes", "")).strip(),
        }
    )

    return ai_result_template


def get_database_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    """
    Creates benchmark storage if needed.
    SQL table requested:
    BrandBenchmarks(brand_name, category, average_market_price)
    """
    with get_database_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS BrandBenchmarks (
                brand_name TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                average_market_price REAL NOT NULL CHECK(average_market_price > 0)
            );
            """
        )

        # Upsert defaults so benchmark values stay aligned with INR pricing.
        connection.executemany(
            """
            INSERT INTO BrandBenchmarks (brand_name, category, average_market_price)
            VALUES (?, ?, ?)
            ON CONFLICT(brand_name) DO UPDATE SET
                category = excluded.category,
                average_market_price = excluded.average_market_price
            """,
            DEFAULT_BENCHMARK_ROWS,
        )
        connection.commit()


def fetch_benchmark_prices() -> Dict[str, float]:
    with get_database_connection() as connection:
        rows = connection.execute(
            "SELECT brand_name, average_market_price FROM BrandBenchmarks"
        ).fetchall()
    return {row["brand_name"].lower(): row["average_market_price"] for row in rows}


def detect_brand_from_product_name(product_name: str, benchmark_prices: Dict[str, float]) -> str:
    lowered_name = product_name.lower()
    for brand_name in benchmark_prices.keys():
        if brand_name in lowered_name:
            return brand_name

    # Fallback: first token may still be brand-like in many listings.
    return lowered_name.split()[0] if lowered_name.strip() else ""


def analyze_description_keywords(description: str) -> Tuple[List[str], int]:
    lowered_description = description.lower()
    matched_keywords: List[str] = []
    total_penalty = 0

    for keyword, penalty in SUSPICIOUS_KEYWORD_PENALTIES.items():
        if keyword in lowered_description:
            matched_keywords.append(keyword)
            total_penalty += penalty

    return matched_keywords, total_penalty


def calculate_confidence_score(
    product_name: str,
    price: float,
    description: str,
    ai_benchmark: Optional[Dict[str, Any]] = None,
    ai_image_analysis: Optional[Dict[str, Any]] = None,
) -> Dict:
    benchmark_prices = fetch_benchmark_prices()
    detected_brand = detect_brand_from_product_name(product_name, benchmark_prices)
    authentic_price = benchmark_prices.get(detected_brand)
    benchmark_source = "database"

    if ai_benchmark and ai_benchmark.get("used"):
        ai_estimated_price = _safe_float(ai_benchmark.get("estimated_authentic_price_inr"), 0.0)
        if ai_estimated_price > 0:
            authentic_price = ai_estimated_price
            benchmark_source = "ai"
            ai_detected_brand = str(ai_benchmark.get("detected_brand", "")).strip().lower()
            if ai_detected_brand:
                detected_brand = ai_detected_brand

    score = 100
    scoring_reasons: List[str] = []

    # Price logic:
    # 1) Start from 100.
    # 2) Apply large penalty when listing price is far below authentic benchmark.
    # 3) Apply moderate penalty for mildly underpriced items.
    # 4) Apply a smaller penalty when no benchmark exists.
    if authentic_price is not None:
        price_ratio = price / authentic_price if authentic_price > 0 else 1
        if price_ratio < 0.50:
            score -= 45
            scoring_reasons.append(
                "Price is less than 50% of authentic market average (strong counterfeit signal)."
            )
        elif price_ratio < 0.75:
            score -= 20
            scoring_reasons.append(
                "Price is significantly below authentic market average (moderate risk)."
            )
        else:
            scoring_reasons.append("Price is within acceptable range of brand benchmark.")
        if benchmark_source == "ai":
            scoring_reasons.append("Authentic benchmark generated by AI market pricing engine.")
    else:
        price_ratio = None
        score -= 10
        scoring_reasons.append("No brand benchmark found; confidence reduced due to limited reference data.")

    # Description NLP-style keyword scan:
    # Penalize words commonly associated with gray-market or fake listings.
    matched_keywords, keyword_penalty = analyze_description_keywords(description)
    if keyword_penalty > 0:
        score -= keyword_penalty
        scoring_reasons.append(
            f"Description contains suspicious terms: {', '.join(matched_keywords)}."
        )
    else:
        scoring_reasons.append("No suspicious keywords found in description.")

    # Image AI logic:
    # Blend visual authenticity estimate with price/text score for final trust meter.
    if ai_image_analysis and ai_image_analysis.get("used"):
        image_authenticity_score = max(
            0.0, min(100.0, _safe_float(ai_image_analysis.get("authenticity_score"), 0.0))
        )
        score = (score * 0.65) + (image_authenticity_score * 0.35)

        verdict = str(ai_image_analysis.get("verdict", "")).lower()
        if verdict == "likely_counterfeit":
            score -= 15
            scoring_reasons.append(
                "AI image analysis found strong counterfeit visual signals in the product image."
            )
        elif verdict == "suspicious":
            score -= 8
            scoring_reasons.append(
                "AI image analysis found suspicious visual inconsistencies in the product image."
            )
        elif verdict == "likely_authentic":
            scoring_reasons.append(
                "AI image analysis found visual features consistent with an authentic product."
            )
        else:
            scoring_reasons.append(
                "AI image analysis was uncertain; visual result treated with cautious weighting."
            )

    score = max(0, min(100, score))
    score = round(score)

    return {
        "confidence_score": score,
        "detected_brand": detected_brand.title() if detected_brand else "Unknown",
        "authentic_price": round(authentic_price, 2) if authentic_price is not None else 0,
        "current_price": round(price, 2),
        "price_ratio": round(price_ratio, 3) if price_ratio is not None else None,
        "matched_keywords": matched_keywords,
        "reasons": scoring_reasons,
        "benchmark_source": benchmark_source,
    }


@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


@app.route("/ai/status", methods=["POST"])
def ai_status():
    payload = request.get_json(silent=True) or {}
    provided_api_key = str(payload.get("openai_api_key", "")).strip()
    provided_model = str(payload.get("openai_model", "")).strip()

    resolved_api_key = _resolve_openai_api_key(provided_api_key)
    resolved_model = _resolve_openai_model(
        provided_model=provided_model, env_variable_name="OPENAI_MODEL", fallback_model=OPENAI_MODEL
    )

    if not resolved_api_key:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": (
                        "OpenAI API key missing. Set OPENAI_API_KEY in terminal "
                        "or paste openai_api_key in the app."
                    ),
                }
            ),
            400,
        )

    status_payload = {
        "model": resolved_model,
        "input": "Return JSON: {\"ok\": true, \"message\": \"connected\"}",
        "text": {"format": {"type": "json_object"}},
        "max_output_tokens": 60,
    }

    try:
        response_payload = _post_openai_response(resolved_api_key, status_payload)
    except requests.RequestException as error:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": _format_openai_request_error(error, "OpenAI connection test failed"),
                    "model": resolved_model,
                }
            ),
            502,
        )
    except ValueError:
        return jsonify({"ok": False, "error": "OpenAI returned invalid JSON.", "model": resolved_model}), 502

    response_text = _extract_response_text(response_payload)
    parsed_json = _extract_json_from_text(response_text) or {}

    return jsonify(
        {
            "ok": True,
            "model": resolved_model,
            "message": str(parsed_json.get("message", "connected")).strip() or "connected",
        }
    )


@app.route("/analyze", methods=["POST"])
def analyze_product():
    payload = request.get_json(silent=True) or {}
    product_name = str(payload.get("product_name", "")).strip()
    description = str(payload.get("description", "")).strip()
    image_url = str(payload.get("image_url", "")).strip()
    image_base64 = str(payload.get("image_base64", "")).strip()
    openai_api_key = str(payload.get("openai_api_key", "")).strip()
    openai_model = str(payload.get("openai_model", "")).strip()
    openai_image_model = str(payload.get("openai_image_model", "")).strip()

    try:
        price = float(payload.get("price", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Price must be a valid numeric value."}), 400

    if not product_name:
        return jsonify({"error": "product_name is required."}), 400
    if price <= 0:
        return jsonify({"error": "price must be greater than 0."}), 400
    if not image_url and not image_base64:
        return jsonify({"error": "Please provide an image URL or capture/upload an image."}), 400

    ai_benchmark = get_ai_price_benchmark(
        product_name=product_name,
        description=description,
        listed_price_inr=price,
        openai_api_key=openai_api_key,
        openai_model=openai_model,
    )
    ai_image_analysis = get_ai_image_authenticity(
        product_name=product_name,
        description=description,
        listed_price_inr=price,
        image_url=image_url,
        image_base64=image_base64,
        openai_api_key=openai_api_key,
        openai_image_model=openai_image_model,
    )

    result = calculate_confidence_score(
        product_name=product_name,
        price=price,
        description=description,
        ai_benchmark=ai_benchmark,
        ai_image_analysis=ai_image_analysis,
    )
    result["image_source"] = "url" if image_url else "captured"
    result["ai_benchmark"] = ai_benchmark
    result["ai_image_analysis"] = ai_image_analysis

    # If AI pricing is unavailable, surface a clear message to frontend.
    if not ai_benchmark.get("used") and ai_benchmark.get("error"):
        result["reasons"].append(f"AI pricing unavailable: {ai_benchmark['error']}")
    if not ai_image_analysis.get("used") and ai_image_analysis.get("error"):
        result["reasons"].append(f"AI image analysis unavailable: {ai_image_analysis['error']}")

    return jsonify(result), 200


initialize_database()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
