import type { GameEventEnvelope, WebhookRegistration } from "./types.js";
import type { GameEventType } from "../schemas/enums.js";

class EventBus {
  private logs = new Map<string, GameEventEnvelope[]>();
  private seqs = new Map<string, number>();
  private webhooks: WebhookRegistration[] = [];

  emit(sessionId: string, type: GameEventType, payload: Record<string, unknown>): GameEventEnvelope {
    const seq = (this.seqs.get(sessionId) ?? 0) + 1;
    this.seqs.set(sessionId, seq);

    const envelope: GameEventEnvelope = {
      v: 1,
      session_id: sessionId,
      seq,
      ts_ms: Date.now(),
      type,
      payload,
    };

    let log = this.logs.get(sessionId);
    if (!log) {
      log = [];
      this.logs.set(sessionId, log);
    }
    log.push(envelope);

    this.dispatchWebhooks(envelope);
    return envelope;
  }

  getEvents(sessionId: string, afterSeq?: number, limit = 200): {
    events: GameEventEnvelope[];
    next_after_seq: number | null;
  } {
    const log = this.logs.get(sessionId) ?? [];
    const filtered = afterSeq != null
      ? log.filter((e) => e.seq > afterSeq)
      : log;

    const page = filtered.slice(0, limit);
    const nextSeq = page.length > 0 ? page[page.length - 1].seq : null;

    return { events: page, next_after_seq: nextSeq };
  }

  getSequence(sessionId: string): number {
    return this.seqs.get(sessionId) ?? 0;
  }

  addWebhook(webhook: WebhookRegistration): void {
    this.webhooks.push(webhook);
  }

  private dispatchWebhooks(envelope: GameEventEnvelope): void {
    for (const wh of this.webhooks) {
      if (wh.events.includes(envelope.type)) {
        // Fire-and-forget
        fetch(wh.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
        }).catch(() => {
          // Ignore webhook delivery failures in v1
        });
      }
    }
  }
}

export const eventBus = new EventBus();
