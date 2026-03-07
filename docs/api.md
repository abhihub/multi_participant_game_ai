# MultiParticipantGameAI API Reference

## Overview

The MultiParticipantGameAI API lets you drop an AI game moderator into any LiveKit-based video call. You create a session tied to an existing LiveKit room, mint tokens for each participant, and start the session — the AI moderator joins the room automatically and runs the game (trivia or quick draw) from start to finish, including voice, scoring, and winner announcement.

You need a valid API key and a LiveKit room already created in your LiveKit project. All game events flow to participants in real time via a LiveKit DataChannel on the topic `game.events.v1`.

---

## Quick Start

### 1. Create a session

```bash
curl -X POST https://api.example.com/v1/sessions \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "game": "trivia",
    "livekit": {
      "room_name": "my-room-123"
    },
    "config": {
      "max_players": 6,
      "win_condition": { "type": "first_to_points", "points": 5 }
    }
  }'
```

**Response:**

```json
{
  "session_id": "sess_abc123",
  "game": "trivia",
  "status": "created",
  "livekit": { "room_name": "my-room-123", "room_region": null },
  "tokens": {
    "host_token": "<livekit_jwt>",
    "moderator_token": "<livekit_jwt>",
    "session_admin_token": "<opaque_token>"
  },
  "realtime": {
    "transport": "livekit_datachannel",
    "topic": "game.events.v1"
  }
}
```

Save `session_admin_token` — you'll use it for all subsequent admin actions.

### 2. Set topic (trivia) or config (quick draw)

```bash
# Trivia
curl -X POST https://api.example.com/v1/sessions/sess_abc123/trivia/topic \
  -H "Authorization: Bearer <session_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "topic": "90s Pop Music", "difficulty": "medium", "question_count": 10 }'

# Quick Draw
curl -X POST https://api.example.com/v1/sessions/sess_abc123/quickdraw/config \
  -H "Authorization: Bearer <session_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "category": "Animals", "difficulty": "easy", "prompt_count": 8, "round_duration_ms": 25000 }'
```

### 3. Mint tokens for participants

```bash
curl -X POST https://api.example.com/v1/sessions/sess_abc123/token \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{ "identity": "user-42", "display_name": "Alice", "role": "player" }'
```

**Response:**

```json
{
  "livekit_token": "<livekit_jwt>",
  "participant": {
    "identity": "user-42",
    "display_name": "Alice",
    "role": "player",
    "score": 0,
    "muted": false
  }
}
```

Use `livekit_token` to connect this user to the LiveKit room.

### 4. Connect participants to the LiveKit room

Pass `livekit_token` to the LiveKit client SDK for each participant. Repeat step 3 for each player.

### 5. Start the session

```bash
curl -X POST https://api.example.com/v1/sessions/sess_abc123/actions/start \
  -H "Authorization: Bearer <session_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "auto", "lobby_grace_seconds": 10 }'
```

The AI moderator joins the LiveKit room and begins the game.

### 6. Listen to realtime events

