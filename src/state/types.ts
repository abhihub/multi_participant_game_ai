import type { GameType, SessionStatus, ParticipantRole, FloorMode, Difficulty, SpeakMode, TtsJobStatus, GameEventType } from "../schemas/enums.js";

export interface ParticipantState {
  identity: string;
  display_name?: string;
  role: ParticipantRole;
  score: number;
  muted: boolean;
  joined_at_ms: number;
  metadata?: Record<string, unknown>;
}

export interface FloorStateInternal {
  mode: FloorMode;
  allowed_roles?: ParticipantRole[] | null;
  allowed_identities?: string[] | null;
  held_by?: string | null;
  expires_at_ms?: number | null;
}

export interface RoundState {
  round_id: string;
  round_index: number;
  phase: string;
  ends_at_ms: number;
}

export interface TriviaConfig {
  topic: string;
  difficulty?: Difficulty;
  question_count: number;
  question_index: number;
}

export interface QuickDrawConfig {
  category?: string | null;
  difficulty?: Difficulty;
  prompt_count: number;
  prompt_index: number;
  round_duration_ms: number;
  current_prompt?: string;
}

export interface SessionState {
  id: string;
  game: GameType;
  status: SessionStatus;
  livekit: {
    room_name: string;
    room_region?: string | null;
  };
  tokens: {
    host_token: string;
    moderator_token: string;
    session_admin_token: string;
  };
  config: {
    max_players: number;
    language: string;
    moderator_voice: string;
    win_condition: { type: "first_to_points"; points: number };
    voice_rules?: {
      require_quiet_before_prompt: boolean;
      quiet_ms: number;
      max_wait_ms: number;
      noise_threshold_db: number;
    };
    debug_events?: string;
    evidence_mode?: string;
    privacy?: {
      store_audio: boolean;
      store_frames: boolean;
      retention_days: number;
    };
  };
  participants: Map<string, ParticipantState>;
  floor: FloorStateInternal;
  round: RoundState | null;
  trivia: TriviaConfig | null;
  quickdraw: QuickDrawConfig | null;
  moderator_identity: string | null;
  metadata?: Record<string, unknown>;
  created_at_ms: number;
  /** Active mute timers keyed by participant identity */
  muteTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Floor auto-release timer */
  floorTimer?: ReturnType<typeof setTimeout>;
}

export interface TtsJobState {
  job_id: string;
  speak_id: string;
  session_id: string;
  status: TtsJobStatus;
  text: string;
  speak_mode: SpeakMode;
  created_at_ms: number;
}

export interface SttStreamState {
  stream_id: string;
  session_id: string;
  participant_identity: string;
  round_id?: string | null;
  question_id?: string | null;
  status: "open" | "closed";
  results: Array<{
    seq: number;
    ts_ms: number;
    is_final: boolean;
    text: string;
    confidence: number;
    word_timing?: Array<{ word: string; start_ms: number; end_ms: number }> | null;
  }>;
  seq: number;
}

export interface PaperRegionState {
  bbox: { x: number; y: number; w: number; h: number };
  quad: Array<{ x: number; y: number }>;
  quality: { blur_score: number; motion_score: number; size_ratio: number };
}

export interface VisionStreamState {
  vision_stream_id: string;
  session_id: string;
  participant_identity: string;
  prompt: string;
  status: "open" | "closed";
  results: Array<{
    seq: number;
    ts_ms: number;
    paper_detected: boolean;
    regions?: PaperRegionState[] | null;
    match?: { correct: boolean; confidence: number; rationale?: string | null } | null;
    evidence?: { frame_id?: string | null; url?: string | null };
  }>;
  seq: number;
}

export interface WebhookRegistration {
  webhook_id: string;
  url: string;
  events: string[];
  secret?: string | null;
}

export interface GameEventEnvelope {
  v: 1;
  session_id: string;
  seq: number;
  ts_ms: number;
  type: GameEventType;
  payload: Record<string, unknown>;
}
