import { NextRequest, NextResponse } from "next/server";
import { registerSession } from "../../../lib/sessionRegistry";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const API_KEY = process.env.GAME_API_KEY ?? "dev-api-key";

// Unambiguous alphabet — no 0/O, 1/I/L confusion
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  return Array.from({ length: 6 }, () =>
    CHARSET[Math.floor(Math.random() * CHARSET.length)]
  ).join("");
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    game: "trivia" | "quick_draw";
    display_name?: string;
    topic?: string;
    category?: string;
  };

  const { game, display_name = "Host", topic, category } = body;
  const code = generateCode();

  // Create session on the Game Engine API
  const sessionRes = await fetch(`${API_URL}/v1/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      game,
      livekit: { room_name: code },
      ...(game === "trivia" && topic
        ? { metadata: { topic } }
        : game === "quick_draw" && category
          ? { metadata: { category } }
          : {}),
    }),
  });

  if (!sessionRes.ok) {
    const text = await sessionRes.text();
    return NextResponse.json({ error: text }, { status: sessionRes.status });
  }

  const session = await sessionRes.json();
  const { session_id, tokens } = session;

  // Mint a host token with the admin's display name
  const identity = `host_${Date.now().toString(36)}`;
  const tokenRes = await fetch(`${API_URL}/v1/sessions/${session_id}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ identity, display_name, role: "host" }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Failed to mint host token" }, { status: 500 });
  }

  const { livekit_token } = await tokenRes.json();

  // Register code → session_id so players can join by code
  registerSession(code, session_id);

  return NextResponse.json({
    code,
    session_id,
    livekit_token,
    session_admin_token: tokens.session_admin_token,
  });
}
