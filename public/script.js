const socket = io();
const authView = document.getElementById("authView");
const meetingView = document.getElementById("meetingView");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const roomLabel = document.getElementById("roomLabel");
const meetingStatus = document.getElementById("meetingStatus");
const videoGrid = document.getElementById("videoGrid");
const reactionOverlay = document.getElementById("reactionOverlay");

const chatList = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const participantsList = document.getElementById("participantsList");
const notesInput = document.getElementById("notesInput");
const pollList = document.getElementById("pollList");
const aiOutput = document.getElementById("aiOutput");
const breakoutResults = document.getElementById("breakoutResults");

let roomId = "";
let userName = "";
let localStream;
let isMuted = false;
let isVideoOff = false;
let raisedHand = false;
let captionsOn = false;

const peers = new Map();
let participants = [];
let chatHistory = [];
let polls = [];

const rtcConfig = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]
};

function randomRoomId() {
  return Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6);
}

async function setupLocalMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  addVideoCard("local", `${userName} (You)`, localStream, true);
}

function addVideoCard(id, label, stream, muted = false) {
  let card = document.getElementById(`card-${id}`);
  if (!card) {
    card = document.createElement("div");
    card.className = "video-card";
    card.id = `card-${id}`;
    card.innerHTML = `<video autoplay playsinline ${muted ? "muted" : ""}></video><div class="meta"></div>`;
    videoGrid.appendChild(card);
  }
  const video = card.querySelector("video");
  const meta = card.querySelector(".meta");
  video.srcObject = stream;
  meta.textContent = label;
}

function removeVideoCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (card) card.remove();
}

async function createPeer(remoteId, shouldCreateOffer) {
  const pc = new RTCPeerConnection(rtcConfig);
  peers.set(remoteId, pc);

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: remoteId, data: { candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    const remoteName = participants.find((p) => p.id === remoteId)?.name || "Participant";
    addVideoCard(remoteId, remoteName, event.streams[0]);
  };

  if (shouldCreateOffer) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: remoteId, data: { sdp: pc.localDescription } });
  }
}

async function handleSignal(from, data) {
  let pc = peers.get(from);
  if (!pc) {
    await createPeer(from, false);
    pc = peers.get(from);
  }
  if (data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: { sdp: pc.localDescription } });
    }
  }
  if (data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("ICE error:", err);
    }
  }
}

function renderChat() {
  chatList.innerHTML = "";
  chatHistory.forEach((msg) => {
    const div = document.createElement("div");
    div.className = "item";
    const time = new Date(msg.at).toLocaleTimeString();
    div.innerHTML = `<b>${msg.userName}</b><br/>${msg.text}<br/><small>${time}</small>`;
    chatList.appendChild(div);
  });
  chatList.scrollTop = chatList.scrollHeight;
}

function renderParticipants() {
  participantsList.innerHTML = "";
  participants.forEach((p) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<b>${p.name}</b>${p.handRaised ? " ✋" : ""}<br/><small>${p.id}</small>`;
    participantsList.appendChild(div);
  });
}

function renderPolls() {
  pollList.innerHTML = "";
  polls.forEach((poll) => {
    const wrap = document.createElement("div");
    wrap.className = "item";
    wrap.innerHTML = `<b>${poll.question}</b><br/><small>By ${poll.createdBy}</small>`;
    poll.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.textContent = `${opt.text} (${opt.votes})`;
      btn.onclick = () => socket.emit("vote-poll", { roomId, pollId: poll.id, optionIndex: idx });
      wrap.appendChild(btn);
    });
    pollList.appendChild(wrap);
  });
}

function pushReaction(emoji, from) {
  const node = document.createElement("div");
  node.className = "reaction-float";
  node.textContent = `${emoji} ${from ? ` ${from}` : ""}`;
  node.style.left = `${Math.random() * 80 + 10}%`;
  reactionOverlay.appendChild(node);
  setTimeout(() => node.remove(), 1600);
}

function generateAiSummary() {
  if (!chatHistory.length) {
    aiOutput.innerHTML = `<div class="item">No chat yet. AI summary appears after discussion starts.</div>`;
    return;
  }
  const recent = chatHistory.slice(-12);
  const speakers = [...new Set(recent.map((m) => m.userName))];
  const keyLines = recent.slice(-4).map((m) => `- ${m.userName}: ${m.text}`).join("<br/>");

  aiOutput.innerHTML = `
    <div class="item">
      <b>Meeting Summary</b><br/>
      Discussion had ${speakers.length} active speakers: ${speakers.join(", ")}.<br/><br/>
      <b>Key points</b><br/>
      ${keyLines}<br/><br/>
      <b>Action items</b><br/>
      1. Assign owners to top 2 decisions.<br/>
      2. Turn shared notes into task tickets.<br/>
      3. Schedule follow-up within 48 hours.
    </div>
  `;
}

function suggestBreakouts() {
  const count = Math.max(2, Number(document.getElementById("breakoutCount").value || 2));
  if (!participants.length) return;
  const names = participants.map((p) => p.name);
  const groups = Array.from({ length: count }, () => []);
  names.forEach((n, i) => groups[i % count].push(n));
  breakoutResults.innerHTML = "";
  groups.forEach((group, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<b>Group ${idx + 1}</b><br/>${group.join(", ") || "-"}`;
    breakoutResults.appendChild(div);
  });
}