Subscribe to the `game.events.v1` DataChannel topic in your LiveKit client to receive all game events as they happen. See [Realtime Events](#6-realtime-events) for the full event list.

```js
room.on(RoomEvent.DataReceived, (data, participant, kind, topic) => {
  if (topic === "game.events.v1") {
    const event = JSON.parse(new TextDecoder().decode(data));
    console.log(event.type, event.payload);
  }
});
```

---

## 3. Authentication

All requests must include an `Authorization: Bearer <token>` header. Three token types exist:

| Scheme | Token | How to obtain |
|---|---|---|
| `ApiKeyAuth` | Your API key | Issued to your account |
| `SessionAdminAuth` | `session_admin_token` | Returned in `POST /v1/sessions` response |
| `InternalAuth` | Internal token | Used only by the AI moderator process |

Endpoints that require `ApiKeyAuth` are marked with **API key**. Endpoints that require `SessionAdminAuth` are marked with **session admin**.

---

## 4. Sessions

### POST /v1/sessions

Creates a new game session. Requires **API key**.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `game` | `"trivia"` \| `"quick_draw"` | Yes | Game type |
| `livekit.room_name` | string | Yes | Name of the existing LiveKit room |
| `livekit.room_region` | string | No | LiveKit region hint |
| `config` | SessionConfig | No | Session-level settings (see [Data Models](#8-data-models-reference)) |
| `metadata` | object | No | Arbitrary key-value data attached to the session |

**Response:** `CreateSessionResponse` — session ID, status, tokens, and realtime config.

---

### POST /v1/sessions/{session_id}/token

Mints a LiveKit token for one participant and registers them with the session. Requires **API key**.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `identity` | string | Yes | Unique identifier for this participant |
| `display_name` | string | No | Human-readable name shown in the game |
| `role` | ParticipantRole | Yes | `host`, `admin`, `player`, `spectator`, or `moderator` |
| `metadata` | object | No | Arbitrary participant metadata |

**Response:**

```json
{
  "livekit_token": "<jwt>",
  "participant": {
    "identity": "user-42",
    "display_name": "Alice",
    "role": "player",
    "score": 0,
    "muted": false,
    "joined_at_ms": 1710000000000,
    "metadata": {}
  }
}
```

---

### POST /v1/sessions/{session_id}/trivia/topic

Sets the trivia topic and question parameters. Requires **session admin**. Call before starting the session.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `topic` | string (1–120 chars) | Yes | Topic for AI-generated questions (e.g. "Space Exploration") |
| `difficulty` | Difficulty | No | `easy`, `medium`, `hard`, or `mixed` |
| `question_count` | integer (1–50) | No | Number of questions; default `10` |

**Response:** `{ "ok": true }`

```bash
curl -X POST https://api.example.com/v1/sessions/sess_abc123/trivia/topic \
  -H "Authorization: Bearer <session_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "topic": "World History", "difficulty": "hard", "question_count": 15 }'
```

---

### POST /v1/sessions/{session_id}/quickdraw/config

Sets the quick draw category and timing. Requires **session admin**. Call before starting the session.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `category` | string (1–120 chars) | No | Drawing category (e.g. "Animals") |
| `difficulty` | Difficulty | No | `easy`, `medium`, `hard`, or `mixed` |
| `prompt_count` | integer (1–50) | No | Number of prompts; default `10` |
| `round_duration_ms` | integer (5000–600000) | No | Drawing time per round in ms; default `25000` |

**Response:** `{ "ok": true }`

---

### GET /v1/sessions/{session_id}/snapshot

Returns the current state of the session. No authentication required (public).

**Response:**

```json
{
  "session_id": "sess_abc123",
  "game": "trivia",
  "status": "running",
  "sequence": 42,
  "floor": {
    "mode": "open",
    "allowed_roles": null,
    "allowed_identities": null,
    "held_by": null,
    "expires_at_ms": null
  },
  "state": {
    "participants": [
      { "identity": "user-42", "display_name": "Alice", "role": "player", "score": 2, "muted": false }
    ],
    "round": {
      "round_id": "rnd_001",
      "phase": "question",
      "ends_at_ms": 1710000015000
    },
    "trivia": {
      "topic": "World History",
      "difficulty": "hard",
      "question_index": 3
    }
  }
}
```

For `quick_draw` sessions, the `trivia` field is replaced with a `quickdraw` field containing `prompt`, `category`, `difficulty`, `prompt_index`, and `round_duration_ms`.

---

### GET /v1/sessions/{session_id}/events

Returns the event log for a session, optionally paginated. No authentication required.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `after_seq` | integer | Return only events after this sequence number |
| `limit` | integer | Maximum events to return |

**Response:**

```json
{
  "session_id": "sess_abc123",
  "events": [
    {
      "v": 1,
      "session_id": "sess_abc123",
      "seq": 12,
      "ts_ms": 1710000010000,
      "type": "score.updated",
      "payload": { "participant_identity": "user-42", "score": 3, "delta": 1, "reason": "correct_answer" }
    }
  ],
  "next_after_seq": 12
}
```

---

## 5. Admin Actions

All admin actions require **session admin** auth (`Authorization: Bearer <session_admin_token>`).

---

### POST /v1/sessions/{session_id}/actions/start

Starts the session; the AI moderator joins and the game begins.

**Request body:**

| Field | Type | Description |
|---|---|---|
| `mode` | `"auto"` | Always `"auto"` |
| `lobby_grace_seconds` | integer (0–300) | Seconds to wait for latecomers; default `10` |

**Response:** `{ "ok": true, "status": "running" }`

---

### POST /v1/sessions/{session_id}/actions/pause

Pauses the session mid-game.

**Request body:** `{ "reason": "optional string" }`

**Response:** `{ "ok": true, "status": "paused" }`

---

### POST /v1/sessions/{session_id}/actions/resume

Resumes a paused session.

**Request body:** `{ "reason": "optional string" }`

**Response:** `{ "ok": true, "status": "running" }`

---

### POST /v1/sessions/{session_id}/actions/end

Ends the session immediately.

**Request body:** `{ "reason": "optional string" }`

**Response:** `{ "ok": true, "status": "ended" }`

---

### POST /v1/sessions/{session_id}/actions/participants/mute

Mutes one or more participants. Target by identity list, by role, or both.

**Request body:**

| Field | Type | Description |
|---|---|---|
| `participant_identities` | string[] | Specific identities to mute |
| `target_roles` | ParticipantRole[] | Mute all participants with these roles |
| `exclude_roles` | ParticipantRole[] | Exclude these roles from the target set |
| `reason` | string | Optional reason (max 200 chars) |
| `duration_ms` | integer (0–600000) | Auto-unmute after this duration; omit for permanent |

**Response:** `{ "ok": true, "affected_identities": ["user-42", "user-99"] }`

---

### POST /v1/sessions/{session_id}/actions/participants/unmute

Unmutes participants. Same targeting fields as mute (no `duration_ms`).

**Response:** `{ "ok": true, "affected_identities": ["user-42"] }`

---

### POST /v1/sessions/{session_id}/actions/floor

Sets floor control — who is allowed to speak.

**Request body:**

| Field | Type | Description |
|---|---|---|
| `mode` | FloorMode | `open`, `moderator_only`, or `roles_only` |
| `allowed_roles` | ParticipantRole[] | Required when `mode` is `roles_only` |
| `allowed_identities` | string[] | Specific identities always allowed, regardless of mode |
| `duration_ms` | integer (0–300000) | Revert to `open` after this duration; omit for permanent |
| `reason` | string | Optional reason |

**Response:** `{ "ok": true, "floor": { "mode": "roles_only", "allowed_roles": ["host"], ... } }`

---

### POST /v1/sessions/{session_id}/actions/floor/release

Releases floor control, returning to `open` mode.

**Request body:** `{ "reason": "optional string" }`

**Response:** `{ "ok": true }`

---

### POST /v1/sessions/{session_id}/actions/override-score

Adjusts a participant's score by a delta.

**Request body:**

| Field | Type | Description |
|---|---|---|
| `participant_identity` | string | Target participant |
| `delta` | integer (−100 to 100) | Points to add (positive) or subtract (negative) |
| `reason` | string | Optional reason |

**Response:** `{ "ok": true, "status": "running" }`

---

### POST /v1/sessions/{session_id}/actions/skip

Skips the current question or the entire current round.

**Request body:**

| Field | Type | Description |
|---|---|---|
| `scope` | `"current_question"` \| `"current_round"` | What to skip |
| `reason` | string | Optional reason |

**Response:** `{ "ok": true, "status": "running" }`

---

### POST /v1/sessions/{session_id}/actions/trigger-effect

Triggers a visual/audio effect for all or a specific participant.

**Request body:**

| Field | Type | Description |
|---|---|---|
| `effect` | EffectType | `confetti`, `spotlight`, `shake`, `flash`, or `custom` |
| `target_identity` | string | Participant to target; omit for global |
| `data` | object | Arbitrary effect parameters |
| `duration_ms` | integer (500–30000) | Effect duration; default `5000` |

**Response:** `{ "ok": true }`

```bash
curl -X POST https://api.example.com/v1/sessions/sess_abc123/actions/trigger-effect \
  -H "Authorization: Bearer <session_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "effect": "confetti", "target_identity": "user-42", "duration_ms": 3000 }'
```

---

## 6. Realtime Events

All game events are broadcast over a LiveKit DataChannel on topic `game.events.v1`. Every message is UTF-8 JSON following this envelope:

```json
{
  "v": 1,
  "session_id": "sess_abc123",
  "seq": 15,
  "ts_ms": 1710000010000,
  "type": "score.updated",
  "payload": { ... }
}
```

| Field | Type | Description |
|---|---|---|
| `v` | `1` | Protocol version |
| `session_id` | string | Session this event belongs to |
| `seq` | integer | Monotonically increasing sequence number |
| `ts_ms` | integer | Server timestamp (Unix ms) |
| `type` | GameEventType | Event type string |
| `payload` | object | Event-specific data (see table below) |

### Event types

| Type | Trigger | Key payload fields |
|---|---|---|
| `snapshot.full` | On moderator connect | `sequence`, `state` (full session state) |
| `session.started` | Session started | `at_ms` |
| `session.paused` | Session paused | `at_ms`, `reason` |
| `session.resumed` | Session resumed | `at_ms`, `reason` |
| `session.ended` | Session ended | `at_ms`, `reason`, `winner_identity`, `final_scores[]` |
| `round.started` | New round begins | `round_id`, `ends_at_ms` |
| `round.ended` | Round concludes | `round_id`, `winner_identity`, `tie` |
| `score.updated` | Score changes | `participant_identity`, `score`, `delta`, `reason` |
| `game.winner` | Overall game winner declared | `winner_identity`, `winner_display_name`, `final_scores[]`, `win_condition_met`, `total_questions` |
| `moderator.speak.started` | AI begins speaking | `speak_id`, `text`, `language`, `starts_at_ms`, `expected_end_ms`, `mode` |
| `moderator.speak.ended` | AI finishes speaking | `speak_id`, `ended_at_ms` |
| `error.raised` | An error occurred | `code`, `message`, `detail` |
| `effect.triggered` | Visual effect fired | `effect`, `target_identity`, `data`, `duration_ms` |
| `floor.changed` | Floor control changed | `floor` (FloorState), `changed_by`, `reason` |
| `participants.mute.changed` | Mute state changed | `affected_identities[]`, `muted`, `reason`, `source`, `until_ms` |
| `quiet.achieved` | Room reached silence | `waited_ms` |
| `quiet.timeout` | Room stayed noisy | `waited_ms`, `offenders[]` |
| `trivia.question` | New trivia question | `round_id`, `question_id`, `topic`, `prompt`, `spoken`, `answer_window_ms`, `unmute_at_ms` |
| `trivia.answer.detected` | Player answer captured | `round_id`, `question_id`, `participant_identity`, `transcript`, `confidence`, `answer_time_ms` |
| `trivia.winner` | Trivia question winner | `round_id`, `question_id`, `winner_identity`, `answer`, `answer_time_ms`, `reason` |
| `quickdraw.prompt` | New drawing prompt | `round_id`, `prompt`, `category`, `spoken`, `round_duration_ms`, `unmute_at_ms` |
| `quickdraw.correct.detected` | Correct drawing found | `round_id`, `participant_identity`, `frame_time_ms`, `confidence`, `evidence` |
| `quickdraw.winner` | Quick draw round winner | `round_id`, `winner_identity`, `win_time_ms`, `confidence`, `tie` |

### Subscribing in JavaScript

```js
import { Room, RoomEvent } from "livekit-client";

const room = new Room();
await room.connect(LIVEKIT_URL, participantToken);

room.on(RoomEvent.DataReceived, (data, _participant, _kind, topic) => {
  if (topic !== "game.events.v1") return;
  const event = JSON.parse(new TextDecoder().decode(data));
  switch (event.type) {
    case "score.updated":
      updateScoreboard(event.payload.participant_identity, event.payload.score);
      break;
    case "trivia.question":
      showQuestion(event.payload.prompt, event.payload.answer_window_ms);
      break;
    case "game.winner":
      showWinner(event.payload.winner_display_name, event.payload.final_scores);
      break;
  }
});
```

---

## 7. Webhooks

Register a webhook to receive server-to-server POST notifications for key game events.

### POST /v1/webhooks

Requires **API key**.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string (URL) | Yes | Endpoint to receive webhook POSTs |
| `events` | WebhookEventType[] | Yes | List of event types to subscribe to |
| `secret` | string | No | If provided, used to sign payloads with HMAC-SHA256 |

**Response:**

```json
{
  "webhook_id": "wh_xyz789",
  "url": "https://yourapp.com/webhooks/game",
  "events": ["session.ended", "score.updated", "game.winner"]
}
```

```bash
curl -X POST https://api.example.com/v1/webhooks \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourapp.com/webhooks/game",
    "events": ["session.ended", "game.winner", "score.updated"],
    "secret": "my-webhook-secret"
  }'
```

### Webhook event types

| Type | When fired |
|---|---|
| `session.started` | Session transitions to `running` |
| `session.ended` | Session transitions to `ended` |
| `round.ended` | Any round concludes |
| `score.updated` | Any participant's score changes |
| `game.winner` | Overall game winner declared |
| `effect.triggered` | Visual effect fired |
| `floor.changed` | Floor control mode changed |
| `participants.mute.changed` | Any participant muted or unmuted |
| `error.raised` | An internal error was raised |

### Payload shape

Webhook POST bodies use the same envelope as realtime events:

```json
{
  "v": 1,
  "session_id": "sess_abc123",
  "seq": 42,
  "ts_ms": 1710000020000,
  "type": "game.winner",
  "payload": {
    "winner_identity": "user-42",
    "winner_display_name": "Alice",
    "final_scores": [
      { "participant_identity": "user-42", "display_name": "Alice", "score": 5, "rank": 1, "correct_answers": 5 },
      { "participant_identity": "user-99", "display_name": "Bob", "score": 3, "rank": 2, "correct_answers": 3 }
    ],
    "win_condition_met": "first_to_points",
    "total_questions": 7
  }
}
```

If a `secret` was provided at registration, the request includes an `X-Signature-SHA256` header containing `sha256=<hmac_hex>` computed over the raw request body.

---

## 8. Data Models Reference

### SessionConfig

| Field | Type | Default | Description |
|---|---|---|---|
| `max_players` | integer (2–50) | `6` | Maximum number of player-role participants |
| `language` | string | `"en-US"` | BCP-47 language code for moderator voice |
| `moderator_voice` | string | `"default"` | TTS voice identifier |
| `win_condition` | WinCondition | — | Win condition; defaults to `first_to_points: 5` |
| `voice_rules` | VoiceRules | — | Quiet-gate settings before questions |
| `debug_events` | `"none"` \| `"host_only"` \| `"all"` | — | Whether to emit internal debug events |
| `evidence_mode` | `"off"` \| `"winner_only"` \| `"all_correct_candidates"` | — | Controls evidence image inclusion in events |
| `privacy` | PrivacyConfig | — | Data retention settings |

**WinCondition:**

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `"first_to_points"` | — | Only supported type |
| `points` | integer (1–100) | `5` | Points needed to win |

**VoiceRules:**

| Field | Type | Default | Description |
|---|---|---|---|
| `require_quiet_before_prompt` | boolean | `true` | Gate questions until room is quiet |
| `quiet_ms` | integer (200–10000) | `1000` | Required silence duration in ms |
| `max_wait_ms` | integer (1000–30000) | `8000` | Max wait for quiet before proceeding |
| `noise_threshold_db` | float (−80 to 0) | `−40` | dB threshold below which room is considered quiet |

**PrivacyConfig:**

| Field | Type | Default | Description |
|---|---|---|---|
| `store_audio` | boolean | `false` | Whether to retain audio recordings |
| `store_frames` | boolean | `true` | Whether to retain video frames for evidence |
| `retention_days` | integer (0–365) | `7` | Days to keep stored data |

---

### Participant

| Field | Type | Description |
|---|---|---|
| `identity` | string | Unique ID for this participant within the session |
| `display_name` | string | Human-readable name |
| `role` | ParticipantRole | Role in the session |
| `score` | integer | Current score |
| `muted` | boolean | Whether participant is currently muted |
| `joined_at_ms` | integer | Unix timestamp of when they joined |
| `metadata` | object | Arbitrary key-value data |

---

### FloorState

| Field | Type | Description |
|---|---|---|
| `mode` | FloorMode | Current floor control mode |
| `allowed_roles` | ParticipantRole[] \| null | Roles permitted to speak (when `roles_only`) |
| `allowed_identities` | string[] \| null | Specific identities always permitted |
| `held_by` | string \| null | Identity currently holding the floor |
| `expires_at_ms` | integer \| null | When floor control reverts to `open` |

---

### Enums

**GameType:** `trivia` | `quick_draw`

**SessionStatus:** `created` | `running` | `paused` | `ended` | `error`

**ParticipantRole:** `host` | `admin` | `player` | `spectator` | `moderator`

**Difficulty:** `easy` | `medium` | `hard` | `mixed`

**FloorMode:** `open` | `moderator_only` | `roles_only`

**EffectType:** `confetti` | `spotlight` | `shake` | `flash` | `custom`

---

## 9. Advanced: Custom Moderator

Teams who want to build their own AI moderator (or extend the default one) can implement the internal moderator API surface. The default Python moderator in `moderator/` is the reference implementation.

A custom moderator authenticates using an `InternalAuth` token and interacts with these internal endpoints:

### Session lifecycle

| Endpoint | Description |
|---|---|
| `POST /internal/v1/sessions/{id}/attach` | Register the moderator with the session; mints a LiveKit token and sets `moderator_identity` |
| `POST /internal/v1/sessions/{id}/detach` | Unregister the moderator |
| `POST /internal/v1/sessions/{id}/advance-round` | Advance to the next round (or end the game) |
| `POST /internal/v1/sessions/{id}/floor` | Set floor control on behalf of the moderator |

### Speech synthesis (TTS)

| Endpoint | Description |
|---|---|
| `POST /internal/v1/tts/speak` | Submit a TTS utterance; emits `moderator.speak.started` event |
| `GET /internal/v1/tts/jobs/{job_id}` | Poll job status; returns audio when `status` is `done` |

### Speech recognition (STT)

| Endpoint | Description |
|---|---|
| `POST /internal/v1/stt/streams` | Open an STT stream for a participant |
| `POST /internal/v1/stt/streams/{id}/feed` | Push audio data into the stream |
| `POST /internal/v1/stt/streams/{id}/close` | Close the stream |
| `GET /internal/v1/stt/streams/{id}/results` | Poll transcription results |

### Vision (quick draw only)

| Endpoint | Description |
|---|---|
| `POST /internal/v1/vision/paper-detect` | One-shot: detect a paper/drawing region in a frame |
| `POST /internal/v1/vision/quickdraw-judge` | One-shot: judge whether a drawing matches the prompt |
| `POST /internal/v1/vision/streams` | Open a vision stream for a participant |
| `POST /internal/v1/vision/streams/{id}/feed` | Push video frames |
| `GET /internal/v1/vision/streams/{id}/results` | Poll detection results |
| `POST /internal/v1/vision/streams/{id}/close` | Close the stream |

### Decisions

| Endpoint | Description |
|---|---|
| `POST /internal/v1/decisions/trivia-answer` | Submit a judged trivia answer; game engine applies scoring |
| `POST /internal/v1/decisions/quickdraw-correct` | Submit a confirmed correct drawing; game engine applies scoring |

The default moderator in `moderator/moderator/game_agent.py` provides a complete working implementation using Deepgram STT, OpenAI LLM for question generation and answer judging, and Cartesia TTS.
