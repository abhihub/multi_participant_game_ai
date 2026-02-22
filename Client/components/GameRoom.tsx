"use client";
import "@livekit/components-styles";
import { useEffect, useState } from "react";
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
import VideoGrid from "./VideoGrid";
import GameControls from "./GameControls";
import QuestionBanner from "./QuestionBanner";
import EventLog from "./EventLog";

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
      } catch {
        // ignore malformed messages
      }
    }

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, handleEvent]);

  // Honour floor control: mute/unmute mic automatically
  useEffect(() => {
    if (!localParticipant) return;
    const shouldMute = state.floor.mode === "moderator_only";
    const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!pub) return;

    if (shouldMute && !pub.isMuted) {
      localParticipant.setMicrophoneEnabled(false);
    } else if (!shouldMute && pub.isMuted && state.status === "running") {
      localParticipant.setMicrophoneEnabled(true);
    }
  }, [state.floor.mode, state.status, localParticipant]);

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
          {state.floor.mode !== "open" && <FloorBadge />}
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {displayName} · {role}
          </span>
        </div>
      </div>

      {/* Main scrollable area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <QuestionBanner />

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
