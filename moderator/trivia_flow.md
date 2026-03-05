# Trivia Game Flow — Annotated Diagram

Last updated: 2026-03-04

## Full Flow (3 participants + AI Moderator)

```
[Host creates session]
    |
    v
[Game Engine creates SessionStore record]
    |
    v
[Host + Player B + Player C join LiveKit room]
    |
    v
[Host clicks Start Game]
    |
    v
[Game status -> running]

------------------ Moderator startup ------------------

[LiveKit dispatches AI Moderator worker]
    |
    v
[agent.py polls /snapshot until status == "running"]
    |  (retries every 2s; 600s deadline; exits on "ended"/"error")
    v
[Moderator connects to LiveKit room (ctx.connect())]
    |
    v
[GameModerator.on_enter()]
    |-- attach to Game Engine (/internal/.../attach)
    |-- create EventBroadcaster (DataChannel)
    |-- create + publish moderator HUD video track
    |-- start per-participant STT streams
    v
[_run_game_flow() spawns TriviaFlow.run()]

------------------ Per-round loop ------------------

[advance-round API call]
    |  (if action == "session_ended" → break)
    v
[Generate trivia question (LLM)]
    |  (uses pre-fetched question from previous round if available)
    v
[Set floor = moderator_only  +  broadcast floor.changed]
    |
    v
[Show question on HUD]
    |
    v
[Moderator speaks question (TTS)]
    |
    v
[Broadcast trivia.question event]
    |
    v
[Set _current_question  +  Set floor = open  +  broadcast floor.changed]
    |
    v
[Answer window open (timeout = configurable, default 15s)]
    |
    |-- [Players answer by voice]
    |       |
    |       v
    |   [STT transcript per participant → receive_answer()]
    |       |
    |       v
    |   [_judge_early() spawned in background (LLM, temp=0)]
    |       |
    |       |-- if CORRECT → set early_close_event → window closes early
    |       |-- if WRONG   → cache result in _judged_answers{}
    |
    |-- [Nudge TTS at 65% of timeout if no answers yet]
    |   (suppressed if remaining window < 2.5s TTS + 2s buffer)
    |
    v
[Answer window closes (timeout OR early close)]
    |
    v
[Set floor = moderator_only  +  broadcast floor.changed]
    |
    v
[Grace window: asyncio.sleep(1.5s) — lets in-flight STT finals arrive]
    |
    v
[Close answer gate (_current_question = None)]
    |
    v
[_judge_answers() — for each collected answer:]
    |-- use cached judgment from _judged_answers{} if available
    |-- else call LLM judge now (temp=0)
    |-- submit decision → /internal/v1/decisions/trivia-answer
    |       |
    |       v
    |   [Game Engine / SessionStore]
    |       |-- updates score
    |       |-- emits trivia.winner (if correct)
    |       |-- emits game.winner / session.ended (if win condition met)
    |
    |-- broadcast trivia.answer.detected (per participant)
    v
[Fetch updated snapshot from Game Engine]
    |
    v
[Broadcast score.updated per participant  +  Update HUD scores]
    |
    v
[Moderator announces result (TTS)]
    |-- CORRECT  → "Yes! {name} got it! The answer is {answer}!"
    |-- WRONG    → reacts to highest-confidence wrong answer
    |              ("So close!" if confidence >= 0.6, else "Nice try!")
    |-- NO ANSWER → "Nobody answered! The answer was {answer}."
    |
    v
[Pre-fetch next question (LLM) — runs concurrently during announcement TTS]
    |
    v
[Next round OR game ends]

------------------ End ------------------

[Round limit reached OR advance-round returns session_ended]
    |
    v
[Moderator speaks game-end line (TTS)]
    |
    v
[HUD shows final scores + winner banner + confetti]
    |
    v
[GameModerator.on_exit()]
    |-- stop VideoRenderer
    |-- cancel per-participant STT tasks
    |-- stop TriviaFlow
    |-- detach from Game Engine (/internal/.../detach)
    |-- close API client
    v
[Game Engine broadcasts session.ended + final scores]
```

## Event Ownership

| Event | Emitted by |
|-------|-----------|
| `floor.changed` | Moderator (trivia_flow.py) |
| `trivia.question` | Moderator (trivia_flow.py) |
| `trivia.answer.detected` | Moderator (trivia_flow.py) |
| `score.updated` | Moderator (trivia_flow.py, after snapshot fetch) |
| `trivia.winner` | Game Engine / SessionStore |
| `game.winner` | Game Engine / SessionStore |
| `session.ended` | Game Engine / SessionStore |
| `moderator.speak.started/ended` | Moderator (_say()) |

## Key Code Locations

| Step | File | Method | ~Line |
|------|------|--------|-------|
| Startup polling | `moderator/agent.py` | `entrypoint()` | 29 |
| Attach + HUD + STT | `moderator/moderator/game_agent.py` | `on_enter()` | 53 |
| Per-participant STT | `moderator/moderator/game_agent.py` | `_run_participant_stt()` | 180 |
| Round loop | `moderator/moderator/trivia_flow.py` | `run()` | 199 |
| Per-round execution | `moderator/moderator/trivia_flow.py` | `_play_round()` | 300 |
| Answer collection | `moderator/moderator/trivia_flow.py` | `receive_answer()` | 254 |
| Early judgment | `moderator/moderator/trivia_flow.py` | `_judge_early()` | 583 |
| Final judgment + submit | `moderator/moderator/trivia_flow.py` | `_judge_answers()` | 598 |
| TTS speaking | `moderator/moderator/trivia_flow.py` | `_say()` | 662 |
| Moderator exit | `moderator/moderator/game_agent.py` | `on_exit()` | 140 |
