"use client";

// Manual "speak this argument" button — sits near whoever said the text
// (a debot's name, or an opponent's handle in online mode). Also used
// internally by auto-speak (GameContext-level effects call lib/tts.speak
// directly for that; this component is specifically the tappable button).

import { useState } from "react";
import { speak } from "@/lib/tts";
import { AppIcon } from "@/components/ui/AppIcon";

export function SpeakButton({ text, voiceId, size = 13 }: { text: string; voiceId: string; size?: number }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  async function handleClick() {
    if (playing) return;
    setPlaying(true);
    setError(false);
    try {
      await speak(text, voiceId);
    } catch (e) {
      console.error(e);
      setError(true);
    }
    setPlaying(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={playing}
      title={error ? "Playback failed — try again" : "Hear this argument"}
      style={{
        background: "none", border: "none", cursor: playing ? "default" : "pointer",
        color: error ? "var(--red)" : "var(--muted)", display: "inline-flex", padding: 2,
      }}
    >
      <AppIcon token="🔊" size={size} />
    </button>
  );
}
