import { z } from "zod";
import { GameType, SessionStatus, ParticipantRole, DebugEventsMode, EvidenceMode } from "./enums.js";
import { WinCondition, VoiceRules, PrivacyConfig } from "./common.js";

export const LiveKitRoomRef = z.object({
  room_name: z.string().min(1),
  room_region: z.string().nullable().optional(),
});
export type LiveKitRoomRef = z.infer<typeof LiveKitRoomRef>;

export const SessionConfig = z.object({
  max_players: z.number().int().min(2).max(50).default(6),
  language: z.string().default("en-US"),
  moderator_voice: z.string().default("default"),
  win_condition: WinCondition.optional(),
  voice_rules: VoiceRules.optional(),
  debug_events: DebugEventsMode.optional(),
  evidence_mode: EvidenceMode.optional(),
  privacy: PrivacyConfig.optional(),
});
export type SessionConfig = z.infer<typeof SessionConfig>;

export const SessionTokens = z.object({
  host_token: z.string(),
  moderator_token: z.string(),
  session_admin_token: z.string(),
});
export type SessionTokens = z.infer<typeof SessionTokens>;

export const RealtimeConfig = z.object({
  transport: z.enum(["livekit_datachannel"]),
  topic: z.enum(["game.events.v1"]),
});
export type RealtimeConfig = z.infer<typeof RealtimeConfig>;

export const Participant = z.object({
  identity: z.string(),
  display_name: z.string().optional(),
  role: ParticipantRole,
  score: z.number().int().default(0),
  muted: z.boolean().default(false),
  joined_at_ms: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Participant = z.infer<typeof Participant>;

export const CreateSessionRequest = z.object({
  game: GameType,
  livekit: LiveKitRoomRef,
  config: SessionConfig.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = z.object({
  session_id: z.string(),
  game: GameType,
  status: SessionStatus,
  livekit: LiveKitRoomRef,
  tokens: SessionTokens,
  realtime: RealtimeConfig,
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const MintParticipantTokenRequest = z.object({
  identity: z.string().min(1),
  display_name: z.string().optional(),
  role: ParticipantRole,
  metadata: z.record(z.unknown()).optional(),
});
export type MintParticipantTokenRequest = z.infer<typeof MintParticipantTokenRequest>;

export const MintParticipantTokenResponse = z.object({
  livekit_token: z.string(),
  participant: Participant,
});
export type MintParticipantTokenResponse = z.infer<typeof MintParticipantTokenResponse>;

export const StartSessionRequest = z.object({
  mode: z.enum(["auto"]).default("auto"),
  lobby_grace_seconds: z.number().int().min(0).max(300).default(10),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequest>;
