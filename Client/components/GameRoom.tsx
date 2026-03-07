"use client";
import "@livekit/components-styles";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import type { RemoteParticipant } from "livekit-client";
import dynamic from "next/dynamic";

import { GameProvider, useGame } from "../lib/gameStore";
import type { GameEventEnvelope } from "../lib/events";
import type { EvModeratorSpeakStarted, EvScoreUpdated } from "../lib/events";
import VideoGrid from "./VideoGrid";
import GameControls from "./GameControls";
import EventLog from "./EventLog";
import ConversationLog, { ConversationEntry } from "./ConversationLog";

// Confetti has no SSR support — load client-side only
const Confetti = dynamic(() => import("react-confetti"), { ssr: false });

const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "wss://localhost:7880";

export interface GameRoomProps {
  code: string;
  sessionId: string;
  livekitToken: string;
  sessionAdminToken?: string;
  role: "host" | "player";
  displayName: string;
}

/** Outer shell: LiveKitRoom + GameProvider wrappers */
export default function GameRoom(props: GameRoomProps) {
  return (
    <GameProvider>
      <LiveKitRoom
        token={props.livekitToken}
        serverUrl={LIVEKIT_URL}
        video={true}
        audio={true}
        style={{ height: "100vh", background: "#0a0a0a" }}
      >
        <GameRoomInner {...props} />
      </LiveKitRoom>
    </GameProvider>
  );
}

