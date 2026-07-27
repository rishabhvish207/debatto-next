// app/api/tts/route.ts
//
// Text-to-speech via edge-tts — a free, no-API-key wrapper around the
// voice service Microsoft Edge's "Read Aloud" feature uses. Unofficial
// (not a supported third-party API), which is a real tradeoff for "free
// forever" — see lib/tts.ts for the client side of this.
//
// Must run on the Node.js runtime, not Edge — edge-tts opens a raw
// WebSocket (via the `ws` package), which isn't available in the Edge
// runtime's more restricted environment.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
// Importing the compiled subpath directly rather than the bare package
// name — edge-tts's own package.json has "main": "index.ts" (pointing at
// raw TypeScript source instead of the compiled out/index.js it actually
// ships), which Turbopack can't resolve. This sidesteps that packaging bug.
import { tts } from "edge-tts/out/index.js";

export async function POST(req: NextRequest) {
  try {
    const { text, voice } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }
    // Edge TTS's underlying service has a per-request text length ceiling;
    // truncate defensively rather than let a long argument fail outright.
    const trimmed = text.slice(0, 2000);

    const audio = await tts(trimmed, { voice: voice || "en-US-JennyNeural" });
    return new NextResponse(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    console.error("TTS failed:", err);
    return NextResponse.json({ error: err?.message || "TTS failed" }, { status: 500 });
  }
}
