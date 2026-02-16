import { z } from "zod";
import { BBox, Point, ImageRef, EvidenceRef } from "./common.js";

export const PaperRegion = z.object({
  bbox: BBox,
  quad: z.array(Point).length(4),
  quality: z.object({
    blur_score: z.number(),
    motion_score: z.number(),
    size_ratio: z.number().min(0).max(1),
  }),
});
export type PaperRegion = z.infer<typeof PaperRegion>;

export const VisionPaperDetectRequest = z.object({
  session_id: z.string(),
  participant_identity: z.string(),
  image: ImageRef,
  hints: z.object({
    max_regions: z.number().int().min(1).max(5).default(2),
  }).optional(),
});
export type VisionPaperDetectRequest = z.infer<typeof VisionPaperDetectRequest>;

export const VisionPaperDetectResponse = z.object({
  regions: z.array(PaperRegion),
});
export type VisionPaperDetectResponse = z.infer<typeof VisionPaperDetectResponse>;

export const VisionQuickDrawJudgeRequest = z.object({
  session_id: z.string(),
  participant_identity: z.string(),
  prompt: z.string(),
  image: ImageRef,
  crop: z.object({
    quad: z.array(Point).length(4),
  }).optional(),
});
export type VisionQuickDrawJudgeRequest = z.infer<typeof VisionQuickDrawJudgeRequest>;

export const VisionQuickDrawJudgeResponse = z.object({
  correct: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().nullable().optional(),
});
export type VisionQuickDrawJudgeResponse = z.infer<typeof VisionQuickDrawJudgeResponse>;

export const CreateVisionStreamRequest = z.object({
  session_id: z.string(),
  participant_identity: z.string(),
  prompt: z.string(),
  sample_fps: z.number().min(0.5).max(10).default(3),
  image: z.object({
    content_type: z.enum(["image/jpeg", "image/png"]).default("image/jpeg"),
    width: z.number().int().min(1).nullable().optional(),
    height: z.number().int().min(1).nullable().optional(),
  }).optional(),
  pipeline: z.object({
    paper_detect: z.boolean().default(true),
    quickdraw_judge: z.boolean().default(true),
  }).optional(),
  callbacks: z.object({
    result_url: z.string().url().nullable().optional(),
  }).optional(),
});
export type CreateVisionStreamRequest = z.infer<typeof CreateVisionStreamRequest>;

export const CreateVisionStreamResponse = z.object({
  vision_stream_id: z.string(),
  status: z.enum(["open"]),
});
export type CreateVisionStreamResponse = z.infer<typeof CreateVisionStreamResponse>;

export const VideoFrame = z.object({
  ts_ms: z.number().int().min(0),
  bytes_base64: z.string(),
  content_type: z.enum(["image/jpeg", "image/png"]).default("image/jpeg"),
});
export type VideoFrame = z.infer<typeof VideoFrame>;

export const VisionFeedRequest = z.object({
  frames: z.array(VideoFrame).min(1),
});
export type VisionFeedRequest = z.infer<typeof VisionFeedRequest>;

export const VisionResult = z.object({
  seq: z.number().int().min(0),
  ts_ms: z.number().int().min(0),
  paper_detected: z.boolean(),
  regions: z.array(PaperRegion).nullable().optional(),
  match: z.object({
    correct: z.boolean(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().nullable().optional(),
  }).nullable().optional(),
  evidence: EvidenceRef.optional(),
});
export type VisionResult = z.infer<typeof VisionResult>;

export const VisionResultsResponse = z.object({
  vision_stream_id: z.string(),
  results: z.array(VisionResult),
  next_after_seq: z.number().int().nullable().optional(),
});
export type VisionResultsResponse = z.infer<typeof VisionResultsResponse>;

export const VisionStreamIdParam = z.object({
  vision_stream_id: z.string().regex(/^vis_[A-Za-z0-9_\-]+$/),
});
export type VisionStreamIdParam = z.infer<typeof VisionStreamIdParam>;
