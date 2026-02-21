# LiveKit Cloud Deployment Guide

> **multiplayer-ai-games-api** v1.3.0 · **game-moderator** v0.1.0

This guide explains how to deploy both services that make up the Multiplayer AI Games Platform
and connect them to [LiveKit Cloud](https://cloud.livekit.io) — LiveKit's managed WebRTC
infrastructure.

---

## 1. Overview

The platform consists of two services deployed alongside each other:

| Service | Language | Role |
|---|---|---|
| **Game Engine API** (`multiplayer-ai-games-api`) | Node.js / TypeScript | Control plane — sessions, token minting, game state |
| **AI Moderator** (`game-moderator`) | Python / LiveKit Agents | AI agent — drives game logic, speaks to players, judges answers |

LiveKit Cloud is the **media plane** — it hosts the WebRTC rooms and DataChannel traffic that
both players and the moderator connect to directly.

```
┌─────────────┐  REST   ┌────────────────────────────┐  /internal/v1/*  ┌──────────────────────────┐
│   Client    │────────►│  Game Engine API            │◄─────────────────│  AI Moderator            │
│  (browser / │         │  (Node.js / TypeScript)     │                  │  (Python / LK Agents)    │
│   mobile)   │         │                             │                  │                          │
│             │         │  • mints LiveKit JWT tokens │                  │  • speaks via TTS        │
│             │         │  • manages sessions/state   │                  │  • listens via STT/VAD   │
│             │         │  • exposes /internal/* RPC  │                  │  • judges answers        │
└──────┬──────┘         └────────────┬────────────────┘                  └────────────┬─────────────┘
       │                             │                                                │
       │  livekit_token              │  LIVEKIT_API_KEY / SECRET                      │  LIVEKIT_API_KEY / SECRET
       ▼                             ▼                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      LiveKit Cloud                                               │
│                             wss://your-project.livekit.cloud                                     │
│                    (WebRTC rooms · DataChannels · game.events.v1 topic)                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Neither service proxies media — both sign JWTs and let clients/agents connect directly to
LiveKit Cloud.

---

## 2. Prerequisites

### Game Engine API

| Requirement | Notes |
|---|---|
| **Node.js ≥ 20** | Enforced by `engines` field in `package.json` |
| **npm** | Included with Node.js |

### AI Moderator

| Requirement | Notes |
|---|---|
| **Python 3.11** | Pinned in `Moderator/.python-version` |
| **uv** | Fast Python package manager — `brew install uv` or `pip install uv` |
| **OpenAI account** | GPT-4.1-mini for question generation and answer judging |
| **Cartesia account** | Sonic TTS for the moderator's voice |
| **Deepgram account** | Nova-3 STT for transcribing player speech |

### Shared

| Requirement | Notes |
|---|---|
| **LiveKit Cloud account** | Sign up free at [cloud.livekit.io](https://cloud.livekit.io) |

---

## 3. Step 1 — Create a LiveKit Cloud project

1. Go to [cloud.livekit.io](https://cloud.livekit.io) and sign in (or create an account).
2. Click **New Project** and give it a name.
3. Once created, open the project and navigate to **Settings → Keys**.
4. Note the three values — both services share the same credentials:

   | Value | Example |
   |---|---|
   | **URL** | `wss://my-game-app.livekit.cloud` |
   | **API Key** | `APIfxxxxxxxxxxxxxx` |
   | **API Secret** | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

---

## 4. Step 2 — Configure the Game Engine API

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Then edit `.env` (repo root):

```dotenv
# Server
PORT=3000
HOST=0.0.0.0

# LiveKit Cloud — from your project's Settings → Keys page
LIVEKIT_API_KEY=APIfxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LIVEKIT_URL=wss://my-game-app.livekit.cloud

# Auth — change these to strong random strings in production
API_KEY=your-api-key
INTERNAL_AUTH_TOKEN=your-internal-token   # <-- moderator must use this same value

# Optional
LOG_LEVEL=info
```

Variable reference:

| Variable | Used by | Required | Default |
|---|---|---|---|
| `LIVEKIT_API_KEY` | Token minting (`AccessToken`) | Yes | — |
| `LIVEKIT_API_SECRET` | Token minting (`AccessToken`) | Yes | — |
| `LIVEKIT_URL` | Returned to clients as connection target | Yes | — |
| `API_KEY` | Bearer auth on public endpoints | Yes | `dev-api-key` |
| `INTERNAL_AUTH_TOKEN` | Bearer auth on `/internal/*` endpoints | Yes | `dev-internal-token` |
| `PORT` | Fastify listen port | No | `3000` |
| `HOST` | Fastify listen host | No | `0.0.0.0` |
| `LOG_LEVEL` | Fastify/Pino log level | No | `info` |

---

## 5. Step 3 — Configure the AI Moderator

Edit `Moderator/.env.local` (the moderator loads this file on startup):

```dotenv
# LiveKit Cloud — same credentials as the API
LIVEKIT_URL=wss://my-game-app.livekit.cloud
LIVEKIT_API_KEY=APIfxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Game Engine API connection
GAME_API_URL=http://localhost:3000         # URL where the API is reachable
GAME_API_INTERNAL_TOKEN=your-internal-token  # must match API's INTERNAL_AUTH_TOKEN exactly

# AI service keys
OPENAI_API_KEY=sk-...
CARTESIA_API_KEY=...
DEEPGRAM_API_KEY=...
```

Variable reference:

| Variable | Used by | Required | Default |
|---|---|---|---|
| `LIVEKIT_URL` | LiveKit Agents framework (joins rooms) | Yes | — |
| `LIVEKIT_API_KEY` | LiveKit Agents framework | Yes | — |
| `LIVEKIT_API_SECRET` | LiveKit Agents framework | Yes | — |
| `GAME_API_URL` | `ApiClient` — all `/internal/v1/*` calls | No | `http://localhost:3000` |
| `GAME_API_INTERNAL_TOKEN` | `ApiClient` — `Authorization` header | No | `dev-internal-token` |
| `OPENAI_API_KEY` | LLM (GPT-4.1-mini) for question gen + judging | Yes | — |
| `CARTESIA_API_KEY` | TTS (Sonic) for moderator voice | Yes | — |
| `DEEPGRAM_API_KEY` | STT (Nova-3) for player speech | Yes | — |

> **Critical**: `GAME_API_INTERNAL_TOKEN` must equal `INTERNAL_AUTH_TOKEN` in the API's `.env`.
> If they differ, every moderator call to `/internal/v1/*` will return `401 Unauthorized`.

> **Security**: never commit either `.env` or `.env.local` to version control.

---

## 6. Step 4 — Build and run the Game Engine API

### Production

```bash
npm install
npm run build   # tsup → dist/
npm start       # node dist/index.js
```

### Development (hot-reload)

```bash
npm install
npm run dev     # tsx watch src/index.ts
```

The server listens on `http://<HOST>:<PORT>` (default: `http://0.0.0.0:3000`).

---

## 7. Step 5 — Run the AI Moderator

```bash
cd Moderator
uv sync                    # install deps into .venv (first run only)
uv run agent.py dev        # development mode — auto-reload, verbose logging
uv run agent.py start      # production mode
```

The moderator runs as a **LiveKit Agent worker**. It does not expose an HTTP port of its own —
it connects outbound to LiveKit Cloud and polls for rooms to join. When LiveKit Cloud dispatches
it into a game room, `GameModerator.on_enter()` fires and the moderator calls
`POST /internal/v1/sessions/:id/attach` to register itself with the API.

AI models used (as configured in `Moderator/agent.py`):
- **STT**: Deepgram Nova-3
- **LLM**: OpenAI GPT-4.1-mini
- **TTS**: Cartesia Sonic
- **VAD**: Silero (local, no API key required)

---

## 8. Step 6 — Verify the connection

Run through these steps after both services start.

### 8.1 Health check (API)

```bash
curl -s http://localhost:3000/internal/v1/health | jq .
```

Expected: `200 OK` with `version: "1.3.0"` and `uptime_seconds`.

### 8.2 Create a session

```bash
curl -s -X POST http://localhost:3000/v1/sessions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"room_name": "test-room", "game_type": "trivia"}' | jq .
```

Save the returned `session_id`.

### 8.3 Mint a participant token

```bash
SESSION_ID="<session_id from above>"

curl -s -X POST http://localhost:3000/v1/sessions/$SESSION_ID/token \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identity": "player-1", "display_name": "Alice"}' | jq .
```

The response includes `livekit_token` (signed JWT) and `livekit_url`.

### 8.4 Connect a client and watch the moderator join

Pass `livekit_token` and `livekit_url` to any LiveKit client SDK:

```typescript
import { Room } from "livekit-client";

const room = new Room();
await room.connect(livekitUrl, livekitToken);
// LiveKit Cloud dispatches the AI Moderator into the room automatically
```

Within a few seconds, the running moderator worker will be dispatched into the room. Check its
logs for a line like:

```
moderator joined room: test-room
attached to session sess_... as moderator-ai
```

---

## 9. Full lifecycle walkthrough

This shows the complete flow once both services are running:

```
Client              Game Engine API          AI Moderator          LiveKit Cloud
  │                       │                       │                      │
  │  POST /v1/sessions    │                       │                      │
  │──────────────────────►│                       │                      │
  │  { session_id, … }    │                       │                      │
  │◄──────────────────────│                       │                      │
  │                       │                       │                      │
  │  POST …/token         │                       │                      │
  │──────────────────────►│                       │                      │
  │  { livekit_token,     │                       │                      │
  │    livekit_url }      │                       │                      │
  │◄──────────────────────│                       │                      │
  │                       │                       │                      │
  │  room.connect(…)      │                       │                      │
  │──────────────────────────────────────────────────────────────────────►│
  │  (in room)            │                       │                      │
  │◄──────────────────────────────────────────────────────────────────────│
  │                       │                       │                      │
  │                       │                       │  dispatched (room)   │
  │                       │                       │◄─────────────────────│
  │                       │  POST …/attach        │                      │
  │                       │◄──────────────────────│                      │
  │                       │  { moderator_identity }│                      │
  │                       │───────────────────────►│                      │
  │                       │                       │                      │
  │                       │  GET …/snapshot       │                      │
  │                       │◄──────────────────────│                      │
  │                       │  { game: "trivia" }   │                      │
  │                       │───────────────────────►│                      │
  │                       │                       │                      │
  │◄── DataChannel (game.events.v1) ─────────────────────────────────────│
  │      moderator.speak.started                  │                      │
  │      round.started, question.asked …          │                      │
  │                       │                       │                      │
  │── player speaks ────────────────────────────────────────────────────►│
  │                       │                       │  STT transcript      │
  │                       │  POST …/trivia-answer │◄─────────────────────│
  │                       │◄──────────────────────│                      │
  │◄── DataChannel: participant.scored ───────────────────────────────────│
  │                       │                       │                      │
  │                       │  POST …/detach        │  (session ends)      │
  │                       │◄──────────────────────│                      │
```

---

## 10. Deployment options

### Game Engine API

#### Local / bare VM

```bash
cp .env.example .env   # fill in real values
npm install && npm run build && npm start
```

Use `pm2` or a systemd unit to keep the process alive.

#### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
docker build -t multiplayer-ai-games-api .
docker run -p 3000:3000 \
  -e LIVEKIT_API_KEY=... \
  -e LIVEKIT_API_SECRET=... \
  -e LIVEKIT_URL=wss://my-game-app.livekit.cloud \
  -e API_KEY=... \
  -e INTERNAL_AUTH_TOKEN=... \
  multiplayer-ai-games-api
```

#### Railway / Render / Fly.io

1. Connect the repository to the platform.
2. Set all API env vars in the dashboard.
3. Build command: `npm run build` · Start command: `npm start`.

#### Scaling note

Session state is held **in-memory** (`SessionStore`). Multiple instances will drop cross-instance
requests. Use sticky sessions or an external state store (e.g. Redis) for horizontal scaling.

---

### AI Moderator

#### Local / bare VM

```bash
cd Moderator
# Edit .env.local — set GAME_API_URL to wherever the API is reachable
uv sync
uv run agent.py start
```

The moderator does not need to be on the same machine as the API — just set `GAME_API_URL`
to the API's public URL.

#### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install uv
COPY Moderator/pyproject.toml Moderator/uv.lock ./
RUN uv sync --no-dev
COPY Moderator/ .
CMD ["uv", "run", "agent.py", "start"]
```

```bash
docker build -f Moderator.Dockerfile -t game-moderator .
docker run \
  -e LIVEKIT_URL=wss://my-game-app.livekit.cloud \
  -e LIVEKIT_API_KEY=... \
  -e LIVEKIT_API_SECRET=... \
  -e GAME_API_URL=https://your-api-host.example.com \
  -e GAME_API_INTERNAL_TOKEN=... \
  -e OPENAI_API_KEY=... \
  -e CARTESIA_API_KEY=... \
  -e DEEPGRAM_API_KEY=... \
  game-moderator
```

#### Railway / Render / Fly.io

1. Point the platform at the `Moderator/` subdirectory (or use a monorepo build root).
2. Set all moderator env vars in the dashboard.
3. Start command: `uv run agent.py start`.

---

## 11. Architecture summary

The platform has three distinct layers:

```
┌─────────────────────────────────────────────────────────────────────┐
│  CONTROL PLANE — Game Engine API (Node.js)                         │
│  • REST endpoints for clients (/v1/*)                               │
│  • Internal RPC for the moderator (/internal/v1/*)                 │
│  • In-memory session + game state                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ▲ /internal/v1/* (HTTP)
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  AI AGENT — Moderator (Python / LiveKit Agents)                    │
│  • Connects to LiveKit Cloud as a room participant                  │
│  • Speaks (Cartesia TTS), listens (Deepgram STT), judges (GPT-4.1) │
│  • Posts game decisions to the control plane                        │
└─────────────────────────────────────────────────────────────────────┘
                              ▲ WebRTC + DataChannels
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  MEDIA PLANE — LiveKit Cloud                                        │
│  • Hosts WebRTC rooms                                               │
│  • Routes DataChannel messages (game.events.v1 topic)              │
│  • Dispatches the moderator agent when a room is created            │
└─────────────────────────────────────────────────────────────────────┘
```

The token-signing flow (in `SessionStore.mintLiveKitToken()`, `src/state/SessionStore.ts`):

```typescript
private async mintLiveKitToken(roomName: string, identity: string): Promise<string> {
  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity,
  });
  at.addGrant({ roomJoin: true, room: roomName });
  return await at.toJwt();
}
```

The API mints tokens for both players and (via `/internal/v1/sessions/:id/attach`) for the
moderator. All media and DataChannel traffic then flows directly — neither service ever proxies
WebRTC.
