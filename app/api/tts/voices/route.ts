// app/api/tts/voices/route.ts
//
// Live voice catalog — see app/api/tts/route.ts for why this uses
// msedge-tts rather than the originally-chosen (now-broken) edge-tts
// package. Filtered to English locales and Neural voices (the
// natural-sounding tier; the service also has lower-quality standard
// voices not worth surfacing). Admin browses this to build the two
// separate enabled lists (debots / players).
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { MsEdgeTTS } from "msedge-tts";

export async function GET() {
  try {
    const tts = new MsEdgeTTS();
    const voices = await tts.getVoices();
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
