# Multiplayer AI Games Platform API

> Real-time, AI-moderated multiplayer game engine built on LiveKit. Supports **Trivia** and **Quick Draw** game modes with voice-controlled interactions, computer vision judging, and live floor control.

**Version** `1.3.0` &nbsp;|&nbsp; **License** Apache-2.0 &nbsp;|&nbsp; **Node** >= 20 &nbsp;|&nbsp; **Runtime** Fastify 5 + TypeScript

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [API Reference](#api-reference)
  - [Sessions](#sessions)
  - [Admin Controls](#admin-controls)
  - [Floor Control](#floor-control)
  - [Trivia](#trivia)
  - [Quick Draw](#quickdraw)
  - [Snapshots & Observability](#snapshots--observability)
  - [Webhooks](#webhooks)
- [Internal APIs](#internal-apis)
  - [Moderator Control](#moderator-control)
  - [Text-to-Speech (TTS)](#text-to-speech-tts)
  - [Speech-to-Text (STT)](#speech-to-text-stt)
  - [Vision](#vision)
  - [Decisions](#decisions)
- [Realtime Events](#realtime-events)
- [Data Models](#data-models)
- [Changelog](#changelog)

---

## Architecture Overview

```
┌─────────────┐    REST     ┌──────────────────┐   LiveKit DataChannel
│  Client App  │ ─────────► │   Game Engine     │ ◄──────────────────────┐
│  (Host/Player)│           │   (Public API)    │                        │
└─────────────┘            └────────┬─────────┘                        │
                                    │                                   │
                            ┌───────▼─────────┐    game.events.v1      │
                            │   Session State  │ ──────────────────► LiveKit Room
                            │   + Event Bus    │                        │
                            └───────┬─────────┘                        │
                                    │                                   │
                           ┌────────▼──────────┐                       │
                           │  Moderator AI      │ ──────────────────────┘
                           │  (Internal APIs)   │
                           │  TTS · STT · Vision│
                           └───────────────────┘
```

The platform has three API layers:

| Layer | Base URL | Purpose |
|-------|----------|---------|
| **Public REST API** | `https://api.yourco.com` | Session management, admin controls, game config |
| **Internal Moderator API** | `http://moderator-internal.yourco.local` | AI adapter for TTS/STT/Vision + decision ingest |
| **Realtime Events** | LiveKit DataChannel `game.events.v1` | Typed event envelopes pushed to all participants |

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **Python** >= 3.11
- **uv** — Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/))
- Accounts with: **LiveKit Cloud**, **OpenAI**, **Deepgram**, **Cartesia**

### API Keys

You need credentials from four services plus two self-chosen secrets:

| Key | Used By | Where to Get It |
|-----|---------|-----------------|
| `LIVEKIT_API_KEY` | Both services | [LiveKit Cloud](https://cloud.livekit.io) — project settings |
| `LIVEKIT_API_SECRET` | Both services | [LiveKit Cloud](https://cloud.livekit.io) — project settings |
| `LIVEKIT_URL` | Both services | [LiveKit Cloud](https://cloud.livekit.io) — `wss://your-project.livekit.cloud` |
| `OPENAI_API_KEY` | Moderator | [OpenAI Platform](https://platform.openai.com/api-keys) — powers question generation + answer judging |
| `DEEPGRAM_API_KEY` | Moderator | [Deepgram Console](https://console.deepgram.com) — speech-to-text (Nova-3) |
| `CARTESIA_API_KEY` | Moderator | [Cartesia](https://cartesia.ai) — text-to-speech (Sonic) |
| `API_KEY` | Game Engine | You choose — authenticates public API clients |
| `INTERNAL_AUTH_TOKEN` | Game Engine | You choose — must match `GAME_API_INTERNAL_TOKEN` in the moderator |

### Environment Setup

**1. Game Engine** — copy the example and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
PORT=3000
HOST=0.0.0.0
LIVEKIT_API_KEY=<your-livekit-api-key>
LIVEKIT_API_SECRET=<your-livekit-api-secret>
LIVEKIT_URL=wss://<your-project>.livekit.cloud
API_KEY=<choose-a-secret-for-public-api>
INTERNAL_AUTH_TOKEN=<choose-a-shared-internal-secret>
LOG_LEVEL=info
```

**2. Moderator** — edit the existing placeholder file:

```bash
# moderator/.env.local
LIVEKIT_API_KEY=<same-key-as-above>
LIVEKIT_API_SECRET=<same-secret-as-above>
LIVEKIT_URL=wss://<same-project>.livekit.cloud
GAME_API_URL=http://localhost:3000
GAME_API_INTERNAL_TOKEN=<same-shared-internal-secret>
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=<your-deepgram-key>
CARTESIA_API_KEY=<your-cartesia-key>
```

> **Important:** `INTERNAL_AUTH_TOKEN` (Game Engine) and `GAME_API_INTERNAL_TOKEN` (Moderator) must be the same value — this is how the moderator authenticates its API calls to the Game Engine.

### Running Both Services

Both services need to be running simultaneously. Start each in its own terminal:

**Terminal 1 — Game Engine API:**

```bash
npm install
npm run dev          # development with hot reload
# or: npm run build && npm start   # production
```

**Terminal 2 — AI Moderator:**

```bash
cd moderator
uv sync              # install Python dependencies
uv run agent.py dev  # development with auto-reload
# or: uv run agent.py start   # production
```

The Game Engine serves on `http://localhost:3000`. The moderator connects to LiveKit Cloud and communicates with the Game Engine via its internal API.

### Create a game session flow

```bash
# 1. Create a session
curl -X POST https://api.yourco.com/v1/sessions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "game": "trivia",
    "livekit": { "room_name": "my-trivia-room" },
    "config": {
      "max_players": 6,
      "win_condition": { "type": "first_to_points", "points": 5 }
    }
  }'

# 2. Mint tokens for players
curl -X POST https://api.yourco.com/v1/sessions/sess_abc123/participants:token \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "identity": "player_1",
    "display_name": "Alice",
    "role": "player"
  }'

# 3. Start the session
curl -X POST https://api.yourco.com/v1/sessions/sess_abc123/actions/start \
  -H "Authorization: Bearer $SESSION_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "auto", "lobby_grace_seconds": 10 }'
```

---

## Authentication

Three auth schemes are used depending on the endpoint:

| Scheme | Header | Used For |
|--------|--------|----------|
| `ApiKeyAuth` | `Authorization: Bearer <API_KEY>` | Public endpoints (session create, token minting) |
| `SessionAdminAuth` | `Authorization: Bearer <SESSION_ADMIN_TOKEN>` | Admin actions (start, pause, mute, floor control) |
| `InternalAuth` | `Authorization: Bearer <INTERNAL_TOKEN>` | Internal moderator adapter APIs |

The `session_admin_token` is returned in the `CreateSession` response. Internal tokens are configured at the infrastructure level.

### Roles

| Role | Description | Typical Use |
|------|-------------|-------------|
| `host` | The player who created the room and runs the game. Has player privileges plus the ability to configure game settings (e.g., trivia topic, Quick Draw category). | The person who starts the call and invites others |
| `admin` | Non-playing operator with full session control. Can start/pause/end sessions, override scores, and manage participants. Uses the `session_admin_token`. | A backend service or dashboard operator managing sessions |
| `player` | A regular game participant. Can answer questions (trivia) or hold up drawings (Quick Draw). Has no admin privileges. | Anyone joining to play the game |
| `spectator` | A view-only participant. Receives all realtime events but cannot interact with the game. | Audience members watching a live game |
| `moderator` | The AI bot that joins the LiveKit room as a participant. Speaks via TTS, listens via STT, watches via Vision, and controls game flow. Assigned automatically on `attach`. | The Voice AI Bot — never assigned manually |

> **`host` vs `admin`**: A `host` is a player who also has configuration privileges — they participate in the game while managing it. An `admin` is a non-playing operator who controls the session externally (e.g., from a dashboard). In many setups, the same person may hold both roles, but they serve different purposes: `host` = in-game authority, `admin` = system-level authority.

---

## API Reference

### Sessions

#### `POST /v1/sessions` — Create a game session

Creates a new game session and provisions a LiveKit room.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `game` | `trivia` \| `quick_draw` | Yes | Game type |
| `livekit.room_name` | string | Yes | LiveKit room name |
| `livekit.room_region` | string | No | Preferred region |
| `config` | SessionConfig | No | Session configuration |
| `metadata` | object | No | Arbitrary key-value metadata |

**Session Config**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_players` | integer | `6` | Max players (2–50) |
| `language` | string | `en-US` | Language code |
| `moderator_voice` | string | `default` | TTS voice preset |
| `win_condition` | WinCondition | — | Game win condition |
| `voice_rules` | VoiceRules | — | Audio discipline / quiet gate |
| `debug_events` | `none` \| `host_only` \| `all` | — | Debug event delivery |
| `evidence_mode` | `off` \| `winner_only` \| `all_correct_candidates` | — | Evidence frame storage |
| `privacy` | PrivacyConfig | — | Data retention settings |

<details>
<summary><strong>Voice Rules (Quiet Gate)</strong></summary>

Controls the quiet gate — requiring silence before the moderator delivers prompts.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `require_quiet_before_prompt` | boolean | `true` | Wait for silence before prompts |
| `quiet_ms` | integer | `1000` | Required continuous silence (200–10000 ms) |
| `max_wait_ms` | integer | `8000` | Max wait before timeout (1000–30000 ms) |
| `noise_threshold_db` | number | `-40` | dBFS level below which = silent (-80 to 0) |

</details>

**Response** — `200 OK`

```json
{
  "session_id": "sess_abc123",
  "game": "trivia",
  "status": "created",
  "livekit": { "room_name": "my-trivia-room" },
  "tokens": {
    "host_token": "...",
    "moderator_token": "...",
    "session_admin_token": "..."
  },
  "realtime": {
    "transport": "livekit_datachannel",
    "topic": "game.events.v1"
  }
}
```

---

#### `POST /v1/sessions/{session_id}/participants:token` — Mint participant token

Generates a LiveKit token for a participant to join the room.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identity` | string | Yes | Unique participant ID |
| `display_name` | string | No | Display name |
| `role` | `host` \| `admin` \| `player` \| `spectator` \| `moderator` | Yes | Participant role |
| `metadata` | object | No | Custom metadata |

**Response** — `200 OK`

```json
{
  "livekit_token": "eyJ...",
  "participant": {
    "identity": "player_1",
    "display_name": "Alice",
    "role": "player",
    "score": 0,
    "muted": false
  }
}
```

---

### Admin Controls

All admin endpoints require `SessionAdminAuth`.

#### `POST /v1/sessions/{session_id}/actions/start` — Start session

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `auto` | `auto` | Start mode |
| `lobby_grace_seconds` | integer | `10` | Grace period before game begins (0–300) |

#### `POST /v1/sessions/{session_id}/actions/pause` — Pause session

#### `POST /v1/sessions/{session_id}/actions/resume` — Resume session

#### `POST /v1/sessions/{session_id}/actions/end` — End session

> Pause, resume, and end accept an optional `{ "reason": "..." }` body.

---

#### `POST /v1/sessions/{session_id}/actions/participants/mute` — Mute participants

Mute by identity list **or** role-based targeting. Supports timed muting.

```json
{
  "target_roles": ["player"],
  "exclude_roles": ["host"],
  "reason": "Moderator is speaking",
  "duration_ms": 5000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `participant_identities` | string[] | Explicit identity list (takes precedence) |
| `target_roles` | ParticipantRole[] | Role-based targeting |
| `exclude_roles` | ParticipantRole[] | Roles to exclude |
| `reason` | string | Optional reason (max 200 chars) |
| `duration_ms` | integer | Auto-unmute after duration (0–600000 ms) |

**Response**: `{ "ok": true, "affected_identities": ["player_1", "player_2"] }`

#### `POST /v1/sessions/{session_id}/actions/participants/unmute` — Unmute participants

Same targeting fields as mute (without `duration_ms`).

---

#### `POST /v1/sessions/{session_id}/actions/override-score` — Override score

```json
{
  "participant_identity": "player_1",
  "delta": 2,
  "reason": "Bonus for creativity"
}
```

#### `POST /v1/sessions/{session_id}/actions/skip` — Skip question/round

```json
{
  "scope": "current_question",
  "reason": "Question was unfair"
}
```

`scope`: `current_question` | `current_round`

#### `POST /v1/sessions/{session_id}/actions/trigger-effect` — Trigger effect

Broadcasts a visual/audio effect to all clients.

```json
{
  "effect": "confetti",
  "target_identity": "player_1",
  "duration_ms": 5000,
  "data": {}
}
```

`effect`: `confetti` | `spotlight` | `shake` | `flash` | `custom`

---

### Floor Control

Semantic layer above mute/unmute. Controls who may speak in the room. Emits `floor.changed` events.

#### `POST /v1/sessions/{session_id}/actions/floor` — Set floor control

```json
{
  "mode": "moderator_only",
  "duration_ms": 15000,
  "reason": "Reading question"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `open` \| `moderator_only` \| `roles_only` | Floor mode |
| `allowed_roles` | ParticipantRole[] | Roles that may speak (when `roles_only`) |
| `allowed_identities` | string[] | Explicit identities (additive with roles) |
| `duration_ms` | integer | Auto-release timer (null = hold indefinitely) |
| `reason` | string | Optional reason |

**Response**:

```json
{
  "ok": true,
  "floor": {
    "mode": "moderator_only",
    "expires_at_ms": 1708012345000
  }
}
```

#### `POST /v1/sessions/{session_id}/actions/floor/release` — Release floor

Reverts to `open` mode. Accepts optional `{ "reason": "..." }`.

---

### Trivia

#### `POST /v1/sessions/{session_id}/trivia/topic` — Set trivia topic

```json
{
  "topic": "90s Pop Culture",
  "difficulty": "medium",
  "question_count": 10
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `topic` | string | — | Topic (max 120 chars) |
| `difficulty` | `easy` \| `medium` \| `hard` \| `mixed` | — | Question difficulty |
| `question_count` | integer | `10` | Number of questions (1–50) |

**Round Phases**: `lobby` → `asking` → `listening` → `judging` → `reveal` → `ended`

---

### QuickDraw

#### `POST /v1/sessions/{session_id}/quickdraw/config` — Configure Quick Draw

```json
{
  "category": "Animals",
  "difficulty": "easy",
  "prompt_count": 10,
  "round_duration_ms": 25000
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | — | Drawing category (max 120 chars) |
| `difficulty` | Difficulty | — | Prompt difficulty |
| `prompt_count` | integer | `10` | Number of prompts (1–50) |
| `round_duration_ms` | integer | `25000` | Time per round (5000–600000 ms) |

**Round Phases**: `lobby` → `prompting` → `running` → `judging` → `ended`

---

### Snapshots & Observability

#### `GET /v1/sessions/{session_id}/snapshot` — Get session snapshot

Returns full current state including participants, round info, game-specific state, and floor control.

#### `GET /v1/sessions/{session_id}/events` — Get event log

Paginated event history.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `after_seq` | integer | `0` | Return events after this sequence number |
| `limit` | integer | `200` | Page size (1–1000) |

---

### Webhooks

#### `POST /v1/webhooks` — Register webhook

```json
{
  "url": "https://yourapp.com/hooks/game",
  "events": ["session.started", "session.ended", "game.winner", "score.updated"],
  "secret": "whsec_..."
}
```

**Available webhook events**: `session.started`, `session.ended`, `round.ended`, `score.updated`, `game.winner`, `effect.triggered`, `floor.changed`, `participants.mute.changed`, `error.raised`

---

## Internal APIs

> Base URL: `http://moderator-internal.yourco.local` — requires `InternalAuth`.

### Health

#### `GET /internal/v1/health`

No auth required. Returns `{ "ok": true, "version": "1.3.0", "uptime_seconds": 12345 }`.

---

### Moderator Control

#### `POST /internal/v1/sessions/{session_id}/attach` — Attach moderator

Connects the AI moderator to a session's LiveKit room.

```json
{
  "livekit": {
    "room_name": "my-trivia-room",
    "moderator_token": "..."
  },
  "realtime": { "topic": "game.events.v1" },
  "game": "trivia"
}
```

#### `POST /internal/v1/sessions/{session_id}/detach` — Detach moderator

#### `POST /internal/v1/sessions/{session_id}/advance-round` — Advance round

Game-agnostic round advancement. For trivia: next question. For Quick Draw: next prompt. If win condition is met, emits `game.winner` + `session.ended` instead.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `delay_ms` | integer | `0` | Delay before advancing (0–30000 ms) |

**Response**: `{ "ok": true, "action": "advanced", "round_index": 3 }` or `{ "ok": true, "action": "session_ended" }`

---

### Text-to-Speech (TTS)

#### `POST /internal/v1/tts/speak` — Synthesize speech

```json
{
  "session_id": "sess_abc123",
  "text": "Question number 3: What is the capital of France?",
  "speak_mode": "question",
  "voice": "default",
  "rate": 1.0,
  "output": {
    "codec": "pcm_s16le",
    "sample_rate_hz": 48000
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `session_id` | string | — | Session to speak in |
| `text` | string | — | Text to synthesize (max 2000 chars) |
| `speak_mode` | string | `freeform` | Semantic tag: `question`, `warning`, `reveal`, `announcement`, `freeform` |
| `language` | string | `en-US` | Language code |
| `voice` | string | `default` | Voice preset |
| `rate` | number | `1.0` | Speed (0.5–2.0) |
| `pitch` | number | `0` | Pitch adjustment (-20 to 20) |

**Response**: Returns `job_id` and `speak_id` for tracking and event correlation.

#### `GET /internal/v1/tts/jobs/{job_id}` — Get TTS job status

Returns job status (`queued` | `running` | `done` | `error`) and audio reference.

---

### Speech-to-Text (STT)

#### `POST /internal/v1/stt/streams` — Create STT stream

Creates a per-participant speech recognition stream.

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Session ID |
| `participant_identity` | string | Who is speaking |
| `round_id` | string | Associates with a game round |
| `question_id` | string | Associates with a specific question (trivia) |
| `language` | string | Language code |
| `audio` | object | Codec config (`pcm_s16le`, sample rate, channels) |
| `callbacks.result_url` | string | URL for result push notifications |

#### `POST /internal/v1/stt/streams/{stream_id}/feed` — Feed audio

Send audio frames as base64-encoded chunks with timestamps.

```json
{
  "frames": [
    { "ts_ms": 1000, "bytes_base64": "...", "is_speech": true },
    { "ts_ms": 1020, "bytes_base64": "..." }
  ]
}
```

#### `GET /internal/v1/stt/streams/{stream_id}/results` — Get results

Returns transcription results with confidence scores and optional word-level timing.

#### `POST /internal/v1/stt/streams/{stream_id}/close` — Close stream

---

### Vision

#### `POST /internal/v1/vision/paper-detect` — Detect paper (one-shot)

Detects paper-like regions in a video frame for Quick Draw.

#### `POST /internal/v1/vision/quickdraw-judge` — Judge drawing (one-shot)

Compares a drawing against a prompt and returns a correctness judgment with confidence.

```json
{
  "session_id": "sess_abc123",
  "participant_identity": "player_1",
  "prompt": "cat",
  "image": { "content_type": "image/jpeg", "bytes_base64": "..." }
}
```

**Response**: `{ "correct": true, "confidence": 0.92, "rationale": "Drawing shows a cat with ears and tail" }`

#### Vision Streams (continuous analysis)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/internal/v1/vision/streams` | POST | Create vision stream |
| `/internal/v1/vision/streams/{id}/feed` | POST | Feed video frames |
| `/internal/v1/vision/streams/{id}/results` | GET | Get buffered results |
| `/internal/v1/vision/streams/{id}/close` | POST | Close stream |

---

### Decisions

Decision endpoints allow the moderator AI to submit final judgments.

#### `POST /internal/v1/decisions/trivia-answer` — Ingest trivia answer

```json
{
  "session_id": "sess_abc123",
  "round_id": "rnd_001",
  "question_id": "q_007",
  "participant_identity": "player_1",
  "is_correct": true,
  "canonical_answer": "Paris",
  "answer_time_ms": 2340,
  "transcript": "Paris",
  "confidence": 0.97
}
```

#### `POST /internal/v1/decisions/quickdraw-correct` — Ingest Quick Draw judgment

```json
{
  "session_id": "sess_abc123",
  "round_id": "rnd_003",
  "participant_identity": "player_2",
  "frame_time_ms": 12500,
  "correct": true,
  "confidence": 0.88,
  "evidence": { "frame_id": "frm_456" }
}
```

---

## Realtime Events

Events are delivered as typed JSON envelopes via LiveKit DataChannel on topic `game.events.v1`.

### Event Envelope

```json
{
  "v": 1,
  "session_id": "sess_abc123",
  "seq": 42,
  "ts_ms": 1708012345000,
  "type": "trivia.question",
  "payload": { ... }
}
```

### Event Types

#### Session Lifecycle

| Event | Description |
|-------|-------------|
| `snapshot.full` | Full state snapshot (sent on join / reconnect) |
| `session.started` | Session has started |
| `session.paused` | Session paused (includes `reason`) |
| `session.resumed` | Session resumed |
| `session.ended` | Session ended — includes `winner_identity` and `final_scores` |

#### Game Flow

| Event | Description |
|-------|-------------|
| `round.started` | New round began (includes `round_id`, `ends_at_ms`) |
| `round.ended` | Round ended (includes `winner_identity`, `tie`) |
| `score.updated` | Participant score changed (includes `delta`) |
| `game.winner` | Game won — includes final scores, win condition, and leaderboard |

#### Moderator

| Event | Description |
|-------|-------------|
| `moderator.speak.started` | Moderator began speaking — includes `speak_id`, `text`, `mode` |
| `moderator.speak.ended` | Moderator finished speaking — correlates via `speak_id` |

#### Floor & Audio Control

| Event | Description |
|-------|-------------|
| `floor.changed` | Floor control mode changed (set, released, or auto-expired) |
| `participants.mute.changed` | Mute state changed — includes `source` (`admin`, `floor_control`, `auto_unmute`, `quiet_gate`, `system`) |
| `quiet.achieved` | Quiet gate satisfied — all silent for `quiet_ms` |
| `quiet.timeout` | Quiet gate timed out — includes `offenders` list with `level_db` |

#### Trivia-Specific

| Event | Payload Highlights |
|-------|-------------------|
| `trivia.question` | `round_id`, `question_id`, `prompt`, `answer_window_ms`, `unmute_at_ms` |
| `trivia.answer.detected` | `participant_identity`, `transcript`, `confidence`, `answer_time_ms` |
| `trivia.winner` | `winner_identity`, `answer`, `reason` (`first_correct` \| `host_override`) |

#### Quick Draw-Specific

| Event | Payload Highlights |
|-------|-------------------|
| `quickdraw.prompt` | `round_id`, `prompt`, `category`, `round_duration_ms`, `unmute_at_ms` |
| `quickdraw.correct.detected` | `participant_identity`, `confidence`, `evidence` |
| `quickdraw.winner` | `winner_identity`, `win_time_ms`, `confidence`, `tie` |

#### System

| Event | Description |
|-------|-------------|
| `effect.triggered` | Visual/audio effect broadcast (`confetti`, `spotlight`, `shake`, `flash`, `custom`) |
| `error.raised` | Error occurred — includes `code`, `message`, `detail` |

---

## Data Models

### ID Formats

| Resource | Pattern | Example |
|----------|---------|---------|
| Session | `sess_[A-Za-z0-9_-]+` | `sess_abc123` |
| TTS Job | `job_[A-Za-z0-9_-]+` | `job_tts_001` |
| STT Stream | `stt_[A-Za-z0-9_-]+` | `stt_p1_rnd3` |
| Vision Stream | `vis_[A-Za-z0-9_-]+` | `vis_p1_rnd3` |
| Speak ID | `spk_[A-Za-z0-9_-]+` | `spk_q7_ask` |

### Enums

| Enum | Values |
|------|--------|
| GameType | `trivia`, `quick_draw` |
| SessionStatus | `created`, `running`, `paused`, `ended`, `error` |
| ParticipantRole | `host`, `admin`, `player`, `spectator`, `moderator` |
| Difficulty | `easy`, `medium`, `hard`, `mixed` |
| FloorMode | `open`, `moderator_only`, `roles_only` |
| Effect | `confetti`, `spotlight`, `shake`, `flash`, `custom` |

### Participant

```typescript
{
  identity: string
  display_name?: string
  role: ParticipantRole
  score: number        // default: 0
  muted: boolean       // default: false
  joined_at_ms?: number
  metadata?: Record<string, any>
}
```

### Win Condition

```typescript
{
  type: "first_to_points"
  points: number  // 1–100, default: 5
}
```

---

## Changelog

### v1.3.0

- **Floor control**: `POST .../actions/floor` + `POST .../actions/floor/release` with `floor.changed` event
- **Quiet gate**: `voice_rules` in SessionConfig with `quiet.achieved` + `quiet.timeout` events
- **Mute events**: `participants.mute.changed` event for client-side mute UI
- **Moderator speech**: Split into `moderator.speak.started` + `moderator.speak.ended` events with `speak_id` correlation and `speak_mode` semantics
- **STT context**: Added `round_id` and `question_id` to `CreateSttStreamRequest`

### v1.2.0

- Renamed `advance-question` to `advance-round` (game-agnostic)
- Added `POST .../quickdraw/config` for prompt configuration
- Added `prompting` phase to QuickDraw round phases
- Added `mute_policy` to QuickDrawState
- Added vision stream lifecycle API

### v1.1.0

- Added `game.winner` and `effect.triggered` events
- Enriched `session.ended` with winner + final scores
- Added role-based mute/unmute targeting
- Added `POST .../actions/trigger-effect` endpoint
