# Manual Testing Guide

## Starting the Dev Server

```bash
npm run dev
```

The server starts on `http://localhost:3000` by default (override with `PORT` env var).

## Authentication Tokens

| Auth Scheme    | Header Value                         | Notes                                      |
|----------------|--------------------------------------|--------------------------------------------|
| ApiKeyAuth     | `Bearer dev-api-key`                 | For session/token creation & webhooks       |
| SessionAdmin   | `Bearer any-token-here`              | Accepts any Bearer token (placeholder)      |
| Internal       | `Bearer dev-internal-token`          | For all `/internal/v1/*` routes             |
| None           | _(omit header)_                      | Health, snapshot, SSE events                |

---

## Variables

Many commands below use shell variables. Set them once after creating a session:

```bash
BASE=http://localhost:3000
SID=<session_id from create response>
```

---

## 1. Health (no auth)

```bash
curl $BASE/internal/v1/health
```

---

## 2. Sessions

### Create a session (ApiKeyAuth)

```bash
curl -X POST $BASE/v1/sessions \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "game": "trivia",
    "livekit": { "room_name": "test-room" }
  }'
```

### Mint a participant token (ApiKeyAuth)

```bash
curl -X POST $BASE/v1/sessions/$SID/token \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "identity": "player-1",
    "display_name": "Alice",
    "role": "player"
  }'
```

### Get session snapshot (no auth)

```bash
curl $BASE/v1/sessions/$SID/snapshot
```

### Stream session events / SSE (no auth)

```bash
curl -N "$BASE/v1/sessions/$SID/events?after_seq=0&limit=50"
```

---

## 3. Admin Actions (SessionAdmin)

All admin routes use `Bearer any-token-here` (the SessionAdmin check accepts any Bearer value in dev).

### Start session

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/start \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "auto", "lobby_grace_seconds": 10 }'
```

### Pause session

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/pause \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "break time" }'
```

### Resume session

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/resume \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "back from break" }'
```

### End session

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/end \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "game over" }'
```

### Mute participants

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/participants/mute \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "participant_identities": ["player-1"],
    "reason": "too noisy",
    "duration_ms": 30000
  }'
```

### Unmute participants

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/participants/unmute \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "participant_identities": ["player-1"],
    "reason": "unmuted"
  }'
```

### Override score

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/override-score \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "participant_identity": "player-1",
    "delta": 5,
    "reason": "bonus points"
  }'
```

### Skip current question / round

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/skip \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{ "scope": "current_question", "reason": "too hard" }'
```

### Trigger visual effect

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/trigger-effect \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "effect": "confetti",
    "target_identity": "player-1",
    "duration_ms": 5000
  }'
```

---

## 4. Floor Control (SessionAdmin)

### Set floor mode

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/floor \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "roles_only",
    "allowed_roles": ["host", "player"],
    "duration_ms": 60000,
    "reason": "round in progress"
  }'
```

### Release floor

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/floor/release \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "round ended" }'
```

---

## 5. Game Configuration (SessionAdmin)

### Set trivia topic

```bash
curl -X POST $BASE/v1/sessions/$SID/trivia/topic \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "World Geography",
    "difficulty": "medium",
    "question_count": 10
  }'
```

### Set Quick Draw config

```bash
curl -X POST $BASE/v1/sessions/$SID/quickdraw/config \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "Animals",
    "difficulty": "easy",
    "prompt_count": 10,
    "round_duration_ms": 25000
  }'
```

---

## 6. Webhooks (ApiKeyAuth)

### Register a webhook

```bash
curl -X POST $BASE/v1/webhooks \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhook",
    "events": ["session.started", "session.ended", "game.winner"],
    "secret": "my-webhook-secret"
  }'
```

---

## 7. Internal Control (Internal)

### Attach moderator

```bash
curl -X POST $BASE/internal/v1/sessions/$SID/attach \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "livekit": {
      "room_name": "test-room",
      "moderator_token": "lk-token-abc"
    },
    "realtime": { "topic": "game.events.v1" },
    "game": "trivia"
  }'
```

### Detach moderator

```bash
curl -X POST $BASE/internal/v1/sessions/$SID/detach \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "shutting down" }'
```

### Advance round

```bash
curl -X POST $BASE/internal/v1/sessions/$SID/advance-round \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{ "delay_ms": 0 }'
```

---

## 8. Internal TTS (Internal)

### Speak

```bash
curl -X POST $BASE/internal/v1/tts/speak \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SID"'",
    "text": "Welcome to the game!",
    "language": "en-US",
    "voice": "default",
    "speak_mode": "announcement",
    "rate": 1.0,
    "pitch": 0
  }'
```

### Get TTS job status

```bash
curl $BASE/internal/v1/tts/jobs/JOB_ID \
  -H "Authorization: Bearer dev-internal-token"
