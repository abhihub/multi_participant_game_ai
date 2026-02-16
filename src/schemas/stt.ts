import { z } from "zod";

export const CreateSttStreamRequest = z.object({
  session_id: z.string(),
  participant_identity: z.string(),
  round_id: z.string().nullable().optional(),
  question_id: z.string().nullable().optional(),
  language: z.string().default("en-US"),
  audio: z.object({
    codec: z.enum(["pcm_s16le"]),
    sample_rate_hz: z.number().int().default(48000),
    channels: z.literal(1).default(1),
  }).optional(),
  callbacks: z.object({
    result_url: z.string().url().nullable().optional(),
  }).optional(),
});
export type CreateSttStreamRequest = z.infer<typeof CreateSttStreamRequest>;

export const CreateSttStreamResponse = z.object({
  stream_id: z.string(),
  status: z.enum(["open"]),
});
export type CreateSttStreamResponse = z.infer<typeof CreateSttStreamResponse>;

export const AudioFrame = z.object({
  ts_ms: z.number().int().min(0),
  bytes_base64: z.string(),
  is_speech: z.boolean().nullable().optional(),
});
export type AudioFrame = z.infer<typeof AudioFrame>;

export const SttFeedRequest = z.object({
  frames: z.array(AudioFrame).min(1),
});
export type SttFeedRequest = z.infer<typeof SttFeedRequest>;

export const WordTiming = z.object({
  word: z.string(),
  start_ms: z.number().int().min(0),
  end_ms: z.number().int().min(0),
});
export type WordTiming = z.infer<typeof WordTiming>;

export const SttResult = z.object({
  seq: z.number().int().min(0),
  ts_ms: z.number().int().min(0),
  is_final: z.boolean(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  word_timing: z.array(WordTiming).nullable().optional(),
});
export type SttResult = z.infer<typeof SttResult>;

export const SttResultsResponse = z.object({
  stream_id: z.string(),
  results: z.array(SttResult),
  next_after_seq: z.number().int().nullable().optional(),
});
export type SttResultsResponse = z.infer<typeof SttResultsResponse>;

export const StreamIdParam = z.object({
  stream_id: z.string().regex(/^stt_[A-Za-z0-9_\-]+$/),
});
export type StreamIdParam = z.infer<typeof StreamIdParam>;

export const AfterSeqQuery = z.object({
  after_seq: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export type AfterSeqQuery = z.infer<typeof AfterSeqQuery>;
