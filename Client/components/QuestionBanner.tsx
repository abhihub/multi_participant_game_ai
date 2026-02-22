"use client";
import { useGame } from "../lib/gameStore";

export default function QuestionBanner() {
  const { state } = useGame();
  const text = state.currentQuestion ?? state.currentPrompt;

  if (!text) return null;

  const isQuestion = !!state.currentQuestion;
  const accent = isQuestion ? "#3b82f6" : "#10b981";
  const bg = isQuestion ? "rgba(59,130,246,0.1)" : "rgba(16,185,129,0.1)";

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${accent}`,
        borderRadius: 12,
        padding: "14px 24px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {isQuestion ? "Trivia Question" : "Quick Draw — Draw this!"}
      </p>
      <p style={{ fontSize: 18, fontWeight: 600, color: "#f0f0f0" }}>{text}</p>
    </div>
  );
}
