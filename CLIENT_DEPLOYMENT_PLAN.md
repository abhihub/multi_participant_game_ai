# Plan: Next.js Video Conferencing Client + VPS Deployment

## Context
We need a web client to test the full stack end-to-end: players join a video call, an admin
starts a game (Trivia or QuickDraw), the AI Moderator joins automatically via LiveKit Agents,
and the game runs with live score overlays and a confetti winner screen. Everything (client,
Game Engine API, AI Moderator) deploys to a single DigitalOcean/Linode VPS.

---

## Architecture

```
Browser (Next.js client)
  │  REST calls          │  WebRTC + DataChannel
  ▼                      ▼
Game Engine API     LiveKit Cloud ◄─── AI Moderator
(Node.js :3000)                        (Python, same VPS)

Nginx (VPS)
  ├── yourdomain.com     → :3001  (Next.js)
  └── api.yourdomain.com → :3000  (Game Engine API)
```

---

## Design decision: Moderator tile = game HUD

The AI Moderator participant (`identity: "moderator-ai"`) has no camera — it is an audio-only
LiveKit Agent. Its video slot is rendered as a **dedicated game HUD tile** that all players see:

- **Live leaderboard** showing all player scores, updated on every `score.updated` event
- **Confetti animation** plays on the moderator tile when `game.winner` or
  `effect.triggered { effect: "confetti" }` fires
- **"🎙 Speaking"** indicator when `moderator.speak.started` fires
- **Winner announcement** banner overlaid on the tile after the game ends

Player video tiles remain clean — no per-tile overlays. The moderator tile is the single
source of truth for game state that everyone watches.

---

## New folder to create: `Client/`

Place the Next.js app at the repo root alongside `Moderator/` and `src/`.

### File structure

```
Client/
├── package.json
├── next.config.ts
├── tsconfig.json
├── .env.local.example
├── app/
│   ├── layout.tsx
│   ├── page.tsx                      # Home: Create or Join a room
│   └── room/[code]/
│       └── page.tsx                  # Main video + game room
├── components/
│   ├── CreateRoomForm.tsx            # Pick game type, topic, create session
│   ├── JoinRoomForm.tsx              # Enter 6-char room code
│   ├── GameRoom.tsx                  # Top-level room orchestrator
│   ├── VideoGrid.tsx                 # Clean player video tiles (no per-tile overlays)
│   ├── ModeratorTile.tsx             # ★ Moderator HUD tile:
│   │                                 #     - Live leaderboard (score.updated)
│   │                                 #     - Confetti animation (game.winner / effect.triggered)
│   │                                 #     - "🎙 Speaking" indicator (moderator.speak.started)
│   │                                 #     - Winner banner (session.ended)
│   ├── GameControls.tsx              # Admin panel: start game, skip, end
│   ├── QuestionBanner.tsx            # Shows current trivia question or quickdraw prompt
│   └── EventLog.tsx                  # Debug: scrolling DataChannel event feed
└── lib/
    ├── api.ts                        # Typed fetch wrappers for Game Engine API
    ├── events.ts                     # TypeScript types for game.events.v1 payloads
    └── gameStore.ts                  # React context + useReducer for game state
```

---

## Key npm dependencies

```json
{
  "@livekit/components-react": "^2.x",
  "@livekit/components-styles": "^1.x",
  "livekit-client": "^2.x",
  "react-confetti": "^6.x",
  "next": "^15.x",
  "react": "^19.x"
}
```

---

## Room code flow (user journey)

### Admin path
1. Home (`/`) → "Create Room" form
2. Picks **game type** (Trivia / QuickDraw) and **topic** (trivia) or **category** (quickdraw)
3. Client calls `POST /v1/sessions` → gets `session_id` + `host_token`
4. Room code = first 6 chars of `session_id` uppercased
5. Admin is redirected to `/room/<CODE>`, enters display name, connects to LiveKit with `host_token`
6. Sees the lobby + a "**Start Game**" button and the room code to share with players

### Player path
1. Home → "Join with code" → enters code + display name
2. Client looks up the session by code, calls `POST /v1/sessions/:id/token` with `role: "player"`
3. Connects to LiveKit with the returned `livekit_token`

### Game start
1. Admin clicks "Start Game" → `POST .../actions/start`
2. LiveKit Cloud dispatches the AI Moderator into the room automatically
3. DataChannel events flow: `session.started`, `round.started`, `trivia.question`, …
4. Client reacts: `ModeratorTile` leaderboard updates, question banner appears, mic mutes/unmutes
5. On `game.winner`: **ModeratorTile** plays confetti animation + winner name overlay

