"use client";
import { useEffect, useRef } from "react";

export interface ConversationEntry {
  id: string;
  timestamp: number;
  senderName: string;
  text: string;
  role: "moderator" | "player" | "system";
  verdict?: "correct" | "wrong";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function borderColor(entry: ConversationEntry): string {
  if (entry.role === "moderator") return "#3b82f6";
  if (entry.role === "player") {
    if (entry.verdict === "correct") return "#10b981";
    if (entry.verdict === "wrong") return "#ef4444";
    return "#374151";
  }
  return "transparent";
}

export default function ConversationLog({ entries }: { entries: ConversationEntry[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div
      style={{
        background: "#0d0d0d",
        borderTop: "1px solid #1f1f1f",
        flex: 1,
        minHeight: 280,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "6px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #1a1a1a",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: "0.05em" }}>
          Conversation Log
        </span>
        <span
          style={{
            fontSize: 10,
            color: "#374151",
            background: "#1a1a1a",
            borderRadius: 10,
            padding: "1px 7px",
            fontFamily: "monospace",
          }}
        >
          {entries.length}
        </span>
      </div>

      {/* Entry list */}
      <div
        ref={listRef}
        style={{
          overflowY: "auto",
          flex: 1,
          padding: "8px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {entries.length === 0 && (
          <span style={{ fontSize: 12, color: "#374151", fontStyle: "italic" }}>
            No messages yet…
          </span>
        )}

        {entries.map((entry) => {
          if (entry.role === "system") {
            return (
              <div
                key={entry.id}
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  color: "#4b5563",
                  fontStyle: "italic",
                  padding: "4px 0",
                }}
              >
                {entry.text}
              </div>
            );
          }

          return (
            <div
              key={entry.id}
              style={{
                borderLeft: `3px solid ${borderColor(entry)}`,
                paddingLeft: 8,
                paddingTop: 2,
                paddingBottom: 2,
              }}
            >
              {/* Header row: icon + name + timestamp + verdict */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af" }}>
                  {entry.role === "moderator" ? "🤖" : "👤"} {entry.senderName}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {entry.verdict && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: entry.verdict === "correct" ? "#10b981" : "#ef4444",
                        background: entry.verdict === "correct" ? "#064e3b" : "#7f1d1d",
                        borderRadius: 4,
                        padding: "1px 5px",
                      }}
                    >
                      {entry.verdict === "correct" ? "✓ correct" : "✗ wrong"}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      color: "#4b5563",
                      fontFamily: "monospace",
                    }}
                  >
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
              </div>
              {/* Message text */}
              <div style={{ fontSize: 13, color: "#d1d5db", marginTop: 1 }}>
                &ldquo;{entry.text}&rdquo;
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
