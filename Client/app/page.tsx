"use client";
import { useState } from "react";
import CreateRoomForm from "../components/CreateRoomForm";
import JoinRoomForm from "../components/JoinRoomForm";

export default function Home() {
  const [tab, setTab] = useState<"create" | "join">("create");

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px" }}>
      <h1 style={{ textAlign: "center", marginBottom: 8, fontSize: 32, fontWeight: 700 }}>
        AI Game Room
      </h1>
      <p style={{ textAlign: "center", color: "#888", marginBottom: 32 }}>
        AI-moderated Trivia &amp; Quick Draw
      </p>

      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 24,
        background: "#1a1a1a",
        borderRadius: 10,
        padding: 4,
      }}>
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "10px 0",
              background: tab === t ? "#3b82f6" : "transparent",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              transition: "background 0.15s",
            }}
          >
            {t === "create" ? "Create Room" : "Join Room"}
          </button>
        ))}
      </div>

      {tab === "create" ? <CreateRoomForm /> : <JoinRoomForm />}
    </main>
  );
}
