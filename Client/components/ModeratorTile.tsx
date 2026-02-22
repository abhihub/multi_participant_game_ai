"use client";
import { useEffect } from "react";
import { useGame } from "../lib/gameStore";

export default function ModeratorTile() {
  const { state, clearConfetti } = useGame();

  // Auto-clear confetti flag after animation completes (react-confetti calls
  // onConfettiComplete, but we also set a timer in case that fires early)
  useEffect(() => {
    if (!state.showConfetti) return;
    const t = setTimeout(clearConfetti, 7000);
    return () => clearTimeout(t);
  }, [state.showConfetti, clearConfetti]);

  const sorted = Object.entries(state.scores).sort(([, a], [, b]) => b - a);

  return (
    <div
      style={{
        background: "#111827",
        border: "2px solid #1f2937",
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
        aspectRatio: "4/3",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        minHeight: 200,
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          right: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, letterSpacing: "0.08em" }}>
          AI MODERATOR
        </span>
        {state.isSpeaking && (
          <span
            style={{
              fontSize: 11,
              color: "#34d399",
              background: "rgba(6,78,59,0.7)",
              padding: "2px 8px",
              borderRadius: 20,
              fontWeight: 700,
            }}
          >
            🎙 Speaking
          </span>
        )}
      </div>

      {/* Winner overlay */}
      {state.winner && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#fbbf24",
              marginBottom: 4,
              textAlign: "center",
            }}
          >
            {state.winner.displayName ?? state.winner.identity}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>
            wins the game!
          </div>
          {state.winner.finalScores.length > 0 && (
            <div style={{ width: "100%", maxWidth: 200 }}>
              {state.winner.finalScores.slice(0, 5).map((s, i) => (
                <div
                  key={s.participant_identity}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    color: i === 0 ? "#fbbf24" : "#9ca3af",
                    marginBottom: 3,
                  }}
                >
                  <span>
                    {i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : `${i + 1}. `}
                    {s.display_name ?? s.participant_identity}
                  </span>
                  <span style={{ fontWeight: 700 }}>{s.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {!state.winner && (
        <div style={{ width: "100%", maxWidth: 220 }}>
          <p
            style={{
              fontSize: 11,
              color: "#4b5563",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            Leaderboard
          </p>

          {sorted.length === 0 ? (
            <p style={{ color: "#374151", fontSize: 13, textAlign: "center" }}>
              {state.status === "lobby"
                ? "Waiting for game to start…"
                : "No scores yet"}
            </p>
          ) : (
            sorted.map(([identity, score], i) => (
              <div
                key={identity}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "5px 8px",
                  background: i === 0 ? "rgba(251,191,36,0.08)" : "transparent",
                  borderRadius: 6,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: i === 0 ? "#fbbf24" : "#e5e7eb",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 140,
                  }}
                >
                  {i === 0 ? "🥇 " : `${i + 1}. `}
                  {identity}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: i === 0 ? "#fbbf24" : "#f0f0f0",
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {score}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