/** Inner component — has access to both LiveKit context and GameContext */
function GameRoomInner({
  code,
  sessionId,
  sessionAdminToken,
  role,
  displayName,
}: GameRoomProps) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const { state, handleEvent, clearConfetti } = useGame();

  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  // Tracks the user's own mute preference (independent of floor control)
  const [userMuted, setUserMuted] = useState(false);

  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>([]);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  // Bug 2: ref mirror so onData can read latest names without stale closure
  const participantNamesRef = useRef<Record<string, string>>({});
  useEffect(() => { participantNamesRef.current = participantNames; }, [participantNames]);

  const addEntry = useCallback((entry: Omit<ConversationEntry, "id">) => {
    const ts = new Date(entry.timestamp).toTimeString().slice(0, 8);
    if (entry.role === "moderator") {
      console.log(`%c[${ts}] 🤖 QuizBot: ${entry.text}`, "color:#3b82f6;font-weight:bold");
    } else if (entry.role === "player") {
      const badge = entry.verdict === "correct" ? "✓" : "✗";
      const style = entry.verdict === "correct" ? "color:#10b981" : "color:#ef4444";
      console.log(`%c[${ts}] 👤 ${entry.senderName} ${badge}: ${entry.text}`, style);
    } else {
      console.log(`%c[${ts}] ${entry.text}`, "color:#6b7280;font-style:italic");
    }
    setConversationLog(prev => [
      ...prev.slice(-199),
      { ...entry, id: `${entry.timestamp}-${Math.random()}` },
    ]);
  }, []);

  // Track window size for confetti canvas
  useEffect(() => {
    function update() {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Subscribe to DataChannel on topic "game.events.v1"
  useEffect(() => {
    if (!room) return;

    function onData(
      payload: Uint8Array,
      _participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) {
      if (topic !== "game.events.v1") return;
      try {
        const text = new TextDecoder().decode(payload);
        const event = JSON.parse(text) as GameEventEnvelope;
        handleEvent(event);

        const { type, payload: p, ts_ms } = event;
        if (type === "moderator.speak.started") {
          const ev = p as unknown as EvModeratorSpeakStarted;
          addEntry({ timestamp: ts_ms, senderName: "QuizBot", text: ev.text, role: "moderator" });
        } else if (type === "trivia.answer.detected") {
          const ev = p as { participant_identity?: string; transcript?: string; is_correct?: boolean };
          if (ev.participant_identity && ev.transcript) {
            const name = participantNamesRef.current[ev.participant_identity] ?? ev.participant_identity;
            addEntry({
              timestamp: ts_ms, senderName: name, text: ev.transcript, role: "player",
              verdict: ev.is_correct ? "correct" : "wrong",
            });
          }
        } else if (type === "score.updated") {
          const ev = p as unknown as EvScoreUpdated & { display_name?: string };
          if (ev.display_name) {
            setParticipantNames(prev => ({ ...prev, [ev.participant_identity]: ev.display_name! }));
          }
        } else if (type === "trivia.question") {
          const ev = p as { prompt: string };
          addEntry({ timestamp: ts_ms, senderName: "", text: `— "${ev.prompt}" —`, role: "system" });
        } else if (type === "session.started") {
          addEntry({ timestamp: ts_ms, senderName: "", text: "Game started", role: "system" });
        } else if (type === "session.ended") {
          addEntry({ timestamp: ts_ms, senderName: "", text: "Game ended", role: "system" });
        }
      } catch {
        // ignore malformed messages
      }
    }

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, handleEvent, addEntry]);

  // Honour floor control: mute/unmute mic automatically.
  // When floor opens, only restore mic if the user hasn't manually muted themselves.
  useEffect(() => {
    if (!localParticipant) return;
    const floorMuted = state.floor.mode === "moderator_only";
    const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!pub) return;

    if (floorMuted && !pub.isMuted) {
      localParticipant.setMicrophoneEnabled(false);
    } else if (!floorMuted && pub.isMuted && state.status === "running" && !userMuted) {
      localParticipant.setMicrophoneEnabled(true, {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      });
    }
  }, [state.floor.mode, state.status, localParticipant, userMuted]);

  function toggleMute() {
    if (!localParticipant) return;
    const next = !userMuted;
    setUserMuted(next);
    localParticipant.setMicrophoneEnabled(!next, {
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    });
  }

  const floorLocked = state.floor.mode === "moderator_only";

  const isAdmin = role === "host" && !!sessionAdminToken;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Full-screen confetti on game.winner / effect.triggered { confetti } */}
      {state.showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={450}
          onConfettiComplete={clearConfetti}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 50, pointerEvents: "none" }}
        />
      )}

      {/* Top bar */}
      <div
        style={{
          background: "#0f0f0f",
          borderBottom: "1px solid #1f1f1f",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>AI Game Room</span>
          <span
            style={{
              background: "#1a1a1a",
              border: "1px solid #2d2d2d",
              borderRadius: 6,
              padding: "2px 10px",
              fontSize: 14,
              fontFamily: "monospace",
              letterSpacing: "0.15em",
              color: "#3b82f6",
              fontWeight: 700,
            }}
          >
            {code}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusBadge status={state.status} />
          <MuteButton muted={userMuted || floorLocked} floorLocked={floorLocked} onToggle={toggleMute} />
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {displayName} · {role}
          </span>
        </div>
      </div>

      {/* Content + log section fills remaining height */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        {/* Scrollable content — shrinks to fit, scrolls when too tall */}
        <div style={{ flex: "0 1 auto", overflowY: "auto", padding: 16, maxHeight: "55%" }}>
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <VideoGrid myIdentity={localParticipant?.identity ?? ""} />

            {isAdmin && (
              <GameControls sessionId={sessionId} adminToken={sessionAdminToken!} />
            )}

            <details>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#4b5563",
                  padding: "4px 0",
                  userSelect: "none",
                }}
              >
                Debug: Event Log
              </summary>
              <div style={{ marginTop: 8 }}>
                <EventLog />
              </div>
            </details>
          </div>
        </div>

        <ConversationLog entries={conversationLog} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    lobby:   { bg: "#1f2937", color: "#9ca3af", label: "Lobby" },
    running: { bg: "#064e3b", color: "#34d399", label: "Live" },
    paused:  { bg: "#78350f", color: "#fbbf24", label: "Paused" },
    ended:   { bg: "#1f2937", color: "#6b7280", label: "Ended" },
  };
  const c = map[status] ?? map.lobby;
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {c.label}
    </span>
  );
}

function FloorBadge() {
  return (
    <span
      style={{
        background: "#7c2d12",
        color: "#fdba74",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      🎙 Mic muted
    </span>
  );
}

function MuteButton({
  muted,
  floorLocked,
  onToggle,
}: {
  muted: boolean;
  floorLocked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={floorLocked}
      title={floorLocked ? "Muted by moderator" : muted ? "Unmute microphone" : "Mute microphone"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 12px",
        borderRadius: 20,
        border: "1px solid",
        borderColor: floorLocked ? "#7c2d12" : muted ? "#374151" : "#065f46",
        background: floorLocked ? "#7c2d12" : muted ? "#1f2937" : "#064e3b",
        color: floorLocked ? "#fdba74" : muted ? "#9ca3af" : "#34d399",
        fontSize: 12,
        fontWeight: 700,
        cursor: floorLocked ? "not-allowed" : "pointer",
        transition: "background 0.15s, border-color 0.15s",
        opacity: floorLocked ? 0.8 : 1,
      }}
    >
      {muted ? "🔇" : "🎙"}{" "}
      {floorLocked ? "Muted" : muted ? "Unmute" : "Mute"}
    </button>
  );
}
