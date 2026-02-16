import { z } from "zod";
import { Difficulty } from "./enums.js";
import { EvidenceRef } from "./common.js";

export const SetQuickDrawConfigRequest = z.object({
  category: z.string().min(1).max(120).nullable().optional(),
  difficulty: Difficulty.optional(),
  prompt_count: z.number().int().min(1).max(50).default(10),
  round_duration_ms: z.number().int().min(5000).max(600000).default(25000),
});
export type SetQuickDrawConfigRequest = z.infer<typeof SetQuickDrawConfigRequest>;

export const QuickDrawDetection = z.object({
  participant_identity: z.string(),
  frame_time_ms: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  evidence: EvidenceRef.optional(),
});
export type QuickDrawDetection = z.infer<typeof QuickDrawDetection>;

export const QuickDrawMutePolicy = z.object({
  muted_during_tts: z.boolean().default(true),
  unmute_at_ms: z.number().int().min(0).nullable().optional(),
});

export const QuickDrawState = z.object({
  prompt: z.string(),
  category: z.string().nullable().optional(),
  difficulty: Difficulty.optional(),
  prompt_index: z.number().int().min(0).optional(),
  round_duration_ms: z.number().int().min(1000).max(600000).default(25000),
  mute_policy: QuickDrawMutePolicy.optional(),
  detections: z.array(QuickDrawDetection).nullable().optional(),
});
export type QuickDrawState = z.infer<typeof QuickDrawState>;
