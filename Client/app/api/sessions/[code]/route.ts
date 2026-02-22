import { NextRequest, NextResponse } from "next/server";
import { lookupSession } from "../../../../lib/sessionRegistry";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const sessionId = lookupSession(code);

  if (!sessionId) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({ session_id: sessionId });
}
