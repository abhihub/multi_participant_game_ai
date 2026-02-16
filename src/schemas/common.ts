import { z } from "zod";

export const OkResponse = z.object({
  ok: z.literal(true),
});
export type OkResponse = z.infer<typeof OkResponse>;

export const OkStatusResponse = z.object({
  ok: z.literal(true),
  status: z.string(),
});
export type OkStatusResponse = z.infer<typeof OkStatusResponse>;

export const ReasonRequest = z.object({
  reason: z.string().max(200).optional(),
});
export type ReasonRequest = z.infer<typeof ReasonRequest>;

export const BBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type BBox = z.infer<typeof BBox>;

export const Point = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type Point = z.infer<typeof Point>;

export const ImageRef = z.object({
  content_type: z.enum(["image/jpeg", "image/png"]).optional(),
  url: z.string().url().nullable().optional(),
  bytes_base64: z.string().nullable().optional(),
  width: z.number().int().min(1).nullable().optional(),
  height: z.number().int().min(1).nullable().optional(),
  frame_time_ms: z.number().int().min(0).nullable().optional(),
});
export type ImageRef = z.infer<typeof ImageRef>;

export const EvidenceRef = z.object({
  frame_id: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const WinCondition = z.object({
  type: z.enum(["first_to_points"]),
  points: z.number().int().min(1).max(100).default(5),
});
export type WinCondition = z.infer<typeof WinCondition>;

export const VoiceRules = z.object({
  require_quiet_before_prompt: z.boolean().default(true),
  quiet_ms: z.number().int().min(200).max(10000).default(1000),
  max_wait_ms: z.number().int().min(1000).max(30000).default(8000),
  noise_threshold_db: z.number().min(-80).max(0).default(-40),
});
export type VoiceRules = z.infer<typeof VoiceRules>;

export const PrivacyConfig = z.object({
  store_audio: z.boolean().default(false),
  store_frames: z.boolean().default(true),
  retention_days: z.number().int().min(0).max(365).default(7),
});
export type PrivacyConfig = z.infer<typeof PrivacyConfig>;

export const FinalScore = z.object({
  participant_identity: z.string(),
  display_name: z.string().nullable().optional(),
  score: z.number().int(),
  rank: z.number().int().min(1),
  correct_answers: z.number().int().min(0).nullable().optional(),
  avg_answer_time_ms: z.number().int().min(0).nullable().optional(),
});
export type FinalScore = z.infer<typeof FinalScore>;

export const SessionIdParam = z.object({
  session_id: z.string().regex(/^sess_[A-Za-z0-9_\-]+$/),
});
export type SessionIdParam = z.infer<typeof SessionIdParam>;

export const HealthResponse = z.object({
  ok: z.literal(true),
  version: z.string().optional(),
  uptime_seconds: z.number().int().min(0).optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
