"use client";
import { useState } from "react";
import { startSession, endSession, skipRound, triggerConfetti } from "../lib/api";
import { useGame } from "../lib/gameStore";

interface Props {
  sessionId: string;
  adminToken: string;
}

export default function GameControls({ sessionId, adminToken }: Props) {
  const { state } = useGame();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  const isRunning = state.status === "running";
  const isEnded = state.status === "ended";
  const isLobby = state.status === "lobby";

  function btn(
    label: string,
    action: string,
    color: string,
    disabled: boolean,
  ) {
    const active = !disabled && busy === null;
    return (
      <button
        disabled={!active}
        onClick={() => run(action, () => {
          if (action === "start") return startSession(sessionId, adminToken);
          if (action === "skip") return skipRound(sessionId, adminToken);
          if (action === "confetti") return triggerConfetti(sessionId, adminToken);
          return endSession(sessionId, adminToken);
        })}
        style={{
          padding: "8px 18px",
          background: active ? color : "#1f2937",
          border: "none",
          borderRadius: 6,
          color: active ? "#fff" : "#6b7280",
          fontWeight: 600,
          fontSize: 14,
          cursor: active ? "pointer" : "not-allowed",
          transition: "background 0.15s",
        }}
      >
        {busy === action ? `${label}…` : label}
      </button>
    );
  }

  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 10,
        padding: "12px 16px",
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: "#4b5563",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 10,
        }}
      >
        Admin Controls
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {btn("Start Game", "start", "#16a34a", !isLobby)}
        {btn("Skip Round", "skip", "#d97706", !isRunning)}
        {btn("Confetti", "confetti", "#7c3aed", isEnded)}
        {btn("End Game", "end", "#dc2626", isEnded)}
      </div>
      {error && (
        <p style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}
