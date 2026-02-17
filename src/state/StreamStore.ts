import type { SttStreamState, VisionStreamState } from "./types.js";
import { generateSttStreamId, generateVisionStreamId } from "../utils/ids.js";

class StreamStore {
  private sttStreams = new Map<string, SttStreamState>();
  private visionStreams = new Map<string, VisionStreamState>();

  // --- STT ---

  createSttStream(req: {
    session_id: string;
    participant_identity: string;
    round_id?: string | null;
    question_id?: string | null;
  }): SttStreamState {
    const stream: SttStreamState = {
      stream_id: generateSttStreamId(),
      session_id: req.session_id,
      participant_identity: req.participant_identity,
      round_id: req.round_id ?? null,
      question_id: req.question_id ?? null,
      status: "open",
      results: [],
      seq: 0,
    };
    this.sttStreams.set(stream.stream_id, stream);
    return stream;
  }

  getSttStream(streamId: string): SttStreamState {
    const s = this.sttStreams.get(streamId);
    if (!s) throw Object.assign(new Error("STT stream not found"), { statusCode: 404 });
    return s;
  }

  closeSttStream(streamId: string): void {
    const s = this.getSttStream(streamId);
    s.status = "closed";
  }

  getSttResults(streamId: string, afterSeq?: number, limit = 200) {
    const s = this.getSttStream(streamId);
    const filtered = afterSeq != null
      ? s.results.filter((r) => r.seq > afterSeq)
      : s.results;
    const page = filtered.slice(0, limit);
    const nextSeq = page.length > 0 ? page[page.length - 1].seq : null;
    return { stream_id: streamId, results: page, next_after_seq: nextSeq };
  }

  // --- Vision ---

  createVisionStream(req: {
    session_id: string;
    participant_identity: string;
    prompt: string;
  }): VisionStreamState {
    const stream: VisionStreamState = {
      vision_stream_id: generateVisionStreamId(),
      session_id: req.session_id,
      participant_identity: req.participant_identity,
      prompt: req.prompt,
      status: "open",
      results: [],
      seq: 0,
    };
    this.visionStreams.set(stream.vision_stream_id, stream);
    return stream;
  }

  getVisionStream(streamId: string): VisionStreamState {
    const s = this.visionStreams.get(streamId);
    if (!s) throw Object.assign(new Error("Vision stream not found"), { statusCode: 404 });
    return s;
  }

  closeVisionStream(streamId: string): void {
    const s = this.getVisionStream(streamId);
    s.status = "closed";
  }

  getVisionResults(streamId: string, afterSeq?: number, limit = 200) {
    const s = this.getVisionStream(streamId);
    const filtered = afterSeq != null
      ? s.results.filter((r) => r.seq > afterSeq)
      : s.results;
    const page = filtered.slice(0, limit);
    const nextSeq = page.length > 0 ? page[page.length - 1].seq : null;
    return { vision_stream_id: streamId, results: page, next_after_seq: nextSeq };
  }
}

export const streamStore = new StreamStore();