async function joinMeeting(joinRoomId) {
  userName = nameInput.value.trim();
  if (!userName) {
    alert("Please enter your name.");
    return;
  }
  roomId = joinRoomId;
  roomLabel.textContent = roomId;
  meetingStatus.textContent = "Starting camera and microphone...";
  authView.classList.add("hidden");
  meetingView.classList.remove("hidden");

  try {
    await setupLocalMedia();
  } catch (err) {
    meetingStatus.textContent = "Camera/mic access failed.";
    alert("Please allow camera and microphone permissions.");
    throw err;
  }

  socket.emit("join-room", { roomId, userName });
  meetingStatus.textContent = "Connected";

  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  window.history.replaceState({}, "", url);
}

document.getElementById("newRoomBtn").onclick = () => joinMeeting(randomRoomId());
document.getElementById("joinBtn").onclick = () => {
  const value = roomInput.value.trim();
  if (!value) return alert("Please enter a room ID.");
  joinMeeting(value);
};

document.getElementById("sendChatBtn").onclick = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat-message", { roomId, text, userName });
  chatInput.value = "";
};

document.getElementById("toggleAudioBtn").onclick = (e) => {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
  e.target.textContent = isMuted ? "Unmute" : "Mute";
};

document.getElementById("toggleVideoBtn").onclick = (e) => {
  isVideoOff = !isVideoOff;
  localStream.getVideoTracks().forEach((t) => (t.enabled = !isVideoOff));
  e.target.textContent = isVideoOff ? "Video On" : "Video Off";
};

document.getElementById("raiseHandBtn").onclick = (e) => {
  raisedHand = !raisedHand;
  socket.emit("raise-hand", { roomId, raised: raisedHand });
  e.target.textContent = raisedHand ? "Lower Hand" : "Raise Hand";
};

document.getElementById("copyLinkBtn").onclick = async () => {
  await navigator.clipboard.writeText(window.location.href);
  alert("Invite link copied.");
};

document.getElementById("leaveBtn").onclick = () => window.location.reload();
document.getElementById("genSummaryBtn").onclick = generateAiSummary;
document.getElementById("makeBreakoutsBtn").onclick = suggestBreakouts;

document.getElementById("createPollBtn").onclick = () => {
  const question = document.getElementById("pollQuestion").value.trim();
  const options = document
    .getElementById("pollOptions")
    .value.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!question || options.length < 2) return alert("Add question and at least 2 options.");
  socket.emit("create-poll", { roomId, question, options, createdBy: userName });
  document.getElementById("pollQuestion").value = "";
  document.getElementById("pollOptions").value = "";
};

notesInput.addEventListener("input", () => {
  socket.emit("notes-update", { roomId, notes: notesInput.value });
});

document.querySelectorAll(".emoji").forEach((btn) => {
  btn.onclick = () => {
    const emoji = btn.getAttribute("data-emoji");
    socket.emit("reaction", { roomId, emoji, userName });
  };
});

document.querySelectorAll(".tab").forEach((tabBtn) => {
  tabBtn.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tabBtn.classList.add("active");
    document.getElementById(tabBtn.getAttribute("data-tab")).classList.add("active");
  };
});

document.getElementById("captionBtn").onclick = (e) => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return alert("Speech recognition not supported in this browser.");
  captionsOn = !captionsOn;
  e.target.textContent = captionsOn ? "Stop Captions" : "Live Captions";
  if (!captionsOn) return;

  const recog = new SpeechRecognition();
  recog.continuous = true;
  recog.interimResults = true;
  recog.onresult = (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
    meetingStatus.textContent = `Caption: ${text.slice(-90)}`;
  };
  recog.onend = () => {
    if (captionsOn) recog.start();
  };
  recog.start();
};

socket.on("room-init", (data) => {
  participants = data.users;
  chatHistory = data.chat;
  polls = data.polls || [];
  notesInput.value = data.notes || "";
  renderParticipants();
  renderChat();
  renderPolls();

  participants
    .filter((u) => u.id !== socket.id)
    .forEach((u) => createPeer(u.id, true).catch((err) => console.error(err)));
});

socket.on("user-joined", ({ id, name }) => {
  meetingStatus.textContent = `${name} joined`;
  createPeer(id, true).catch((err) => console.error(err));
});

socket.on("signal", ({ from, data }) => {
  handleSignal(from, data).catch((err) => console.error(err));
});

socket.on("user-left", ({ id }) => {
  const pc = peers.get(id);
  if (pc) pc.close();
  peers.delete(id);
  removeVideoCard(id);
});

socket.on("participants-update", (users) => {
  participants = users;
  renderParticipants();
});

socket.on("chat-message", (msg) => {
  chatHistory.push(msg);
  chatHistory = chatHistory.slice(-200);
  renderChat();
});

socket.on("notes-update", ({ notes }) => {
  if (document.activeElement !== notesInput) {
    notesInput.value = notes;
  }
});

socket.on("reaction", ({ emoji, userName: from }) => {
  pushReaction(emoji, from);
});

socket.on("polls-update", (nextPolls) => {
  polls = nextPolls;
  renderPolls();
});

const params = new URLSearchParams(window.location.search);
const existingRoom = params.get("room");
if (existingRoom) {
  roomInput.value = existingRoom;
}
