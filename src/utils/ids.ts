import { nanoid } from "nanoid";

export const generateSessionId = () => `sess_${nanoid(16)}`;
export const generateJobId = () => `job_${nanoid(16)}`;
export const generateSttStreamId = () => `stt_${nanoid(16)}`;
export const generateVisionStreamId = () => `vis_${nanoid(16)}`;
export const generateSpeakId = () => `spk_${nanoid(16)}`;
export const generateWebhookId = () => `whk_${nanoid(16)}`;
export const generateRoundId = () => `rnd_${nanoid(12)}`;
export const generateQuestionId = () => `qst_${nanoid(12)}`;
