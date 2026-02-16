import { z } from "zod";
import { GameType, SessionStatus } from "./enums.js";
import { Participant } from "./session.js";
import { FloorState } from "./floor.js";
import { TriviaState } from "./trivia.js";
import { QuickDrawState } from "./quickdraw.js";

export const RoundRef = z.object({
  round_id: z.string(),
  phase: z.string(),
  ends_at_ms: z.number().int().min(0),
});
export type RoundRef = z.infer<typeof RoundRef>;

export const TriviaSnapshotState = z.object({
  participants: z.array(Participant),
  round: RoundRef,
  trivia: TriviaState,
});
export type TriviaSnapshotState = z.infer<typeof TriviaSnapshotState>;

export const QuickDrawSnapshotState = z.object({
  participants: z.array(Participant),
  round: RoundRef,
  quickdraw: QuickDrawState,
});
export type QuickDrawSnapshotState = z.infer<typeof QuickDrawSnapshotState>;

export const SnapshotResponse = z.object({
  session_id: z.string(),
  game: GameType,
  status: SessionStatus,
  sequence: z.number().int().min(0),
  floor: FloorState.optional(),
  state: z.union([TriviaSnapshotState, QuickDrawSnapshotState]),
});
export type SnapshotResponse = z.infer<typeof SnapshotResponse>;

export const AdvanceRoundResponse = z.object({
  ok: z.literal(true),
  action: z.enum(["advanced", "session_ended"]),
  round_index: z.number().int().min(0).nullable().optional(),
});
export type AdvanceRoundResponse = z.infer<typeof AdvanceRoundResponse>;
