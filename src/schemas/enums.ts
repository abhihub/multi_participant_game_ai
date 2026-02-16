import { z } from "zod";

export const GameType = z.enum(["trivia", "quick_draw"]);
export type GameType = z.infer<typeof GameType>;

export const SessionStatus = z.enum(["created", "running", "paused", "ended", "error"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const ParticipantRole = z.enum(["host", "admin", "player", "spectator", "moderator"]);
export type ParticipantRole = z.infer<typeof ParticipantRole>;

export const DebugEventsMode = z.enum(["none", "host_only", "all"]);
export type DebugEventsMode = z.infer<typeof DebugEventsMode>;

export const EvidenceMode = z.enum(["off", "winner_only", "all_correct_candidates"]);
export type EvidenceMode = z.infer<typeof EvidenceMode>;

export const Difficulty = z.enum(["easy", "medium", "hard", "mixed"]);
export type Difficulty = z.infer<typeof Difficulty>;

export const FloorMode = z.enum(["open", "moderator_only", "roles_only"]);
export type FloorMode = z.infer<typeof FloorMode>;

export const EffectType = z.enum(["confetti", "spotlight", "shake", "flash", "custom"]);
export type EffectType = z.infer<typeof EffectType>;

export const SpeakMode = z.enum(["question", "warning", "reveal", "announcement", "freeform"]);
export type SpeakMode = z.infer<typeof SpeakMode>;

export const TtsJobStatus = z.enum(["queued", "running", "done", "error"]);
export type TtsJobStatus = z.infer<typeof TtsJobStatus>;

export const WinConditionMet = z.enum(["first_to_points", "admin_declared", "all_questions_done"]);
export type WinConditionMet = z.infer<typeof WinConditionMet>;

export const MuteChangeSource = z.enum(["admin", "floor_control", "auto_unmute", "quiet_gate", "system"]);
export type MuteChangeSource = z.infer<typeof MuteChangeSource>;

export const GameEventType = z.enum([
  "snapshot.full",
  "session.started",
  "session.paused",
  "session.resumed",
  "session.ended",
  "round.started",
  "round.ended",
  "score.updated",
  "moderator.speak.started",
  "moderator.speak.ended",
  "error.raised",
  "game.winner",
  "effect.triggered",
  "floor.changed",
  "participants.mute.changed",
  "quiet.achieved",
  "quiet.timeout",
  "trivia.question",
  "trivia.answer.detected",
  "trivia.winner",
  "quickdraw.prompt",
  "quickdraw.correct.detected",
  "quickdraw.winner",
]);
export type GameEventType = z.infer<typeof GameEventType>;

export const WebhookEventType = z.enum([
  "session.started",
  "session.ended",
  "round.ended",
  "score.updated",
  "game.winner",
  "effect.triggered",
  "floor.changed",
  "participants.mute.changed",
  "error.raised",
]);
export type WebhookEventType = z.infer<typeof WebhookEventType>;
