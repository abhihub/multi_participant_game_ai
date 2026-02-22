import { NextRequest, NextResponse } from "next/server";
import { lookupSession } from "../../../../../lib/sessionRegistry";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const API_KEY = process.env.GAME_API_KEY ?? "dev-api-key";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const sessionId = lookupSession(code);

  if (!sessionId) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const body = (await req.json()) as { display_name?: string };
  const { display_name = "Player" } = body;

  const identity = `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const tokenRes = await fetch(`${API_URL}/v1/sessions/${sessionId}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ identity, display_name, role: "player" }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.json({ error: text }, { status: tokenRes.status });
  }

  const { livekit_token } = await tokenRes.json();

  return NextResponse.json({ session_id: sessionId, livekit_token });
}
