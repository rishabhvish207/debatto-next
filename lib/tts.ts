// lib/tts.ts
//
// Two separate concerns, deliberately not mixed:
//  - getAudioUrl(): fetches /api/tts once per (voiceId, text) pair and
//    caches the resulting blob URL for the tab's lifetime — re-hearing
//    something already spoken never re-hits the TTS service.
//  - Playback control (play/pause/reset) lives on the actual HTMLAudioElement
//    instance, owned by whichever component is playing it (SpeakButton keeps
//    its own instance across taps so pause/resume act on the SAME audio,
//    not a fresh fetch each time).
//
// Only one thing plays at a time app-wide — starting anything new stops
// whatever else was playing, whether that's a different SpeakButton or an
// auto-speak call.

const audioCache = new Map<string, string>(); // (voiceId::text) -> object URL
let currentlyPlaying: HTMLAudioElement | null = null;

function cacheKey(text: string, voiceId: string) {
  return `${voiceId}::${text}`;
}

export async function getAudioUrl(text: string, voiceId: string): Promise<string> {
  const key = cacheKey(text, voiceId);
  const cached = audioCache.get(key);
  if (cached) return cached;

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
  const url = URL.createObjectURL(blob);
  audioCache.set(key, url);
  return url;
}

// Registers `audio` as the one thing currently playing, pausing whatever
// else was. Call this right before playing any audio element you want to
// participate in the app-wide "only one voice at a time" rule.
export function registerPlaying(audio: HTMLAudioElement) {
  if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause();
  currentlyPlaying = audio;
}

// Stops whatever's currently playing — call this on unmount of any screen
// that can trigger speech (both arenas), so navigating away actually stops
// the audio instead of leaving it running in the background.
export function stopAllSpeaking() {
  if (currentlyPlaying) { currentlyPlaying.pause(); currentlyPlaying = null; }
}

// Fire-and-forget single playback — used by auto-speak, which doesn't need
// pause/resume/reset, just "play this once now".
export async function speak(text: string, voiceId: string): Promise<void> {
  if (!text?.trim()) return;
  const url = await getAudioUrl(text, voiceId);
  const audio = new Audio(url);
  registerPlaying(audio);
  await audio.play();
}
