// app/api/tts/route.ts
//
// Text-to-speech via msedge-tts — free, no API key, and (unlike the
// package originally used here) actively maintained against Microsoft's
// tightened requirements: Edge's TTS service now demands a dynamically
// computed Sec-MS-GEC security header, not just a static trusted-client
// token. The first package I picked never implemented that and started
// failing with a 403 the moment Microsoft enforced it — this one does
// implement it, but being an unofficial API, it's still possible Microsoft
// changes something again in the future and this needs another swap.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    // No auth in front of this route either — cap it so it can't be used
    // as a free, unlimited TTS proxy for arbitrary text.
    const rl = checkRateLimit(req, "tts", { limit: 30, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    const { text, voice } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }
    // Edge TTS's underlying service has a per-request text length ceiling;
    // truncate defensively rather than let a long argument fail outright.
    const trimmed = text.slice(0, 2000);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice || "en-US-JennyNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(trimmed);

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    tts.close();

    return new NextResponse(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    // Logged with the full error object (not just .message) — this is an
    // unofficial API with no support channel, so a complete stack/cause is
    // the only way to actually diagnose a failure rather than guess at one.
    console.error("TTS failed:", err);
    return NextResponse.json({ error: err?.message || String(err) || "TTS failed" }, { status: 500 });
  }
}
