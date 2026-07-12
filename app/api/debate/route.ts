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
};

async function getAiSettings() {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["ai_model", "ai_max_tokens", "ai_temperature"]);

    if (error || !data) return FALLBACK;

    const map: Record<string, any> = {};
    for (const row of data) map[row.key] = row.value;

    return {
      model: map.ai_model ?? FALLBACK.model,
      maxTokens: map.ai_max_tokens ?? FALLBACK.maxTokens,
      temperature: map.ai_temperature ?? FALLBACK.temperature,
    };
  } catch {
    return FALLBACK;
  }
}

export async function POST(req: Request) {
  try {
    // Only the actual conversational content comes from the client. Model,
    // token limit, and temperature are resolved server-side from
    // app_settings — admin-adjustable via AdminPanel, but never trusted
    // from whatever the browser happens to send.
    const { system, userMsg } = await req.json();
    const { model, maxTokens, temperature } = await getAiSettings();

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

    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message || "Groq Error" }, { status: res.status });
    }

    return NextResponse.json({ result: data.choices?.[0]?.message?.content || "" });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
