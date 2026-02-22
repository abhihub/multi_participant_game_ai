"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prefillCode?: string;
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 8,
  color: "#f0f0f0",
  fontSize: 15,
  outline: "none",
} as const;

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  color: "#9ca3af",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

export default function JoinRoomForm({ prefillCode }: Props) {
  const router = useRouter();
  const [code, setCode] = useState(prefillCode ?? "");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode || !displayName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sessions/${cleanCode}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Room not found");
      }

      const data = await res.json();

      sessionStorage.setItem(
        `room_${cleanCode}`,
        JSON.stringify({
          session_id: data.session_id,
          livekit_token: data.livekit_token,
          role: "player",
          display_name: displayName.trim(),
        }),
      );

      router.push(`/room/${cleanCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label style={labelStyle}>Room Code</label>
        <input
          style={{
            ...inputStyle,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            fontWeight: 700,
            fontSize: 22,
            textAlign: "center",
          }}
          placeholder="XXXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          disabled={!!prefillCode}
          required
        />
      </div>

      <div>
        <label style={labelStyle}>Your Name</label>
        <input
          style={inputStyle}
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </div>

      {error && (
        <p style={{ color: "#f87171", fontSize: 14, textAlign: "center" }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !code.trim() || !displayName.trim()}
        style={{
          padding: "12px 0",
          background: "#3b82f6",
          border: "none",
          borderRadius: 8,
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
          opacity: loading || !code.trim() || !displayName.trim() ? 0.6 : 1,
          marginTop: 8,
        }}
      >
        {loading ? "Joining…" : "Join Room"}
      </button>
    </form>
  );
}
