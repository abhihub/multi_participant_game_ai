import { z } from "zod";
import { SpeakMode, TtsJobStatus } from "./enums.js";

export const TtsOutput = z.object({
  codec: z.enum(["pcm_s16le"]).default("pcm_s16le"),
  sample_rate_hz: z.enum(["16000", "24000", "48000"]).transform(Number).or(z.number().int()).default(48000),
  channels: z.literal(1).default(1),
});

export const TtsSpeakRequest = z.object({
  session_id: z.string(),
  text: z.string().min(1).max(2000),
  language: z.string().default("en-US"),
  voice: z.string().default("default"),
  speak_mode: SpeakMode.default("freeform"),
  rate: z.number().min(0.5).max(2.0).default(1.0),
  pitch: z.number().min(-20).max(20).default(0),
  output: z.object({
    codec: z.enum(["pcm_s16le"]).default("pcm_s16le"),
    sample_rate_hz: z.number().int().default(48000),
    channels: z.literal(1).default(1),
  }).optional(),
});
export type TtsSpeakRequest = z.infer<typeof TtsSpeakRequest>;

export const TtsSpeakResponse = z.object({
  job_id: z.string(),
  speak_id: z.string().optional(),
  status: TtsJobStatus,
});
export type TtsSpeakResponse = z.infer<typeof TtsSpeakResponse>;

export const AudioRef = z.object({
  content_type: z.enum(["audio/wav", "audio/pcm"]).optional(),
  url: z.string().url().nullable().optional(),
  bytes_base64: z.string().nullable().optional(),
  duration_ms: z.number().int().min(0).optional(),
});
export type AudioRef = z.infer<typeof AudioRef>;

export const TtsJob = z.object({
  job_id: z.string(),
  status: TtsJobStatus,
  error: z.string().nullable().optional(),
  audio: AudioRef.optional(),
});
export type TtsJob = z.infer<typeof TtsJob>;

export const JobIdParam = z.object({
  job_id: z.string().regex(/^job_[A-Za-z0-9_\-]+$/),
});
export type JobIdParam = z.infer<typeof JobIdParam>;
