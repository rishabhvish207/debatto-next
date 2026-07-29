"use client";

// Speech-to-text input button — tap to talk, transcribed text lands
// wherever `onTranscript` puts it (appended to the existing input, same
// convention in both arenas). Renders nothing if the browser doesn't
// support SpeechRecognition (mainly Safari/iOS), rather than showing a
// button that would silently do nothing.

import { useSpeechToText } from "@/lib/speechToText";
import { AppIcon } from "@/components/ui/AppIcon";

export function MicButton({ onTranscript, disabled }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const { listening, supported, start, stop } = useSpeechToText(onTranscript);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      disabled={disabled}
      title={listening ? "Stop listening" : "Speak your argument"}
      style={{
        background: listening ? "var(--red-soft)" : "none",
        border: "none", borderRadius: 8, cursor: "pointer",
        color: listening ? "var(--red)" : "var(--muted)", display: "inline-flex", padding: 10,
      }}
      className={listening ? "anim-pulse" : ""}
    >
      <AppIcon token="🎤" size={20} />
    </button>
  );
}
