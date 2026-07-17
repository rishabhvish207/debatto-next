import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_CONFIG } from "@/config/AI";

// Plain server-side client (not the browser SSR wrapper in utils/supabase) —
// this route never needs cookies/session, just a public anon-key read.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Only used if app_settings hasn't been seeded yet (run app_settings.sql)
// or the lookup fails for any reason — keeps the app working either way.
const FALLBACK = {
  model: AI_CONFIG.model,
  maxTokens: AI_CONFIG.maxTokens,
  temperature: AI_CONFIG.temperature,
  fallbackModel: AI_CONFIG.fallbackModel,
  fallbackEnabled: AI_CONFIG.fallbackEnabled,
};

async function getAiSettings() {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["ai_model", "ai_max_tokens", "ai_temperature", "ai_fallback_model", "ai_fallback_enabled"]);

    if (error || !data) return FALLBACK;

    const map: Record<string, any> = {};
    for (const row of data) map[row.key] = row.value;

    return {
      model: map.ai_model ?? FALLBACK.model,
      maxTokens: map.ai_max_tokens ?? FALLBACK.maxTokens,
      temperature: map.ai_temperature ?? FALLBACK.temperature,
      fallbackModel: map.ai_fallback_model ?? FALLBACK.fallbackModel,
      fallbackEnabled: map.ai_fallback_enabled !== false, // defaults on
    };
  } catch {
    return FALLBACK;
  }
}

async function callGroq(model: string, system: string, userMsg: string, maxTokens: number, temperature: number) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg }
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: Request) {
  try {
    // Only the actual conversational content comes from the client. Model,
    // token limit, and temperature are resolved server-side from
    // app_settings — admin-adjustable via AdminPanel, but never trusted
    // from whatever the browser happens to send.
    const { system, userMsg } = await req.json();
    const { model, maxTokens, temperature, fallbackModel, fallbackEnabled } = await getAiSettings();

    let result = await callGroq(model, system, userMsg, maxTokens, temperature);
    let modelUsed = model;

    // 429 = rate limit reached for this model specifically (Groq's limits
    // are per-model, not account-wide) — retry once against a different
    // model rather than failing the whole match. Only retries on 429, not
    // other errors (bad request, auth, etc.), since those would just fail
    // identically on the fallback model too.
    if (!result.ok && result.status === 429 && fallbackEnabled && fallbackModel && fallbackModel !== model) {
      const retry = await callGroq(fallbackModel, system, userMsg, maxTokens, temperature);
      if (retry.ok) {
        result = retry;
        modelUsed = fallbackModel;
      }
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.data?.error?.message || "Groq Error" }, { status: result.status });
    }

    return NextResponse.json({ result: result.data.choices?.[0]?.message?.content || "", modelUsed });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
