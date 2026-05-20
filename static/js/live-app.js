const { useEffect, useRef, useState } = React;

const INITIAL_PRODUCT_FORM = {
  name: "",
  price: "",
  description: "",
  imageUrl: "",
  imageBase64: "",
  imageFileName: ""
};

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function formatInr(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "INR 0";
  }
  return INR_FORMATTER.format(numericValue);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read selected image file."));
    reader.readAsDataURL(file);
  });
}

function InputField({ label, name, value, onChange, type, placeholder, min, step }) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-semibold text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type || "text"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        step={step}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-800 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
      />
    </div>
  );
}

function TrustMeter({ score }) {
  const meterScore = Number.isFinite(score) ? score : 0;
  const meterColor =
    meterScore >= 75 ? "bg-emerald-500" : meterScore >= 50 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Trust Meter</h2>
        <span className="text-sm font-semibold text-slate-700">{meterScore}%</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-4 ${meterColor} transition-all duration-500`}
          style={{ width: `${meterScore}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Higher scores indicate stronger confidence that the listing is authentic.
      </p>
    </div>
  );
}

function MarketTrendChart({ currentPrice, authenticPrice }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: ["Current Listing", "Authentic Market Avg"],
        datasets: [
          {
            label: "Price Comparison (INR)",
            data: [currentPrice, authenticPrice],
            backgroundColor: ["rgba(14, 165, 233, 0.8)", "rgba(30, 41, 59, 0.8)"],
            borderRadius: 12
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "Market Trend: Listing vs Authentic Price Benchmark"
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatInr(value)
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [currentPrice, authenticPrice]);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <canvas ref={canvasRef} />
    </div>
  );
}

