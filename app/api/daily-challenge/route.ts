import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_CONFIG } from "@/config/AI";
import { QUESTION_GEN_SYSTEM_PROMPT, FALLBACK_QUESTIONS, DailyChallengeQuestion } from "@/config/DailyChallenge";

// This route (and submit/route.ts) uses the SERVICE ROLE key, not the anon
// key like app/api/debate/route.ts does — on purpose. The whole point of
// server-side grading is that `correctIndex` must never reach the browser,
// and Supabase RLS can't hide one column of a jsonb row from an otherwise-
// permitted SELECT; the only clean way to guarantee that is a table with NO
// client-facing SELECT policy at all, read here with a key that bypasses
// RLS entirely. Requires SUPABASE_SERVICE_ROLE_KEY in your env — see README.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Anon-key client, just for reading the AI model settings (public data,
// same pattern as app/api/debate/route.ts).
const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function extractJSONArray(raw: string): string {
  const s = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  return (a !== -1 && b !== -1) ? s.slice(a, b + 1) : s;
}

function validateQuestions(parsed: any): DailyChallengeQuestion[] | null {
  if (!Array.isArray(parsed) || parsed.length !== 10) return null;
  for (const q of parsed) {
    if (typeof q?.text !== "string" || !q.text.trim()) return null;
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o: any) => typeof o !== "string" || !o.trim())) return null;
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) return null;
  }
  return parsed as DailyChallengeQuestion[];
}

async function getAiSettings() {
  const FALLBACK = { model: AI_CONFIG.model, maxTokens: AI_CONFIG.maxTokens, temperature: AI_CONFIG.temperature };
  try {
    const { data } = await supabasePublic.from("app_settings").select("key, value").in("key", ["ai_model", "ai_max_tokens"]);
    const map: Record<string, any> = {};
    for (const row of data || []) map[row.key] = row.value;
    return {
      model: map.ai_model ?? FALLBACK.model,
      maxTokens: Math.max(map.ai_max_tokens ?? FALLBACK.maxTokens, 2000), // 10 questions need more headroom than a single judge call
      temperature: 0.9, // some variety day to day
    };
  } catch {
    return FALLBACK;
  }
}

async function generateQuestions(): Promise<DailyChallengeQuestion[]> {
  try {
    const { model, maxTokens, temperature } = await getAiSettings();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: QUESTION_GEN_SYSTEM_PROMPT },
          { role: "user", content: `Generate today's (${todayUTC()}) quiz.` },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "Groq error");
    const raw = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(extractJSONArray(raw));
    const valid = validateQuestions(parsed);
    if (!valid) throw new Error("AI returned malformed questions");
    return valid;
  } catch (err) {
    console.error("Daily challenge generation failed, using fallback set:", err);
    return FALLBACK_QUESTIONS;
  }
}

export async function GET() {
  try {
    const date = todayUTC();

    const { data: existing } = await supabaseAdmin
      .from("daily_challenges")
      .select("id, challenge_date, questions")
      .eq("challenge_date", date)
      .maybeSingle();

    let row = existing;
    if (!row) {
      const questions = await generateQuestions();
      // ignoreDuplicates handles the race where two requests both see "no
      // row yet" and both try to generate — whichever insert loses just
      // falls through to the re-read below instead of erroring.
      await supabaseAdmin
        .from("daily_challenges")
        .upsert({ challenge_date: date, questions }, { onConflict: "challenge_date", ignoreDuplicates: true });

      const { data: reread } = await supabaseAdmin
        .from("daily_challenges")
        .select("id, challenge_date, questions")
        .eq("challenge_date", date)
        .maybeSingle();
      row = reread;
    }

    if (!row) {
      return NextResponse.json({ error: "Could not load today's challenge." }, { status: 500 });
    }

    // Strip correctIndex before this ever leaves the server.
    const publicQuestions = (row.questions as DailyChallengeQuestion[]).map((q) => ({ text: q.text, options: q.options }));

    return NextResponse.json({ challengeId: row.id, challengeDate: row.challenge_date, questions: publicQuestions });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
