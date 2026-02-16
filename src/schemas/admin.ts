import { z } from "zod";
import { ParticipantRole, EffectType } from "./enums.js";

export const ParticipantMuteRequest = z.object({
  participant_identities: z.array(z.string()).min(1).optional(),
  target_roles: z.array(ParticipantRole).min(1).optional(),
  exclude_roles: z.array(ParticipantRole).optional(),
  reason: z.string().max(200).nullable().optional(),
  duration_ms: z.number().int().min(0).max(600000).nullable().optional(),
});
export type ParticipantMuteRequest = z.infer<typeof ParticipantMuteRequest>;

export const ParticipantUnmuteRequest = z.object({
  participant_identities: z.array(z.string()).min(1).optional(),
  target_roles: z.array(ParticipantRole).min(1).optional(),
  exclude_roles: z.array(ParticipantRole).optional(),
  reason: z.string().max(200).nullable().optional(),
});
export type ParticipantUnmuteRequest = z.infer<typeof ParticipantUnmuteRequest>;

export const MuteUnmuteResponse = z.object({
  ok: z.literal(true),
  affected_identities: z.array(z.string()),
});
export type MuteUnmuteResponse = z.infer<typeof MuteUnmuteResponse>;

export const OverrideScoreRequest = z.object({
  participant_identity: z.string(),
  delta: z.number().int().min(-100).max(100),
  reason: z.string().max(200).optional(),
});
export type OverrideScoreRequest = z.infer<typeof OverrideScoreRequest>;

export const SkipRequest = z.object({
  scope: z.enum(["current_question", "current_round"]),
  reason: z.string().max(200).optional(),
});
export type SkipRequest = z.infer<typeof SkipRequest>;

export const TriggerEffectRequest = z.object({
  effect: EffectType,
  target_identity: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
  duration_ms: z.number().int().min(500).max(30000).default(5000),
});
export type TriggerEffectRequest = z.infer<typeof TriggerEffectRequest>;
