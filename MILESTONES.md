# Milestones

Tracker for the Multiplayer AI Games Platform — Voice AI Bot moderator with Trivia and Quick Draw game modes.

---

## M1: API Design Verification

- [x] Core requirements verified against OpenAPI spec
- [x] Trivia game flow traced end-to-end (12 steps)
- [x] Quick Draw game flow traced end-to-end (11 steps)
- [x] Voice AI Bot interaction model validated (TTS, STT, Vision, Floor Control, Decisions)
- [x] No blocking gaps found

## M2: API Scaffold

- [x] Zod schemas match OpenAPI spec (`src/schemas/`)
- [x] Route handlers registered for all endpoints (`src/routes/`)
- [x] Auth middleware wired (ApiKey, SessionAdmin, Internal)
- [ ] Stub responses replaced with real state management

## M3: Voice AI Bot Core

- [ ] LiveKit room join via `attach` endpoint (moderator as real participant)
- [ ] TTS integration — moderator speaks via synthesized voice
- [ ] STT integration — per-participant audio transcription streams
- [ ] Vision integration — per-participant video analysis streams
- [ ] Floor control loop (mute → speak → unmute → listen/watch → judge)

## M4: Game Logic

- [ ] Session lifecycle state machine (created → running → paused → ended)
- [ ] Trivia: topic config → question generation → answer detection → scoring
- [ ] Quick Draw: prompt config → drawing detection → judgment → scoring
- [ ] Win condition evaluation (`first_to_points`)
- [ ] Round advancement with auto-end on win

## M5: Realtime Events

- [ ] Event bus emitting typed envelopes via LiveKit DataChannel (`game.events.v1`)
- [ ] Session lifecycle events (started, paused, resumed, ended)
- [ ] Game-specific events (trivia.question, quickdraw.prompt, *.winner)
- [ ] Moderator speech events (speak.started / speak.ended with correlation)
- [ ] Floor & mute change events
- [ ] Quiet gate events (quiet.achieved, quiet.timeout)

## M6: Client Integration

- [ ] Score overlay rendering from `score.updated` events
- [ ] Effect rendering (confetti, spotlight, etc.) from `effect.triggered` events
- [ ] Mute state UI from `participants.mute.changed` events
- [ ] Moderator speaking indicator from `moderator.speak.*` events

## M7: Documentation & Polish

- [x] README.md with full API reference
- [x] Clarify `host` vs `admin` role distinction in docs
- [x] Add roles table to README
- [x] Code pushed to GitHub repo
