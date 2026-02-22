"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import GameRoom from "../../../components/GameRoom";
import JoinRoomForm from "../../../components/JoinRoomForm";

interface StoredSession {
  session_id: string;
  livekit_token: string;
  session_admin_token?: string;
  role: "host" | "player";
  display_name: string;
}

export default function RoomPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const key = `room_${code}`;
    const raw = sessionStorage.getItem(key);
    if (raw) {
      try {
        setSession(JSON.parse(raw));
      } catch {
        sessionStorage.removeItem(key);
      }
    }
    setChecked(true);
  }, [code]);

  if (!checked) return null;

  if (!session) {
    return (
      <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px" }}>
        <h1 style={{ textAlign: "center", marginBottom: 8, fontSize: 28 }}>
          Join Room{" "}
          <span style={{ color: "#3b82f6", fontFamily: "monospace", letterSpacing: "0.1em" }}>
            {code}
          </span>
        </h1>
        <p style={{ textAlign: "center", color: "#888", marginBottom: 32 }}>
          Enter your name to join
        </p>
        <JoinRoomForm prefillCode={code} />
      </main>
    );
  }

  return (
    <GameRoom
      code={code}
      sessionId={session.session_id}
      livekitToken={session.livekit_token}
      sessionAdminToken={session.session_admin_token}
      role={session.role}
      displayName={session.display_name}
    />
  );
}
