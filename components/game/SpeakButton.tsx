"use client";

// Manual "speak this argument" button — sits near whoever said the text
// (a debot's name, or an opponent's handle in online mode).
//
// Tap behavior:
//   - Not playing -> play (from wherever it last stopped, or the start)
//   - Playing, single tap -> pause
//   - Double tap -> reset to the start and play from there
// A short timer distinguishes single from double tap: the single-tap
// action only fires if a second tap doesn't arrive within the window.

import { useEffect, useRef, useState } from "react";
import { getAudioUrl, registerPlaying } from "@/lib/tts";
import { AppIcon } from "@/components/ui/AppIcon";

const DOUBLE_TAP_WINDOW_MS = 300;

export function SpeakButton({ text, voiceId, size = 17 }: { text: string; voiceId: string; size?: number }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stops THIS button's own audio when it unmounts (e.g. navigating away
  // from the arena) — belt-and-suspenders alongside the page-level
  // stopAllSpeaking() call, since either one alone covers it.
  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  // The same SpeakButton instance stays mounted across rounds (React keeps
  // it at the same tree position, just with new text/voiceId props each
  // time) — without this, tapping it after a new argument arrives would
  // keep replaying the PREVIOUS argument's cached audio instance.
  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setState("idle");
  }, [text, voiceId]);

  async function ensureAudio(): Promise<HTMLAudioElement> {
    if (audioRef.current) return audioRef.current;
    const url = await getAudioUrl(text, voiceId);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => setState("idle"));
    audioRef.current = audio;
    return audio;
  }

  async function play() {
    setState("loading");
    setError("");
    try {
      const audio = await ensureAudio();
      registerPlaying(audio);
      await audio.play();
      setState("playing");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Playback failed");
      setTimeout(() => setError(""), 4000);
      setState("idle");
    }
  }

  function pause() {
    audioRef.current?.pause();
    setState("paused");
  }

  function resetAndPlay() {
    if (audioRef.current) audioRef.current.currentTime = 0;
    play();
  }

  function handleClick() {
    if (pendingTapRef.current) {
      // Second tap arrived in time — this is a double tap.
      clearTimeout(pendingTapRef.current);
      pendingTapRef.current = null;
      resetAndPlay();
      return;
    }
    pendingTapRef.current = setTimeout(() => {
      pendingTapRef.current = null;
      if (state === "playing") pause();
      else play();
    }, DOUBLE_TAP_WINDOW_MS);
  }

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        title={error || (state === "playing" ? "Tap to pause · double-tap to restart" : "Tap to play · double-tap to restart")}
        style={{
          background: "none", border: "none", cursor: state === "loading" ? "default" : "pointer",
          color: error ? "var(--red)" : state === "playing" ? "var(--blue)" : "var(--muted)",
          display: "inline-flex", padding: 4,
        }}
      >
        <AppIcon token={state === "playing" ? "⏸" : "🔊"} size={size} />
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