function App() {
  const [productForm, setProductForm] = useState(INITIAL_PRODUCT_FORM);
  const [imageInputMode, setImageInputMode] = useState("url");
  const [capturedImagePreview, setCapturedImagePreview] = useState("");
  const [openAiSettings, setOpenAiSettings] = useState({
    apiKey: "",
    model: "",
    imageModel: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState("");
  const [apiError, setApiError] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);

  function handleInputChange(event) {
    const { name, value } = event.target;
    setProductForm((previousValue) => ({ ...previousValue, [name]: value }));
  }

  function handleOpenAiSettingChange(event) {
    const { name, value } = event.target;
    setOpenAiSettings((previousValue) => ({ ...previousValue, [name]: value }));
  }

  function handleImageModeChange(event) {
    const nextMode = event.target.value;
    setImageInputMode(nextMode);
    setApiError("");
    setProductForm((previousValue) => ({
      ...previousValue,
      imageUrl: "",
      imageBase64: "",
      imageFileName: ""
    }));
    setCapturedImagePreview("");
  }

  async function handleCapturedImageChange(event) {
    const selectedFile = event.target.files && event.target.files[0];

    if (!selectedFile) {
      setProductForm((previousValue) => ({
        ...previousValue,
        imageBase64: "",
        imageFileName: ""
      }));
      setCapturedImagePreview("");
      return;
    }

    if (!selectedFile.type || !selectedFile.type.startsWith("image/")) {
      setApiError("Please select a valid image file.");
      return;
    }

    try {
      const fileDataUrl = await readFileAsDataUrl(selectedFile);
      setProductForm((previousValue) => ({
        ...previousValue,
        imageBase64: fileDataUrl,
        imageFileName: selectedFile.name || "captured-image"
      }));
      setCapturedImagePreview(fileDataUrl);
      setApiError("");
    } catch (error) {
      setApiError("Could not load the selected image. Please try another file.");
    }
  }

  async function handleAnalyzeProduct(event) {
    event.preventDefault();
    setIsLoading(true);
    setApiError("");
    setAiStatusMessage("");
    setAnalysisResult(null);

    const parsedPrice = Number(productForm.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setApiError("Please enter a valid product price in INR.");
      setIsLoading(false);
      return;
    }

    if (imageInputMode === "url" && !productForm.imageUrl.trim()) {
      setApiError("Please provide an image URL.");
      setIsLoading(false);
      return;
    }

    if (imageInputMode === "capture" && !productForm.imageBase64) {
      setApiError("Please capture or upload an image before analysis.");
      setIsLoading(false);
      return;
    }

    const requestPayload = {
      product_name: productForm.name.trim(),
      price: parsedPrice,
      description: productForm.description.trim()
    };

    if (imageInputMode === "url") {
      requestPayload.image_url = productForm.imageUrl.trim();
    } else {
      requestPayload.image_base64 = productForm.imageBase64;
      requestPayload.image_file_name = productForm.imageFileName;
    }

    if (openAiSettings.apiKey.trim()) {
      requestPayload.openai_api_key = openAiSettings.apiKey.trim();
    }
    if (openAiSettings.model.trim()) {
      requestPayload.openai_model = openAiSettings.model.trim();
    }
    if (openAiSettings.imageModel.trim()) {
      requestPayload.openai_image_model = openAiSettings.imageModel.trim();
    }

    try {
      const response = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });

      const parsedResponse = await response.json();
      if (!response.ok) {
        throw new Error(parsedResponse.error || `API returned ${response.status}`);
      }

      setAnalysisResult(parsedResponse);
    } catch (error) {
      setApiError(error.message || "Unable to analyze this product right now.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTestAiConnection() {
    setIsTestingAi(true);
    setApiError("");
    setAiStatusMessage("");

    const requestPayload = {};
    if (openAiSettings.apiKey.trim()) {
      requestPayload.openai_api_key = openAiSettings.apiKey.trim();
    }
    if (openAiSettings.model.trim()) {
      requestPayload.openai_model = openAiSettings.model.trim();
    }

    try {
      const response = await fetch("/ai/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });

      const parsedResponse = await response.json();
      if (!response.ok || !parsedResponse.ok) {
        throw new Error(parsedResponse.error || "Unable to connect to OpenAI.");
      }

      setAiStatusMessage(`OpenAI connected successfully using model: ${parsedResponse.model}`);
    } catch (error) {
      setApiError(error.message || "OpenAI connection failed.");
    } finally {
      setIsTestingAi(false);
    }
  }

  const previewImageSource =
    imageInputMode === "url" ? productForm.imageUrl.trim() : capturedImagePreview;
  const aiBenchmark = analysisResult && analysisResult.ai_benchmark ? analysisResult.ai_benchmark : null;
  const comparableProducts =
    aiBenchmark && Array.isArray(aiBenchmark.comparable_products)
      ? aiBenchmark.comparable_products
      : [];
  const aiImageAnalysis =
    analysisResult && analysisResult.ai_image_analysis ? analysisResult.ai_image_analysis : null;
  const imageVisualFlags =
    aiImageAnalysis && Array.isArray(aiImageAnalysis.visual_flags)
      ? aiImageAnalysis.visual_flags
      : [];

  return (
    <main className="min-h-screen px-4 py-10 text-slate-900">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Product Analysis Dashboard</h1>
          <p className="mt-2 text-slate-600">
            Enter product details to estimate authenticity using AI-powered pricing, image, and description checks.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleAnalyzeProduct} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
            <InputField
              label="Product Name"
              name="name"
              value={productForm.name}
              onChange={handleInputChange}
              placeholder="Example: Nike Air Max 270"
            />

            <InputField
              label="Price (INR)"
              name="price"
              type="number"
              min="1"
              step="0.01"
              value={productForm.price}
              onChange={handleInputChange}
              placeholder="Example: 11999"
            />

            <div className="space-y-1">
              <label htmlFor="description" className="block text-sm font-semibold text-slate-700">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={productForm.description}
                onChange={handleInputChange}
                placeholder="Describe the listing details..."
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-800 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">OpenAI Settings (Required for live AI)</p>
              <InputField
                label="OpenAI API Key"
                name="apiKey"
                type="password"
                value={openAiSettings.apiKey}
                onChange={handleOpenAiSettingChange}
                placeholder="sk-..."
              />
              <div className="grid gap-3 md:grid-cols-2">
                <InputField
                  label="Text Model (Optional)"
                  name="model"
                  value={openAiSettings.model}
                  onChange={handleOpenAiSettingChange}
                  placeholder="gpt-4o-mini"
                />
                <InputField
                  label="Image Model (Optional)"
                  name="imageModel"
                  value={openAiSettings.imageModel}
                  onChange={handleOpenAiSettingChange}
                  placeholder="gpt-4o-mini"
                />
              </div>
              <button
                type="button"
                onClick={handleTestAiConnection}
                disabled={isTestingAi}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isTestingAi ? "Testing OpenAI..." : "Test OpenAI Connection"}
              </button>
              {aiStatusMessage ? <p className="text-sm text-emerald-700">{aiStatusMessage}</p> : null}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Product Image Source</p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="imageMode"
                    value="url"
                    checked={imageInputMode === "url"}
                    onChange={handleImageModeChange}
                  />
                  Use Image URL
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="imageMode"
                    value="capture"
                    checked={imageInputMode === "capture"}
                    onChange={handleImageModeChange}
                  />
                  Capture / Upload Image
                </label>
              </div>

              {imageInputMode === "url" ? (
                <InputField
                  label="Image URL"
                  name="imageUrl"
                  value={productForm.imageUrl}
                  onChange={handleInputChange}
                  placeholder="https://example.com/product-image.jpg"
                />
              ) : (
                <div className="space-y-1">
                  <label htmlFor="capturedImage" className="block text-sm font-semibold text-slate-700">
                    Capture or Upload Product Image
                  </label>
                  <input
                    id="capturedImage"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleCapturedImageChange}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-800 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                  <p className="text-xs text-slate-500">
                    On mobile devices, this opens live camera capture. On desktop, it opens image upload.
                  </p>
                  {productForm.imageFileName ? (
                    <p className="text-xs font-medium text-slate-600">
                      Selected image: {productForm.imageFileName}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? "Analyzing..." : "Analyze Product"}
            </button>
          </form>

          <div className="space-y-4">
            <TrustMeter score={analysisResult ? analysisResult.confidence_score : 0} />

            {previewImageSource ? (
              <div className="overflow-hidden rounded-2xl bg-white p-3 shadow-sm">
                <img
                  src={previewImageSource}
                  alt="Submitted product"
                  className="h-64 w-full rounded-xl object-cover"
                  onError={(event) => {
                    event.currentTarget.src =
                      "https://placehold.co/800x500?text=Image+Preview+Unavailable";
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        {apiError ? <p className="rounded-xl bg-rose-100 px-4 py-3 text-rose-700">{apiError}</p> : null}

        {analysisResult ? (
          <section className="space-y-4">
            <MarketTrendChart
              currentPrice={analysisResult.current_price || 0}
              authenticPrice={analysisResult.authentic_price || 0}
            />

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Analysis Details</h2>
              <p className="text-slate-700">
                Price benchmark source:{" "}
                <span className="font-semibold">
                  {analysisResult.benchmark_source === "ai"
                    ? "AI live estimate"
                    : "Database fallback"}
                </span>
              </p>
              <p className="text-slate-700">
                Detected brand benchmark:{" "}
                <span className="font-semibold">{analysisResult.detected_brand || "Unknown"}</span>
              </p>
              <p className="text-slate-700">
                Listing price:{" "}
                <span className="font-semibold">{formatInr(analysisResult.current_price)}</span>
              </p>
              <p className="text-slate-700">
                Authentic benchmark average:{" "}
                <span className="font-semibold">{formatInr(analysisResult.authentic_price)}</span>
              </p>
              <p className="text-slate-700">
                Suspicious keywords:{" "}
                <span className="font-semibold">
                  {analysisResult.matched_keywords && analysisResult.matched_keywords.length
                    ? analysisResult.matched_keywords.join(", ")
                    : "None"}
                </span>
              </p>
              {aiImageAnalysis ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-sm font-semibold text-slate-800">AI Image Authenticity</h3>
                  <p className="text-sm text-slate-700">
                    Verdict:{" "}
                    <span className="font-semibold">
                      {String(aiImageAnalysis.verdict || "unavailable").replaceAll("_", " ")}
                    </span>
                  </p>
                  <p className="text-sm text-slate-700">
                    Authenticity score:{" "}
                    <span className="font-semibold">
                      {Math.round(aiImageAnalysis.authenticity_score || 0)} / 100
                    </span>
                  </p>
                  <p className="text-sm text-slate-700">
                    Confidence:{" "}
                    <span className="font-semibold">
                      {Math.round((aiImageAnalysis.confidence || 0) * 100)}%
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    AI image authenticity is probabilistic and should be treated as risk guidance, not legal proof.
                  </p>
                  {aiImageAnalysis.notes ? (
                    <p className="text-sm text-slate-700">Notes: {aiImageAnalysis.notes}</p>
                  ) : null}
                  {imageVisualFlags.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {imageVisualFlags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {aiBenchmark ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-sm font-semibold text-slate-800">AI Price Intelligence</h3>
                  <p className="text-sm text-slate-700">
                    Confidence:{" "}
                    <span className="font-semibold">
                      {Math.round((aiBenchmark.confidence || 0) * 100)}%
                    </span>
                  </p>
                  <p className="text-sm text-slate-700">
                    AI estimated authentic range:{" "}
                    <span className="font-semibold">
                      {formatInr(aiBenchmark.low_price_inr || 0)} -{" "}
                      {formatInr(aiBenchmark.high_price_inr || 0)}
                    </span>
                  </p>
                  {aiBenchmark.notes ? (
                    <p className="text-sm text-slate-700">Notes: {aiBenchmark.notes}</p>
                  ) : null}
                </div>
              ) : null}
              {comparableProducts.length ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <h3 className="text-sm font-semibold text-slate-800">AI Similar Products</h3>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {comparableProducts.map((product) => (
                      <li key={`${product.name}-${product.typical_price_inr}`}>
                        {product.name}:{" "}
                        <span className="font-semibold">{formatInr(product.typical_price_inr)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {(analysisResult.reasons || []).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
