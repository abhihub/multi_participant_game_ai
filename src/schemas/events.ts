import { z } from "zod";
import { GameEventType, SpeakMode, EffectType, WinConditionMet, MuteChangeSource } from "./enums.js";
import { FinalScore, EvidenceRef } from "./common.js";
import { FloorState } from "./floor.js";
import { TriviaSnapshotState, QuickDrawSnapshotState } from "./snapshot.js";

export const EvSnapshotFull = z.object({
  sequence: z.number().int().min(0),
  state: z.union([TriviaSnapshotState, QuickDrawSnapshotState]),
});

export const EvSessionStarted = z.object({
  at_ms: z.number().int().min(0),
});

export const EvSessionPaused = z.object({
  at_ms: z.number().int().min(0),
  reason: z.string().nullable().optional(),
});

export const EvSessionResumed = z.object({
  at_ms: z.number().int().min(0),
  reason: z.string().nullable().optional(),
});

export const EvSessionEnded = z.object({
  at_ms: z.number().int().min(0),
  reason: z.string().nullable().optional(),
  winner_identity: z.string().nullable().optional(),
  final_scores: z.array(FinalScore).nullable().optional(),
});

export const EvRoundStarted = z.object({
  round_id: z.string(),
  ends_at_ms: z.number().int().min(0),
});

export const EvRoundEnded = z.object({
  round_id: z.string(),
  winner_identity: z.string().nullable().optional(),
  tie: z.boolean().default(false),
});

export const EvScoreUpdated = z.object({
  participant_identity: z.string(),
  score: z.number().int(),
  delta: z.number().int(),
  reason: z.string().nullable().optional(),
});

export const EvModeratorSpeakStarted = z.object({
  speak_id: z.string(),
  text: z.string(),
  language: z.string().default("en-US"),
  starts_at_ms: z.number().int().min(0),
  expected_end_ms: z.number().int().min(0),
  mode: SpeakMode,
});

export const EvModeratorSpeakEnded = z.object({
  speak_id: z.string(),
  ended_at_ms: z.number().int().min(0),
});

export const EvErrorRaised = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.record(z.unknown()).nullable().optional(),
});

export const EvGameWinner = z.object({
  winner_identity: z.string(),
  winner_display_name: z.string().nullable().optional(),
  final_scores: z.array(FinalScore),
  win_condition_met: WinConditionMet,
  total_questions: z.number().int().min(0).optional(),
});

export const EvEffectTriggered = z.object({
  effect: EffectType,
  target_identity: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
  duration_ms: z.number().int().min(500).max(30000).default(5000),
});

export const EvFloorChanged = z.object({
  floor: FloorState,
  changed_by: z.string(),
  reason: z.string().nullable().optional(),
});

export const EvParticipantsMuteChanged = z.object({
  affected_identities: z.array(z.string()),
  muted: z.boolean(),
  reason: z.string().nullable().optional(),
  source: MuteChangeSource.optional(),
  until_ms: z.number().int().min(0).nullable().optional(),
});

export const EvQuietAchieved = z.object({
  waited_ms: z.number().int().min(0),
});

export const EvQuietTimeout = z.object({
  waited_ms: z.number().int().min(0),
  offenders: z.array(z.object({
    participant_identity: z.string(),
    level_db: z.number(),
    display_name: z.string().nullable().optional(),
  })),
});

export const EvTriviaQuestion = z.object({
  round_id: z.string(),
  question_id: z.string(),
  topic: z.string().nullable().optional(),
  prompt: z.string(),
  spoken: z.boolean().default(true),
  answer_window_ms: z.number().int().min(500).max(60000),
  unmute_at_ms: z.number().int().min(0).nullable().optional(),
});

export const EvTriviaAnswerDetected = z.object({
  round_id: z.string(),
  question_id: z.string(),
  participant_identity: z.string(),
  transcript: z.string(),
  confidence: z.number().min(0).max(1),
  answer_time_ms: z.number().int().min(0),
});

export const EvTriviaWinner = z.object({
  round_id: z.string(),
  question_id: z.string(),
  winner_identity: z.string(),
  answer: z.string(),
  answer_time_ms: z.number().int().min(0),
  reason: z.enum(["first_correct", "host_override"]),
});

export const EvQuickDrawPrompt = z.object({
  round_id: z.string(),
  prompt: z.string(),
  category: z.string().nullable().optional(),
  spoken: z.boolean().default(true),
  round_duration_ms: z.number().int().min(1000).max(600000),
  unmute_at_ms: z.number().int().min(0).nullable().optional(),
});

export const EvQuickDrawCorrectDetected = z.object({
  round_id: z.string(),
  participant_identity: z.string(),
  frame_time_ms: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  evidence: EvidenceRef.optional(),
});

export const EvQuickDrawWinner = z.object({
  round_id: z.string(),
  winner_identity: z.string(),
  win_time_ms: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  tie: z.boolean(),
});

export const GameEventPayload = z.union([
  EvSnapshotFull, EvSessionStarted, EvSessionPaused, EvSessionResumed, EvSessionEnded,
  EvRoundStarted, EvRoundEnded, EvScoreUpdated,
  EvModeratorSpeakStarted, EvModeratorSpeakEnded,
  EvErrorRaised, EvGameWinner, EvEffectTriggered,
  EvFloorChanged, EvParticipantsMuteChanged, EvQuietAchieved, EvQuietTimeout,
  EvTriviaQuestion, EvTriviaAnswerDetected, EvTriviaWinner,
  EvQuickDrawPrompt, EvQuickDrawCorrectDetected, EvQuickDrawWinner,
]);

export const TypedGameEventEnvelope = z.object({
  v: z.literal(1),
  session_id: z.string(),
  seq: z.number().int().min(0),
  ts_ms: z.number().int().min(0),
  type: GameEventType,
  payload: z.record(z.unknown()),
});
export type TypedGameEventEnvelope = z.infer<typeof TypedGameEventEnvelope>;

export const EventLogResponse = z.object({
  session_id: z.string(),
  events: z.array(TypedGameEventEnvelope),
  next_after_seq: z.number().int().nullable().optional(),
});
export type EventLogResponse = z.infer<typeof EventLogResponse>;
