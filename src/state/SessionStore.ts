import { AccessToken } from "livekit-server-sdk";
import { config } from "../config.js";
import { generateSessionId, generateRoundId } from "../utils/ids.js";
import { eventBus } from "./EventBus.js";
import type {
  SessionState, ParticipantState, FloorStateInternal,
  TriviaConfig, QuickDrawConfig,
} from "./types.js";
import type { CreateSessionRequest } from "../schemas/session.js";
import type { ParticipantRole } from "../schemas/enums.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  created: ["running"],
  running: ["paused", "ended", "error"],
  paused: ["running", "ended", "error"],
};

class SessionStore {
  private sessions = new Map<string, SessionState>();

  async createSession(req: CreateSessionRequest): Promise<SessionState> {
    const sessionId = generateSessionId();
    const now = Date.now();

    const winCondition = req.config?.win_condition ?? { type: "first_to_points" as const, points: 5 };

    const hasLiveKit = !!(config.livekit.apiKey && config.livekit.apiSecret);
    const hostToken = hasLiveKit
      ? await this.mintLiveKitToken(req.livekit.room_name, `host_${sessionId}`)
      : `tok_host_${sessionId}`;
    const modToken = hasLiveKit
      ? await this.mintLiveKitToken(req.livekit.room_name, `moderator_${sessionId}`)
      : `tok_mod_${sessionId}`;
    const adminToken = `adm_${sessionId}_${Date.now().toString(36)}`;

    const session: SessionState = {
      id: sessionId,
      game: req.game,
      status: "created",
      livekit: {
        room_name: req.livekit.room_name,
        room_region: req.livekit.room_region ?? null,
      },
      tokens: {
        host_token: hostToken,
        moderator_token: modToken,
        session_admin_token: adminToken,
      },
      config: {
        max_players: req.config?.max_players ?? 6,
        language: req.config?.language ?? "en-US",
        moderator_voice: req.config?.moderator_voice ?? "default",
        win_condition: winCondition,
        voice_rules: req.config?.voice_rules,
        debug_events: req.config?.debug_events,
        evidence_mode: req.config?.evidence_mode,
        privacy: req.config?.privacy,
      },
      participants: new Map(),
      floor: { mode: "open" },
      round: null,
      trivia: req.game === "trivia" ? { topic: "General Knowledge", difficulty: undefined, question_count: 10, question_index: 0 } : null,
      quickdraw: req.game === "quick_draw" ? { category: null, difficulty: undefined, prompt_count: 10, prompt_index: 0, round_duration_ms: 25000, current_prompt: "Draw something" } : null,
      moderator_identity: null,
      metadata: req.metadata,
      created_at_ms: now,
      muteTimers: new Map(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(id: string): SessionState {
    const s = this.sessions.get(id);
    if (!s) throw Object.assign(new Error("Session not found"), { statusCode: 404 });
    return s;
  }

  findSessionByAdminToken(token: string): SessionState | undefined {
    for (const s of this.sessions.values()) {
      if (s.tokens.session_admin_token === token) return s;
    }
    return undefined;
  }

  async addParticipant(
    sessionId: string,
    req: { identity: string; display_name?: string; role: ParticipantRole; metadata?: Record<string, unknown> },
  ): Promise<{ livekit_token: string; participant: ParticipantState }> {
    const session = this.getSession(sessionId);

    const playerCount = [...session.participants.values()].filter((p) => p.role === "player").length;
    if (req.role === "player" && playerCount >= session.config.max_players) {
      throw Object.assign(new Error("Session is full"), { statusCode: 409 });
    }

    const hasLiveKit = !!(config.livekit.apiKey && config.livekit.apiSecret);
    const lkToken = hasLiveKit
      ? await this.mintLiveKitToken(session.livekit.room_name, req.identity)
      : `lk_tok_${sessionId}_${req.identity}`;

    const participant: ParticipantState = {
      identity: req.identity,
      display_name: req.display_name,
      role: req.role,
      score: 0,
      muted: false,
      joined_at_ms: Date.now(),
      metadata: req.metadata,
    };

    session.participants.set(req.identity, participant);
    return { livekit_token: lkToken, participant };
  }

  transitionStatus(id: string, target: string): SessionState {
    const session = this.getSession(id);
    const allowed = VALID_TRANSITIONS[session.status];
    if (!allowed || !allowed.includes(target)) {
      throw Object.assign(
        new Error(`Cannot transition from '${session.status}' to '${target}'`),
        { statusCode: 409 },
      );
    }
    session.status = target as SessionState["status"];

    if (target === "ended") {
      this.clearSessionTimers(session);
    }

    return session;
  }

  getParticipants(id: string, filter?: { role?: ParticipantRole; identity?: string }): ParticipantState[] {
    const session = this.getSession(id);
    let participants = [...session.participants.values()];
    if (filter?.role) participants = participants.filter((p) => p.role === filter.role);
    if (filter?.identity) participants = participants.filter((p) => p.identity === filter.identity);
    return participants;
  }

  muteParticipants(
    id: string,
    req: {
      participant_identities?: string[];
      target_roles?: ParticipantRole[];
      exclude_roles?: ParticipantRole[];
      duration_ms?: number | null;
    },
  ): string[] {
    const session = this.getSession(id);
    const targets = this.resolveTargets(session, req);

    for (const identity of targets) {
      const p = session.participants.get(identity);
      if (p) p.muted = true;

      // Clear existing timer
      const existing = session.muteTimers.get(identity);
      if (existing) clearTimeout(existing);

      if (req.duration_ms && req.duration_ms > 0) {
        const timer = setTimeout(() => {
          const p2 = session.participants.get(identity);
          if (p2) p2.muted = false;
          session.muteTimers.delete(identity);
          eventBus.emit(id, "participants.mute.changed", {
            affected_identities: [identity],
            muted: false,
            reason: "auto_unmute",
            source: "auto_unmute",
          });
        }, req.duration_ms);
        session.muteTimers.set(identity, timer);
      }
    }

    return targets;
  }

  unmuteParticipants(
    id: string,
    req: {
      participant_identities?: string[];
      target_roles?: ParticipantRole[];
      exclude_roles?: ParticipantRole[];
    },
  ): string[] {
    const session = this.getSession(id);
    const targets = this.resolveTargets(session, req);

    for (const identity of targets) {
      const p = session.participants.get(identity);
      if (p) p.muted = false;
      // Clear any pending auto-unmute timer
      const timer = session.muteTimers.get(identity);
      if (timer) {
        clearTimeout(timer);
        session.muteTimers.delete(identity);
      }
    }

    return targets;
  }

  overrideScore(id: string, req: { participant_identity: string; delta: number; reason?: string }): {
    participant: ParticipantState;
    session: SessionState;
  } {
    const session = this.getSession(id);
    const p = session.participants.get(req.participant_identity);
    if (!p) throw Object.assign(new Error("Participant not found"), { statusCode: 404 });

    p.score += req.delta;

    eventBus.emit(id, "score.updated", {
      participant_identity: p.identity,
      score: p.score,
      delta: req.delta,
      reason: req.reason ?? null,
    });

    this.checkWinCondition(session);
    return { participant: p, session };
  }

  setFloor(
    id: string,
    req: {
      mode: FloorStateInternal["mode"];
      allowed_roles?: ParticipantRole[];
      allowed_identities?: string[];
      duration_ms?: number | null;
    },
  ): FloorStateInternal {
    const session = this.getSession(id);

    // Clear existing floor timer
    if (session.floorTimer) {
      clearTimeout(session.floorTimer);
      session.floorTimer = undefined;
    }

    const expiresAt = req.duration_ms ? Date.now() + req.duration_ms : null;

    session.floor = {
      mode: req.mode,
      allowed_roles: req.allowed_roles ?? null,
      allowed_identities: req.allowed_identities ?? null,
      held_by: "moderator",
      expires_at_ms: expiresAt,
    };

    if (req.duration_ms && req.duration_ms > 0) {
      session.floorTimer = setTimeout(() => {
        this.releaseFloor(id);
        eventBus.emit(id, "floor.changed", {
          floor: session.floor,
          changed_by: "system",
          reason: "auto_release",
        });
      }, req.duration_ms);
    }

    return session.floor;
  }

  releaseFloor(id: string): FloorStateInternal {
    const session = this.getSession(id);
    if (session.floorTimer) {
      clearTimeout(session.floorTimer);
      session.floorTimer = undefined;
    }
    session.floor = { mode: "open" };
    return session.floor;
  }

  setTriviaConfig(id: string, req: { topic: string; difficulty?: string; question_count: number }): void {
    const session = this.getSession(id);
    if (session.game !== "trivia") {
      throw Object.assign(new Error("Session is not a trivia game"), { statusCode: 409 });
    }
    session.trivia = {
      topic: req.topic,
      difficulty: req.difficulty as TriviaConfig["difficulty"],
      question_count: req.question_count,
      question_index: 0,
    };
  }

  setQuickDrawConfig(
    id: string,
    req: { category?: string | null; difficulty?: string; prompt_count: number; round_duration_ms: number },
  ): void {
    const session = this.getSession(id);
    if (session.game !== "quick_draw") {
      throw Object.assign(new Error("Session is not a quick_draw game"), { statusCode: 409 });
    }
    session.quickdraw = {
      category: req.category ?? null,
      difficulty: req.difficulty as QuickDrawConfig["difficulty"],
      prompt_count: req.prompt_count,
      prompt_index: 0,
      round_duration_ms: req.round_duration_ms,
      current_prompt: "Draw something",
    };
  }

  advanceRound(id: string): { action: "advanced" | "session_ended"; round_index: number | null } {
    const session = this.getSession(id);
    if (session.status !== "running") {
      throw Object.assign(new Error("Session is not running"), { statusCode: 409 });
    }

    const roundId = generateRoundId();
    const currentIndex = session.round ? session.round.round_index + 1 : 0;

    // Check if we've exhausted all questions/prompts
    const totalRounds = session.game === "trivia"
      ? (session.trivia?.question_count ?? 10)
      : (session.quickdraw?.prompt_count ?? 10);

    if (currentIndex >= totalRounds) {
      this.transitionStatus(id, "ended");
      const finalScores = this.buildFinalScores(session);
      const winner = finalScores.length > 0 ? finalScores[0] : null;

      if (winner) {
        eventBus.emit(id, "game.winner", {
          winner_identity: winner.participant_identity,
          winner_display_name: winner.display_name ?? null,
          final_scores: finalScores,
          win_condition_met: "all_questions_done",
        });
      }

      eventBus.emit(id, "session.ended", {
        at_ms: Date.now(),
        reason: "all_rounds_completed",
        winner_identity: winner?.participant_identity ?? null,
        final_scores: finalScores,
      });

      return { action: "session_ended", round_index: null };
    }

    session.round = {
      round_id: roundId,
      round_index: currentIndex,
      phase: "active",
      ends_at_ms: Date.now() + 30000,
    };

    // Update game-specific index
    if (session.trivia) session.trivia.question_index = currentIndex;
    if (session.quickdraw) session.quickdraw.prompt_index = currentIndex;

    eventBus.emit(id, "round.started", {
      round_id: roundId,
      ends_at_ms: session.round.ends_at_ms,
    });

    return { action: "advanced", round_index: currentIndex };
  }

  skipRound(id: string, scope: "current_question" | "current_round"): void {
    const session = this.getSession(id);
    if (!session.round) return;

    if (scope === "current_round" || scope === "current_question") {
      eventBus.emit(id, "round.ended", {
        round_id: session.round.round_id,
        winner_identity: null,
        tie: false,
      });
    }
  }

  ingestTriviaAnswer(decision: {
    session_id: string;
    round_id: string;
    question_id: string;
    participant_identity: string;
    is_correct?: boolean | null;
    transcript: string;
    confidence: number;
    answer_time_ms: number;
  }): void {
    const session = this.getSession(decision.session_id);

    eventBus.emit(decision.session_id, "trivia.answer.detected", {
      round_id: decision.round_id,
      question_id: decision.question_id,
      participant_identity: decision.participant_identity,
      transcript: decision.transcript,
      confidence: decision.confidence,
      answer_time_ms: decision.answer_time_ms,
    });

    if (decision.is_correct) {
      const p = session.participants.get(decision.participant_identity);
      if (p) {
        p.score += 1;

        eventBus.emit(decision.session_id, "score.updated", {
          participant_identity: p.identity,
          score: p.score,
          delta: 1,
          reason: "correct_trivia_answer",
        });

        eventBus.emit(decision.session_id, "trivia.winner", {
          round_id: decision.round_id,
          question_id: decision.question_id,
          winner_identity: p.identity,
          answer: decision.transcript,
          answer_time_ms: decision.answer_time_ms,
          reason: "first_correct",
        });

        this.checkWinCondition(session);
      }
    }
  }

  ingestQuickDrawCorrect(decision: {
    session_id: string;
    round_id: string;
    participant_identity: string;
    frame_time_ms: number;
    confidence: number;
    evidence?: { frame_id?: string | null; url?: string | null };
  }): void {
    const session = this.getSession(decision.session_id);

    eventBus.emit(decision.session_id, "quickdraw.correct.detected", {
      round_id: decision.round_id,
      participant_identity: decision.participant_identity,
      frame_time_ms: decision.frame_time_ms,
      confidence: decision.confidence,
      evidence: decision.evidence,
    });

    const p = session.participants.get(decision.participant_identity);
    if (p) {
      p.score += 1;

      eventBus.emit(decision.session_id, "score.updated", {
        participant_identity: p.identity,
        score: p.score,
        delta: 1,
        reason: "correct_quickdraw_detection",
      });

      eventBus.emit(decision.session_id, "quickdraw.winner", {
        round_id: decision.round_id,
        winner_identity: p.identity,
        win_time_ms: decision.frame_time_ms,
        confidence: decision.confidence,
        tie: false,
      });

      this.checkWinCondition(session);
    }
  }

  private checkWinCondition(session: SessionState): void {
    if (session.status !== "running") return;

    const threshold = session.config.win_condition.points;
    for (const p of session.participants.values()) {
      if (p.score >= threshold) {
        const finalScores = this.buildFinalScores(session);

        eventBus.emit(session.id, "game.winner", {
          winner_identity: p.identity,
          winner_display_name: p.display_name ?? null,
          final_scores: finalScores,
          win_condition_met: "first_to_points",
        });

        this.transitionStatus(session.id, "ended");

        eventBus.emit(session.id, "session.ended", {
          at_ms: Date.now(),
          reason: "win_condition_met",
          winner_identity: p.identity,
          final_scores: finalScores,
        });

        return;
      }
    }
  }

  private buildFinalScores(session: SessionState) {
    const players = [...session.participants.values()]
      .filter((p) => p.role === "player")
      .sort((a, b) => b.score - a.score);

    return players.map((p, i) => ({
      participant_identity: p.identity,
      display_name: p.display_name ?? null,
      score: p.score,
      rank: i + 1,
    }));
  }

  private resolveTargets(
    session: SessionState,
    req: {
      participant_identities?: string[];
      target_roles?: ParticipantRole[];
      exclude_roles?: ParticipantRole[];
    },
  ): string[] {
    if (req.participant_identities && req.participant_identities.length > 0) {
      return req.participant_identities.filter((id) => session.participants.has(id));
    }

    let participants = [...session.participants.values()];

    if (req.target_roles && req.target_roles.length > 0) {
      participants = participants.filter((p) => req.target_roles!.includes(p.role));
    }

    if (req.exclude_roles && req.exclude_roles.length > 0) {
      participants = participants.filter((p) => !req.exclude_roles!.includes(p.role));
    }

    return participants.map((p) => p.identity);
  }

  private clearSessionTimers(session: SessionState): void {
    for (const timer of session.muteTimers.values()) {
      clearTimeout(timer);
    }
    session.muteTimers.clear();
    if (session.floorTimer) {
      clearTimeout(session.floorTimer);
      session.floorTimer = undefined;
    }
  }

  private async mintLiveKitToken(roomName: string, identity: string): Promise<string> {
    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity,
    });
    at.addGrant({ roomJoin: true, room: roomName });
    return await at.toJwt();
  }
}

export const sessionStore = new SessionStore();