```

_(Replace `JOB_ID` with the `job_id` from the speak response.)_

---

## 9. Internal STT (Internal)

### Create a stream

```bash
curl -X POST $BASE/internal/v1/stt/streams \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SID"'",
    "participant_identity": "player-1",
    "language": "en-US",
    "audio": {
      "codec": "pcm_s16le",
      "sample_rate_hz": 16000,
      "channels": 1
    }
  }'
```

### Feed audio frames

```bash
curl -X POST $BASE/internal/v1/stt/streams/STREAM_ID/feed \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "frames": [
      { "ts_ms": 0, "bytes_base64": "AAAA", "is_speech": true }
    ]
  }'
```

### Close stream

```bash
curl -X POST $BASE/internal/v1/stt/streams/STREAM_ID/close \
  -H "Authorization: Bearer dev-internal-token"
```

### Get results

```bash
curl "$BASE/internal/v1/stt/streams/STREAM_ID/results?after_seq=0&limit=50" \
  -H "Authorization: Bearer dev-internal-token"
```

_(Replace `STREAM_ID` with the `stream_id` from the create response.)_

---

## 10. Internal Vision (Internal)

### Paper detect

```bash
curl -X POST $BASE/internal/v1/vision/paper-detect \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SID"'",
    "participant_identity": "player-1",
    "image": {
      "bytes_base64": "/9j/4AAQ...",
      "content_type": "image/jpeg"
    },
    "hints": { "max_regions": 2 }
  }'
```

### Quick Draw judge

```bash
curl -X POST $BASE/internal/v1/vision/quickdraw-judge \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SID"'",
    "participant_identity": "player-1",
    "prompt": "cat",
    "image": {
      "bytes_base64": "/9j/4AAQ...",
      "content_type": "image/jpeg"
    }
  }'
```

### Create vision stream

```bash
curl -X POST $BASE/internal/v1/vision/streams \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SID"'",
    "participant_identity": "player-1",
    "prompt": "cat",
    "sample_fps": 3,
    "pipeline": { "paper_detect": true, "quickdraw_judge": true }
  }'
```

### Feed video frames

```bash
curl -X POST $BASE/internal/v1/vision/streams/VISION_STREAM_ID/feed \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "frames": [
      { "ts_ms": 0, "bytes_base64": "/9j/4AAQ...", "content_type": "image/jpeg" }
    ]
  }'
```

### Get vision results

```bash
curl "$BASE/internal/v1/vision/streams/VISION_STREAM_ID/results?after_seq=0&limit=50" \
  -H "Authorization: Bearer dev-internal-token"
```

### Close vision stream

```bash
curl -X POST $BASE/internal/v1/vision/streams/VISION_STREAM_ID/close \
  -H "Authorization: Bearer dev-internal-token"
```

_(Replace `VISION_STREAM_ID` with the `stream_id` from the create response.)_

---

## 11. Internal Decisions (Internal)

### Trivia answer decision

```bash
curl -X POST $BASE/internal/v1/decisions/trivia-answer \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SID"'",
    "round_id": "round-001",
    "question_id": "q-001",
    "participant_identity": "player-1",
    "is_correct": true,
    "canonical_answer": "Paris",
    "answer_time_ms": 3200,
    "transcript": "I think the answer is Paris",
    "normalized_answer": "paris",
    "confidence": 0.95
  }'
```

### Quick Draw correct decision

```bash
curl -X POST $BASE/internal/v1/decisions/quickdraw-correct \
  -H "Authorization: Bearer dev-internal-token" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SID"'",
    "round_id": "round-001",
    "participant_identity": "player-1",
    "frame_time_ms": 12500,
    "correct": true,
    "confidence": 0.88
  }'
```

---

## 12. Validation Error Testing

Send invalid data to trigger Zod validation errors. The error response includes details about which fields failed.

### Missing required field

```bash
curl -X POST $BASE/v1/sessions \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{ "game": "trivia" }'
```

Expected: `400` with validation error for missing `livekit` field.

### Invalid enum value

```bash
curl -X POST $BASE/v1/sessions \
  -H "Authorization: Bearer dev-api-key" \
  -H "Content-Type: application/json" \
  -d '{ "game": "boggle", "livekit": { "room_name": "r" } }'
```

Expected: `400` with validation error — `game` must be `"trivia"` or `"quick_draw"`.

### Out-of-range number

```bash
curl -X POST $BASE/v1/sessions/$SID/actions/override-score \
  -H "Authorization: Bearer any-token-here" \
  -H "Content-Type: application/json" \
  -d '{ "participant_identity": "player-1", "delta": 999 }'
```

Expected: `400` — `delta` must be between -100 and 100.

### Missing auth header

```bash
curl -X POST $BASE/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{ "game": "trivia", "livekit": { "room_name": "r" } }'
```

Expected: `401 Unauthorized` — missing Authorization header.

### Wrong auth token

```bash
curl -X POST $BASE/v1/sessions \
  -H "Authorization: Bearer wrong-key" \
  -H "Content-Type: application/json" \
  -d '{ "game": "trivia", "livekit": { "room_name": "r" } }'
```

Expected: `401 Unauthorized` — invalid API key.
