"use client";
import { useParticipants, useTracks, VideoTrack, AudioTrack } from "@livekit/components-react";
import type { TrackReference } from "@livekit/components-react";
import { Track, ParticipantKind } from "livekit-client";
import ModeratorTile from "./ModeratorTile";

interface Props {
  myIdentity: string;
}

export default function VideoGrid({ myIdentity }: Props) {
  const participants = useParticipants();
  const videoTracks = useTracks([Track.Source.Camera]);
  const audioTracks = useTracks([Track.Source.Microphone]);

  // Agent participants (ParticipantKind.AGENT = 3) are the AI moderator.
  // Also guard against the pre-minted "moderator_" identity token as a fallback.
  const players = participants.filter(
    (p) => p.kind !== ParticipantKind.AGENT && !p.identity.startsWith("moderator_"),
  );

  // Find the moderator's HUD video track published by VideoRenderer.
  // Only use it if publication is defined (i.e. it's a real TrackReference, not a placeholder).
  const moderatorVideoTrack = videoTracks.find(
    (t) =>
      (t.participant.kind === ParticipantKind.AGENT ||
        t.participant.identity.startsWith("moderator_")) &&
      t.publication !== undefined,
  ) as TrackReference | undefined;

  // Render audio for all remote participants (including moderator TTS voice)
  const remoteAudio = audioTracks.filter((t) => t.participant.identity !== myIdentity);

  return (
    <div>
      {/* Hidden audio tracks */}
      {remoteAudio.map((t) => (
        <AudioTrack
          key={t.publication.trackSid}
          trackRef={t}
          style={{ display: "none" }}
        />
      ))}

      {/* Video grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {/* Moderator HUD tile — always first, shows live HUD video when available */}
        <ModeratorTile videoTrack={moderatorVideoTrack} />

        {/* Player tiles */}
        {players.map((participant) => {
          const videoTrack = videoTracks.find(
            (t) => t.participant.identity === participant.identity,
          );
          const isMe = participant.identity === myIdentity;
          const initials = (participant.name ?? participant.identity)[0]?.toUpperCase() ?? "?";

          return (
            <div
              key={participant.identity}
              style={{
                background: "#1f2937",
                border: "1px solid #374151",
                borderRadius: 12,
                overflow: "hidden",
                position: "relative",
                aspectRatio: "4/3",
              }}
            >
              {videoTrack ? (
                <VideoTrack
                  trackRef={videoTrack}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#1f2937",
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: "#374151",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      color: "#9ca3af",
                      fontWeight: 700,
                    }}
                  >
                    {initials}
                  </div>
                </div>
              )}

              {/* Name label */}
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 8,
                }}
              >
                <span
                  style={{
                    background: "rgba(0,0,0,0.72)",
                    padding: "2px 8px",
                    borderRadius: 12,
                    fontSize: 12,
                    color: "#f0f0f0",
                    fontWeight: 600,
                  }}
                >
                  {participant.name ?? participant.identity}
                  {isMe ? " (you)" : ""}
                </span>
              </div>
            </div>
          );
        })}

        {/* Placeholder if no one has joined yet */}
        {players.length === 0 && !moderatorVideoTrack && (
          <div
            style={{
              background: "#111",
              border: "1px dashed #374151",
              borderRadius: 12,
              aspectRatio: "4/3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4b5563",
              fontSize: 14,
            }}
          >
            Waiting for participants…
          </div>
        )}
      </div>
    </div>
  );
}