---

## Client env vars (`Client/.env.local`)

```dotenv
NEXT_PUBLIC_API_URL=https://api.yourdomain.com   # Game Engine API (public)
```

No secrets in the browser. The Game Engine API owns `LIVEKIT_API_KEY/SECRET`; the client
only ever receives a short-lived `livekit_token` from the API.

---

## DataChannel events the client must handle

| Event type | Client action |
|---|---|
| `session.started` | Show "Game starting…" banner |
| `floor.changed` | Mute/unmute local track based on `floor.mode` |
| `score.updated` | Update leaderboard in **ModeratorTile** |
| `trivia.question` | Show question in `QuestionBanner` |
| `trivia.winner` | Flash winner's name on **ModeratorTile** |
| `quickdraw.prompt` | Show drawing prompt in `QuestionBanner` |
| `quickdraw.correct.detected` | Flash winner's name on **ModeratorTile** |
| `game.winner` | Play confetti + winner banner on **ModeratorTile** |
| `effect.triggered` | If `effect === "confetti"`: trigger confetti on **ModeratorTile** |
| `moderator.speak.started` | Show "🎙 Speaking" indicator on **ModeratorTile** |
| `session.ended` | Show final scores on **ModeratorTile** |

---

## VPS Deployment (DigitalOcean / Linode)

### Server setup (Ubuntu 22.04 — run once)

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Python 3.11 + uv
sudo apt-get install -y python3.11 python3.11-venv
curl -LsSf https://astral.sh/uv/install.sh | sh

# pm2 (process manager for Node + Python processes)
sudo npm install -g pm2

# Nginx + Certbot (SSL)
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### Process layout (pm2)

| pm2 name | Command | Working dir | Port |
|---|---|---|---|
| `game-api` | `node dist/index.js` | repo root | 3000 |
| `game-client` | `npm start` | `Client/` | 3001 |
| `game-moderator` | `uv run agent.py start` | `Moderator/` | none |

```bash
# Game Engine API
cd /path/to/repo
npm run build
pm2 start dist/index.js --name game-api

# Next.js client
cd Client/
npm run build
pm2 start npm --name game-client -- start

# AI Moderator (no HTTP port — connects outbound to LiveKit Cloud)
cd Moderator/
uv sync
pm2 start "uv run agent.py start" --name game-moderator --interpreter none

pm2 save   # persist across reboots
pm2 startup
```

### Nginx config

```nginx
# Client app
server {
    server_name yourdomain.com www.yourdomain.com;
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}

# Game Engine API
server {
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then obtain SSL certs:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
```

### Environment files on VPS

| File | Contains |
|---|---|
| `/repo/.env` | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `API_KEY`, `INTERNAL_AUTH_TOKEN` |
| `/repo/Moderator/.env.local` | Same `LIVEKIT_*` + `GAME_API_URL=http://localhost:3000` + `GAME_API_INTERNAL_TOKEN` + AI service keys |
| `/repo/Client/.env.local` | `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` |

**Critical**: `INTERNAL_AUTH_TOKEN` (API) must equal `GAME_API_INTERNAL_TOKEN` (Moderator).

---

## AI Moderator deployment note

The moderator runs as a **pm2 background process** on the same VPS. It:
- Connects **outbound** to LiveKit Cloud (no inbound port needed)
- Calls `http://localhost:3000` (the API, locally on the same machine)
- Is dispatched automatically by LiveKit Cloud when a new room is created

This means it does **not** need its own domain, firewall port, or Nginx config.

---

## End-to-end verification checklist

1. `pm2 status` on VPS → all three processes `online`
2. `https://yourdomain.com` loads the home page
3. Admin creates a room (Trivia, topic = "Roman History") → gets a 6-char room code
4. Two other browsers join with the room code
5. Admin clicks "Start Game" → `session.started` event fires
6. Moderator logs show: `moderator joined room` + `attached to session`
7. Moderator speaks welcome via TTS — heard in all browsers
8. Moderator asks question, mic mutes for players (`floor.changed`)
9. After question, players unmuted, answer verbally
10. Correct answerer's score updates on the **ModeratorTile** leaderboard (`score.updated`)
11. At 5 points: `game.winner` → confetti plays on **ModeratorTile** in all browsers
