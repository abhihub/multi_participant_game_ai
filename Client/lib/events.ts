/**
 * TypeScript types for game.events.v1 DataChannel payloads.
 * Mirrors the Zod schemas in src/schemas/events.ts.
 */

export interface GameEventEnvelope {
  v: 1;
  session_id: string;
  seq: number;
  ts_ms: number;
  type: GameEventType;
  payload: Record<string, unknown>;
}

export type GameEventType =
  | "snapshot.full"
  | "session.started"
  | "session.paused"
  | "session.resumed"
  | "session.ended"
  | "round.started"
  | "round.ended"
  | "score.updated"
  | "moderator.speak.started"
  | "moderator.speak.ended"
  | "error.raised"
  | "game.winner"
  | "effect.triggered"
  | "floor.changed"
  | "participants.mute.changed"
  | "quiet.achieved"
  | "quiet.timeout"
  | "trivia.question"
  | "trivia.answer.detected"
  | "trivia.winner"
  | "quickdraw.prompt"
  | "quickdraw.correct.detected"
  | "quickdraw.winner";

export interface FinalScore {
  rank: number;
  participant_identity: string;
  display_name?: string | null;
  score: number;
}

export interface EvScoreUpdated {
  participant_identity: string;
  score: number;
  delta: number;
  reason?: string | null;
}

export interface EvGameWinner {
  winner_identity: string;
  winner_display_name?: string | null;
  final_scores: FinalScore[];
  win_condition_met: string;
}

export interface EvSessionEnded {
  at_ms: number;
  reason?: string | null;
  winner_identity?: string | null;
  final_scores?: FinalScore[] | null;
}

export interface EvFloorChanged {
  floor: { mode: "open" | "moderator_only" | "roles_only" };
  changed_by: string;
  reason?: string | null;
}

export interface EvTriviaQuestion {
  round_id: string;
  question_id: string;
  topic?: string | null;
  prompt: string;
  answer_window_ms: number;
}

export interface EvQuickDrawPrompt {
  round_id: string;
  prompt: string;
  category?: string | null;
  round_duration_ms: number;
}

export interface EvModeratorSpeakStarted {
  speak_id: string;
  text: string;
  mode: string;
}

export interface EvEffectTriggered {
  effect: "confetti" | "spotlight" | "shake" | "flash" | "custom";
  target_identity?: string | null;
  data?: Record<string, unknown>;
  duration_ms: number;
}
