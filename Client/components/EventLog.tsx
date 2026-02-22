"use client";
import { useGame } from "../lib/gameStore";

export default function EventLog() {
  const { state } = useGame();

  return (
    <div
      style={{
        background: "#0a0a0a",
        border: "1px solid #1f1f1f",
        borderRadius: 8,
        padding: 12,
        maxHeight: 200,
        overflowY: "auto",
        fontFamily: "monospace",
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: "#4b5563",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 8,
        }}
      >
        Event Log
      </p>

      {state.eventLog.length === 0 ? (
        <p style={{ color: "#374151", fontSize: 12 }}>No events yet…</p>
      ) : (
        [...state.eventLog].reverse().map((ev, i) => (
          <div key={i} style={{ fontSize: 12, marginBottom: 2 }}>
            <span style={{ color: "#3b82f6" }}>{ev.type}</span>
            <span style={{ color: "#374151" }}> #{ev.seq}</span>
          </div>
        ))
      )}
    </div>
  );
}
