const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Map(),
      chat: [],
      notes: "",
      polls: []
    });
  }
  return rooms.get(roomId);
}

function roomState(roomId) {
  const room = ensureRoom(roomId);
  return {
    users: [...room.users.values()],
    chat: room.chat.slice(-200),
    notes: room.notes,
    polls: room.polls
  };
}

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, userName }) => {
    if (!roomId || !userName) return;

    const room = ensureRoom(roomId);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName;

    room.users.set(socket.id, {
      id: socket.id,
      name: userName,
      handRaised: false
    });

    socket.emit("room-init", roomState(roomId));
    socket.to(roomId).emit("user-joined", { id: socket.id, name: userName });
    io.to(roomId).emit("participants-update", [...room.users.values()]);
  });

  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("chat-message", ({ roomId, text, userName }) => {
    if (!roomId || !text) return;
    const room = ensureRoom(roomId);
    const msg = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userName,
      text: text.slice(0, 500),
      at: Date.now()
    };
    room.chat.push(msg);
    io.to(roomId).emit("chat-message", msg);
  });

  socket.on("notes-update", ({ roomId, notes }) => {
    if (!roomId) return;
    const room = ensureRoom(roomId);
    room.notes = (notes || "").slice(0, 15000);
    socket.to(roomId).emit("notes-update", { notes: room.notes });
  });

  socket.on("reaction", ({ roomId, emoji, userName }) => {
    if (!roomId || !emoji) return;
    io.to(roomId).emit("reaction", {
      emoji: emoji.slice(0, 5),
      userName,
      at: Date.now()
    });
  });

  socket.on("raise-hand", ({ roomId, raised }) => {
    if (!roomId) return;
    const room = ensureRoom(roomId);
    const user = room.users.get(socket.id);
    if (!user) return;
    user.handRaised = Boolean(raised);
    io.to(roomId).emit("participants-update", [...room.users.values()]);
  });

  socket.on("create-poll", ({ roomId, question, options, createdBy }) => {
    if (!roomId || !question || !Array.isArray(options) || options.length < 2) return;
    const room = ensureRoom(roomId);
    const poll = {
      id: `poll-${Date.now()}`,
      question: question.slice(0, 240),
      options: options.slice(0, 6).map((opt) => ({
        text: String(opt).slice(0, 80),
        votes: 0
      })),
      votedBy: {},
      createdBy: createdBy || "Host"
    };
    room.polls.unshift(poll);
    room.polls = room.polls.slice(0, 20);
    io.to(roomId).emit("polls-update", room.polls);
  });

  socket.on("vote-poll", ({ roomId, pollId, optionIndex }) => {
    if (!roomId || !pollId || Number.isNaN(optionIndex)) return;
    const room = ensureRoom(roomId);
    const poll = room.polls.find((p) => p.id === pollId);
    if (!poll || !poll.options[optionIndex]) return;

    const prev = poll.votedBy[socket.id];
    if (typeof prev === "number" && poll.options[prev]) {
      poll.options[prev].votes = Math.max(0, poll.options[prev].votes - 1);
    }
    poll.votedBy[socket.id] = optionIndex;
    poll.options[optionIndex].votes += 1;
    io.to(roomId).emit("polls-update", room.polls);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);

    room.users.delete(socket.id);
    socket.to(roomId).emit("user-left", { id: socket.id });
    io.to(roomId).emit("participants-update", [...room.users.values()]);

    if (room.users.size === 0) {
      rooms.delete(roomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Zoom+ running at http://localhost:${PORT}`);
});