// app/api/tts/voices/route.ts
//
// Live voice catalog from Edge TTS's own voice list, rather than a
// hardcoded guess at valid voice names — filtered to English locales and
// Neural voices (the natural-sounding tier; the service also has some
// lower-quality standard voices not worth surfacing). Admin browses this
// to build the "enabled" subset (app_settings.enabled_voices); that subset
// is what actually populates the debot-assignment and player-voice pickers.
export const runtime = "nodejs";

import { NextResponse } from "next/server";
// See app/api/tts/route.ts for why this imports the compiled subpath
// directly instead of the bare package name.
import { getVoices } from "edge-tts/out/index.js";

export async function GET() {
  try {
    const voices = await getVoices();
    const filtered = voices
      .filter((v) => v.Locale.startsWith("en-") && v.ShortName.includes("Neural"))
      .map((v) => ({
        id: v.ShortName,
        label: `${v.FriendlyName || v.ShortName} (${v.Locale})`,
        gender: v.Gender,
        locale: v.Locale,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return NextResponse.json({ voices: filtered });
  } catch (err: any) {
    console.error("Fetching voice list failed:", err);
    return NextResponse.json({ error: err?.message || "Failed to fetch voices" }, { status: 500 });
  }
}
