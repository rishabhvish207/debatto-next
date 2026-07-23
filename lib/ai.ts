// lib/ai.ts
export async function callAI(system: string, userMsg: string) {
  const res = await fetch(`/api/debate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userMsg }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "API Error");
  return data.result;
}

// Judge models sometimes wrap their JSON in markdown fences or add stray
// text around it despite being told not to — strip that down to just the
// object. Shared between the debot judge (app/(app)/offline/page.tsx) and
// the PvP judge (lib/onlineArena.ts) rather than each keeping its own copy.
export function extractJSON(raw: string) {
  const s = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return (a !== -1 && b !== -1) ? s.slice(a, b + 1) : s;
}

/**
 * Hard backstop against the judge model just being generous with junk input.
 * The AI judge is asked to grade harshly, but LLMs (especially smaller/faster
 * ones) tend to default to charitable mid-range scores even for gibberish —
 * that's what let "bs" earn ~40 points. This never *increases* a score, it
 * only flags input that clearly isn't a real argument so we can zero the
 * gain locally regardless of what the model returned.
 */
export function isLowEffortInput(text: string) {
  const trimmed = (text || "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 4) return true; // too short to make an actual point

  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (letters.length < trimmed.length * 0.5) return true; // mostly punctuation/symbols/digits

  const uniqueLetters = new Set(letters.toLowerCase()).size;
  if (uniqueLetters < 6) return true; // e.g. "asdasd asdasd asdasd"

  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  if (letters.length > 12 && vowels / letters.length < 0.15) return true; // no real words = almost no vowels

  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  if (words.length > 5 && uniqueWords.size < words.length * 0.4) return true; // "lol lol lol lol lol"

  return false;
}
