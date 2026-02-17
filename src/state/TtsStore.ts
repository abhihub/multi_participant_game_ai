import type { TtsJobState } from "./types.js";
import type { SpeakMode, TtsJobStatus } from "../schemas/enums.js";
import { generateJobId, generateSpeakId } from "../utils/ids.js";

class TtsStore {
  private jobs = new Map<string, TtsJobState>();

  createJob(sessionId: string, text: string, speakMode: SpeakMode): TtsJobState {
    const job: TtsJobState = {
      job_id: generateJobId(),
      speak_id: generateSpeakId(),
      session_id: sessionId,
      status: "queued",
      text,
      speak_mode: speakMode,
      created_at_ms: Date.now(),
    };
    this.jobs.set(job.job_id, job);
    return job;
  }

  getJob(jobId: string): TtsJobState {
    const job = this.jobs.get(jobId);
    if (!job) throw Object.assign(new Error("TTS job not found"), { statusCode: 404 });
    return job;
  }

  updateStatus(jobId: string, status: TtsJobStatus): TtsJobState {
    const job = this.getJob(jobId);
    job.status = status;
    return job;
  }
}

export const ttsStore = new TtsStore();
