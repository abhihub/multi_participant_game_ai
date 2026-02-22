"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type GameType = "trivia" | "quick_draw";

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

export default function CreateRoomForm() {
  const router = useRouter();
  const [game, setGame] = useState<GameType>("trivia");
  const [displayName, setDisplayName] = useState("");
  const [topic, setTopic] = useState("General Knowledge");
  const [category, setCategory] = useState("Animals");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game,
          display_name: displayName.trim(),
          ...(game === "trivia" ? { topic } : { category }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create room");
      }

      const data = await res.json();

      // Store tokens in sessionStorage before redirecting
      sessionStorage.setItem(
        `room_${data.code}`,
        JSON.stringify({
          session_id: data.session_id,
          livekit_token: data.livekit_token,
          session_admin_token: data.session_admin_token,
          role: "host",
          display_name: displayName.trim(),
        }),
      );

      router.push(`/room/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      <div>
        <label style={labelStyle}>Game Type</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["trivia", "quick_draw"] as GameType[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGame(g)}
              style={{
                flex: 1,
                padding: "10px 0",
                background: game === g ? "#1d4ed8" : "#1a1a1a",
                border: `1px solid ${game === g ? "#3b82f6" : "#333"}`,
                borderRadius: 8,
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {g === "trivia" ? "Trivia" : "Quick Draw"}
            </button>
          ))}
        </div>
      </div>

      {game === "trivia" ? (
        <div>
          <label style={labelStyle}>Topic</label>
          <input
            style={inputStyle}
            placeholder="e.g. Roman History, Science, Pop Music"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
      ) : (
        <div>
          <label style={labelStyle}>Category</label>
          <select
            style={{ ...inputStyle, appearance: "none" }}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {["Animals", "Food", "Objects", "Nature", "Sports", "Travel"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p style={{ color: "#f87171", fontSize: 14, textAlign: "center" }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !displayName.trim()}
        style={{
          padding: "12px 0",
          background: "#3b82f6",
          border: "none",
          borderRadius: 8,
          color: "#fff",
          fontWeight: 700,
          fontSize: 16,
          opacity: loading || !displayName.trim() ? 0.6 : 1,
          marginTop: 8,
        }}
      >
        {loading ? "Creating…" : "Create Room"}
      </button>
    </form>
  );
}
