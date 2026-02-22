"use client";
import { useParticipants, useTracks, VideoTrack, AudioTrack } from "@livekit/components-react";
import { Track } from "livekit-client";
import ModeratorTile from "./ModeratorTile";

interface Props {
  myIdentity: string;
}

export default function VideoGrid({ myIdentity }: Props) {
  const participants = useParticipants();
  const videoTracks = useTracks([Track.Source.Camera]);
  const audioTracks = useTracks([Track.Source.Microphone]);

  const moderator = participants.find((p) => p.identity.startsWith("moderator"));
  const players = participants.filter((p) => !p.identity.startsWith("moderator"));

  // Render audio for all remote participants (including moderator voice)
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
        {/* Moderator HUD tile — always first */}
        <ModeratorTile />

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

        {/* Placeholder if no moderator has joined yet */}
        {!moderator && players.length === 0 && (
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
