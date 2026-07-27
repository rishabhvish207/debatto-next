// lib/tts.ts
//
// Client-side speech playback — calls /api/tts, plays the resulting audio.
// Cached per exact (voiceId, text) pair for the lifetime of the tab, so
// re-hearing something already spoken (tapping the manual speak button
// twice, auto-speak plus a manual replay) doesn't re-hit the TTS service.

const audioCache = new Map<string, string>(); // key -> object URL
let currentAudio: HTMLAudioElement | null = null;

function cacheKey(text: string, voiceId: string) {
  return `${voiceId}::${text}`;
}

export async function speak(text: string, voiceId: string): Promise<void> {
  if (!text?.trim()) return;

  // Only one thing speaks at a time — a new speak() call cuts off whatever
  // was already playing, rather than overlapping audio.
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  const key = cacheKey(text, voiceId);
  let url = audioCache.get(key);

  if (!url) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: voiceId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || "TTS request failed");
    }
    const blob = await res.blob();
    url = URL.createObjectURL(blob);
    audioCache.set(key, url);
  }

  const audio = new Audio(url);
  currentAudio = audio;
  await audio.play();
}

export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}
