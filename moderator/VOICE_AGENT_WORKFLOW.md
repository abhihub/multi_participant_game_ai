# Voice Agent Workflow

## Architecture Overview

The moderator is built on **LiveKit Agents** and has three main layers working together:

```
GameModerator (Agent)
├── TriviaFlow / QuickDrawFlow  ← game logic
├── VideoRenderer               ← HUD video track
└── EventBroadcaster            ← data channel events
```

---

## Startup Sequence (`game_agent.py`)

When the agent joins a LiveKit room (`on_enter`):

1. **Resolves `session_id`** from room metadata (e.g. `{"session_id": "sess_xxx"}`)
2. **Attaches to the Game Engine API** via `ApiClient.attach()`
3. **Creates and starts `VideoRenderer`**, then publishes its track as a camera source — this is a real WebRTC video stream that all participants see
4. **Fetches snapshot** to determine game type (`trivia` vs `quick_draw`)
5. **Waits** for the session to reach `running` status (polls every 2s, up to 10 min)
6. **Starts the game flow** (`TriviaFlow.run()` or `QuickDrawFlow.run()`) as an asyncio task

---

## Trivia Round Loop (`trivia_flow.py`)

Each round follows this sequence:

```
1. advance_round() API call
2. _generate_question()          ← LLM call (JSON prompt → TriviaQuestion)
3. set_floor("moderator_only")   ← mutes players
4. renderer.set_question()       ← updates HUD immediately
5. _say("Question N: ...")       ← TTS via session.say()
   └─ renderer.set_speaking(True/False) ← speaking indicator on HUD
6. broadcast("trivia.question", ...)    ← data channel event
7. set_floor("open")             ← unmutes players
8. sleep(answer_timeout)         ← collect answers via receive_answer()
9. set_floor("moderator_only")
10. _judge_answers()             ← LLM judges each transcript
11. submit_trivia_answer()       ← sends decision to Game Engine
12. get_snapshot() → renderer.update_scores()  ← refresh HUD leaderboard
13. _say("Correct! ...")         ← announce result via TTS
14. renderer.set_question("")    ← clear question from HUD
```

---

## How Voice (STT) Feeds Back In

The STT callback is `on_user_turn_completed` in `GameModerator`:

```
Player speaks → LiveKit STT → on_user_turn_completed()
  └─ extracts transcript from new_message.text_content
  └─ infers participant identity from room.active_speakers
  └─ calls trivia_flow.receive_answer(identity, transcript)
       └─ appended to _pending_answers[] (if question is active)
```

The `_pending_answers` list is consumed at the end of the answer window and each transcript is sent to the LLM judge.

---

## How Video (`VideoRenderer`) Works

The renderer runs a **15 fps render loop** (`_render_loop`) completely independent of the voice loop:

```
Every 66ms:
  _render_frame()
    _draw()  ← PIL/Pillow canvas drawing
      _draw_background()         ← gradient
      _draw_header()             ← "AI Game Moderator" title bar
      _draw_leaderboard()        ← scores sorted desc, medals for top 3
      _draw_question_banner()    ← current question text at bottom
      _draw_speaking_indicator() ← green dot when TTS is active
      _tick_and_draw_confetti()  ← physics-based particles
      _draw_winner_banner()      ← fade-in trophy overlay
    → rtc.VideoFrame (RGBA bytes)
    → source.capture_frame()     ← pushes to WebRTC
```

The voice flow **synchronously mutates renderer state** right before/after audio calls:

| Voice event | Renderer call |
|---|---|
| Before `session.say()` | `set_speaking(True)` |
| After `session.say()` | `set_speaking(False)` |
| Before question TTS | `set_question(text)` |
| After results TTS | `set_question("")` |
| After each round | `update_scores([(name, score), ...])` |
| Game ends | `update_scores()` + `show_winner()` + `trigger_confetti()` |

The render loop reads this shared state every frame — there's no queue or lock between the voice flow and the renderer, it's just Python attribute assignments (effectively atomic for simple types in CPython).

---

## Data Channel Events

In parallel, `EventBroadcaster` publishes typed JSON envelopes over the LiveKit data channel so the **web client** (not the video track) can update its own UI:

| Event | When |
|---|---|
| `session.started` | Game begins |
| `trivia.question` | Question text + metadata |
| `trivia.answer.detected` | Per-player correctness result |
| `score.updated` | Per-player score after each round |

---

## Key Files

| File | Role |
|---|---|
| `moderator/game_agent.py` | `GameModerator` — LiveKit Agent, lifecycle, STT callback |
| `moderator/trivia_flow.py` | `TriviaFlow` — round loop, question gen, answer judging |
| `moderator/video_renderer.py` | `VideoRenderer` — 15fps PIL canvas → WebRTC video track |
| `moderator/events.py` | `EventBroadcaster` — data channel JSON envelopes |
| `moderator/prompts.py` | LLM prompts for question generation and answer judging |
| `moderator/api_client.py` | HTTP client for Game Engine API |
| `moderator/config.py` | Config (timeouts, topics, etc.) |
