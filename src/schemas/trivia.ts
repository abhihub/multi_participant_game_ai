import { z } from "zod";
import { Difficulty } from "./enums.js";

export const SetTriviaTopicRequest = z.object({
  topic: z.string().min(1).max(120),
  difficulty: Difficulty.optional(),
  question_count: z.number().int().min(1).max(50).default(10),
});
export type SetTriviaTopicRequest = z.infer<typeof SetTriviaTopicRequest>;

export const TriviaQuestionPublic = z.object({
  question_id: z.string(),
  prompt: z.string(),
  answer_window_ms: z.number().int().min(500).max(60000),
  spoken: z.boolean().default(true),
});
export type TriviaQuestionPublic = z.infer<typeof TriviaQuestionPublic>;

export const TriviaMutePolicy = z.object({
  muted_during_tts: z.boolean().default(true),
  unmute_at_ms: z.number().int().min(0).nullable().optional(),
});

export const TriviaState = z.object({
  topic: z.string(),
  difficulty: Difficulty.optional(),
  question_index: z.number().int().min(0),
  current_question: TriviaQuestionPublic.optional(),
  mute_policy: TriviaMutePolicy.optional(),
});
export type TriviaState = z.infer<typeof TriviaState>;
