# Zoom+ (Zoom-like app with extra features)

This project is a real-time meeting platform inspired by Zoom, with additional features:

- Multi-user video meeting (WebRTC mesh)
- Room creation and invite link sharing
- In-meeting chat
- Shared live notes
- Emoji reactions
- Raise hand indicator
- Live polls with voting
- Breakout group planner
- AI summary panel (smart meeting recap)
- Browser live captions (when supported)

## Run locally

```bash
npm install
npm run dev
```

Open:

`http://localhost:3000`

## Tech stack

- Node.js + Express
- Socket.IO for real-time signaling and collaboration
- WebRTC for P2P media streams
- Vanilla HTML/CSS/JS frontend

## Notes

- This is optimized for development/demo use.
- For production, you should add TURN servers, auth, persistence DB, and deployment hardening.
