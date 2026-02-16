import { z } from "zod";
import { FloorMode, ParticipantRole } from "./enums.js";

export const FloorState = z.object({
  mode: FloorMode,
  allowed_roles: z.array(ParticipantRole).nullable().optional(),
  allowed_identities: z.array(z.string()).nullable().optional(),
  held_by: z.string().nullable().optional(),
  expires_at_ms: z.number().int().min(0).nullable().optional(),
});
export type FloorState = z.infer<typeof FloorState>;

export const FloorControlRequest = z.object({
  mode: FloorMode,
  allowed_roles: z.array(ParticipantRole).optional(),
  allowed_identities: z.array(z.string()).optional(),
  duration_ms: z.number().int().min(0).max(300000).nullable().optional(),
  reason: z.string().max(200).nullable().optional(),
});
export type FloorControlRequest = z.infer<typeof FloorControlRequest>;

export const FloorControlResponse = z.object({
  ok: z.literal(true),
  floor: FloorState,
});
export type FloorControlResponse = z.infer<typeof FloorControlResponse>;
