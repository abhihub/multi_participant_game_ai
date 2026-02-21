# Requirements Gap Analysis — AI Game Moderator

## What's Fully Implemented

### Req 1 — Joining a LiveKit room as a participant

`GameModerator` uses the LiveKit Agents framework to join a room as `moderator-ai`
(role: `moderator`). With 4 players in a room, it becomes the 5th. The API mints a real JWT
for the moderator via `SessionStore.mintLiveKitToken()` (`src/state/SessionStore.ts:546`).

**One caveat**: the admin must call `POST /v1/sessions` with the room name first. There is no
auto-discovery of existing rooms — but once called, the moderator joins whatever LiveKit room
name you pass in, including one that already has players in it.

### Req 2 & 3 — Voice AI Bot

`Moderator/agent.py` wires four AI services into a single voice bot:

| Service | Role |
|---|---|
| **Deepgram Nova-3** | Real-time STT for all player speech |
| **OpenAI GPT-4.1-mini** | Generates trivia questions, judges answers |
| **Cartesia Sonic** | TTS so the moderator speaks live in the room |
| **Silero VAD** | Detects when players start/stop talking |

### Req 4 — Trivia game

Full step-by-step coverage:

| Requirement step | Code that implements it |
|---|---|
| Admin initiates game | `POST .../actions/start` → `transitionStatus("running")` → `session.started` event |
| Moderator joins as 5th participant | `GameModerator.on_enter()` → `attach()` → adds `moderator-ai` to session |
| Admin sets topic | Configured in `POST /v1/sessions` body (see Gap 3) |
| Moderator mutes all | `set_floor("moderator_only")` → emits `floor.changed` |
| Moderator speaks question | `_say(question)` → Cartesia TTS → live audio in room |
| Unmutes when done speaking | `set_floor("open")` immediately after `_say()` returns |
| Listens for answers | Deepgram transcribes; `on_user_turn_completed()` → `receive_answer()` |
| First correct answer wins | `_judge_answers()` iterates in receipt order; LLM judges; first `is_correct=True` wins |
| Score awarded | `ingestTriviaAnswer()` → `p.score += 1` → `score.updated` event |
| Win at 5 points | `checkWinCondition()` (`src/state/SessionStore.ts:468`) checks threshold → fires `game.winner` + `session.ended` |
| Confetti | `EffectType.confetti` + `effect.triggered` event exist — not auto-triggered (see Gap 2) |

### Req 4 — QuickDraw game

Same structure as trivia, with these additions:

| Requirement step | Code that implements it |
|---|---|
| Moderator announces drawing prompt | `QuickDrawFlow._play_round()` → TTS + `quickdraw.prompt` DataChannel event |
| Moderator watches player video | `_judge_frame()` (`Moderator/moderator/quickdraw_flow.py:160`) subscribes to each player's video track, samples at 3 fps |
| Correct drawing detected | `quickdraw_judge()` calls `POST /internal/v1/vision/quickdraw-judge`; checks `correct && confidence > 0.6` — **currently stubbed** (see Gap 1) |
| Award point | `submit_quickdraw_correct()` → `ingestQuickDrawCorrect()` → `p.score += 1` → events |
| Win at 5 points | same `checkWinCondition()` |

---

## Gaps

### Gap 1 — Vision AI is stubbed (QuickDraw won't detect drawings)

**File**: `src/routes/internal-vision.ts:41`

The endpoint `POST /internal/v1/vision/quickdraw-judge` always returns:

```json
{ "correct": false, "confidence": 0.3, "rationale": "Drawing does not match the prompt" }
```

The architectural pipeline is complete — the moderator samples video frames and calls the
endpoint — but the endpoint doesn't call any real vision model. QuickDraw will never detect a
correct drawing until this stub is replaced with a real vision AI call (e.g. GPT-4o vision,
Claude vision).

### Gap 2 — Confetti is not auto-triggered

**File**: `src/state/SessionStore.ts:468` (`checkWinCondition`)

When `game.winner` fires, no confetti effect is sent automatically. The `confetti` effect type
(`src/schemas/enums.ts:24`) and `POST /v1/sessions/:id/actions/trigger-effect` endpoint
(`src/routes/admin.ts:154`) both exist, but nothing calls them on win.

Three options to fix:
- **Server-side**: have `checkWinCondition()` auto-emit `effect.triggered { effect: "confetti" }` after `game.winner`
- **Moderator-side**: moderator detects `session_ended` and calls `trigger-effect`
- **Client-side**: client listens for `game.winner` on the DataChannel and triggers the effect itself

### Gap 3 — Trivia topic cannot be set verbally mid-session

The requirement describes "Player A tells the Moderator AI to provide trivia on Roman history."
Currently, `session.trivia.topic` is set at session creation (`POST /v1/sessions` body) or
updated via `POST /v1/trivia/config`. There is no voice command pipeline where the admin speaks
a topic and the moderator changes it live before starting the game.

### Gap 4 — Score overlays and confetti are client-rendered

The platform sends all the right signals over the DataChannel (`game.events.v1` topic):
- `score.updated` — for score overlays on video tiles
- `effect.triggered { effect: "confetti" }` — for the winner animation
- `game.winner` — with final scores and winner identity

But rendering these (score overlay on each participant's video tile, confetti on the
moderator's tile) is the **client application's responsibility**. The server and moderator
provide events only; the UI layer must consume them.

### Gap 5 — Muting is signaled, not enforced

Floor control sends `floor.changed` events when the moderator sets
`floor.mode = "moderator_only"`, but LiveKit Cloud does not support server-side force-muting
of participants. Clients must voluntarily mute their own microphone when they receive the
`floor.changed` event. This is a LiveKit architecture constraint, not a code gap.

---

## What is NOT a Gap (but might look like one)

**"First to answer correctly"**: The trivia flow collects answers within a 15-second window
and judges them in receipt order. The first correct one wins. If two players answer
simultaneously, STT may transcribe them in non-deterministic order — this is inherent to
real-time voice, not a bug.
