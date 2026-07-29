"use client";

// Manual "speak this argument" button — sits near whoever said the text
// (a debot's name, or an opponent's handle in online mode). Also used
// internally by auto-speak (GameContext-level effects call lib/tts.speak
// directly for that; this component is specifically the tappable button).

import { useState } from "react";
import { speak } from "@/lib/tts";
import { AppIcon } from "@/components/ui/AppIcon";

export function SpeakButton({ text, voiceId, size = 17 }: { text: string; voiceId: string; size?: number }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (playing) return;
    setPlaying(true);
    setError("");
    try {
      await speak(text, voiceId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Playback failed");
      setTimeout(() => setError(""), 4000);
    }
    setPlaying(false);
  }

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={playing}
        title={error || "Hear this argument"}
        style={{
          background: "none", border: "none", cursor: playing ? "default" : "pointer",
          color: error ? "var(--red)" : "var(--muted)", display: "inline-flex", padding: 4,
        }}
      >
        <AppIcon token="🔊" size={size} />
      </button>
      {error && (
        <span style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, whiteSpace: "nowrap",
          fontSize: 11, color: "var(--red)", background: "var(--surface)", border: "1px solid var(--red)",
          borderRadius: 4, padding: "3px 6px", zIndex: 20,
        }}>
          {error}
        </span>
      )}
    </span>
  );
}
