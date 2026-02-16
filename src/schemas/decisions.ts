import { z } from "zod";

export const TriviaAnswerDecision = z.object({
  session_id: z.string(),
  round_id: z.string(),
  question_id: z.string(),
  participant_identity: z.string(),
  is_correct: z.boolean().nullable().optional(),
  canonical_answer: z.string().nullable().optional(),
  answer_time_ms: z.number().int().min(0),
  transcript: z.string(),
  normalized_answer: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  stt_vendor: z.string().nullable().optional(),
  raw: z.record(z.unknown()).optional(),
});
export type TriviaAnswerDecision = z.infer<typeof TriviaAnswerDecision>;

export const QuickDrawCorrectDecision = z.object({
  session_id: z.string(),
  round_id: z.string(),
  participant_identity: z.string(),
  frame_time_ms: z.number().int().min(0),
  correct: z.literal(true),
  confidence: z.number().min(0).max(1),
  evidence: z.object({
    frame_id: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
  }).optional(),
  vision_vendor: z.string().nullable().optional(),
  raw: z.record(z.unknown()).optional(),
});
export type QuickDrawCorrectDecision = z.infer<typeof QuickDrawCorrectDecision>;
