import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_CONFIG } from "@/config/AI";
import { fillTemplate } from "@/config/Judge";
import { DEFAULT_PVP_TURN_JUDGE_SETTINGS } from "@/config/PvpJudge";
import { isLowEffortInput } from "@/lib/ai";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { reasoningModelExtras } from "@/lib/groqReasoning";

// ─────────────────────────────────────────────────────────────────────────
// Server-authoritative PvP turn scoring.
//
// Previously (see lib/onlineArena.ts / app/(app)/online/match/[id]/page.tsx
// in git history), each browser called the AI judge itself via callAI()
// and then wrote the resulting gain/penalty straight into
// `online_match_rounds` with the ordinary anon-key client, relying entirely
// on Row Level Security to gate the write. RLS can only check *ownership*
// ("is this your row to write?"), not *correctness* — nothing stopped a
// player from skipping scorePvpTurn() entirely and inserting/updating
// online_match_rounds with any gain/penalty they wanted directly against
// the Supabase REST API, which is real damage/points in a live match
// against another human.
//
// This route moves both the AI judge call AND the database write here,
// server-side, using the service-role key — so the only way to affect
// `online_match_rounds` is to submit actual argument text through this
// endpoint and let the server itself decide (and persist) the score.
//
// IMPORTANT — this route only closes the hole if the client can no longer
// write to `online_match_rounds` directly. That also requires a DB-side
// change this code can't make on its own: tighten (or drop) the RLS
// policies that currently let player_a/player_b UPDATE/INSERT
// `online_match_rounds` themselves, so only the service role (used here)
// can write to that table. See README's "Locking down online_match_rounds"
// section for the exact SQL — this file is necessary but not sufficient
// without that migration also being applied.
// ─────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function getAiSettingsFallback() {
  return { model: AI_CONFIG.model, maxTokens: AI_CONFIG.maxTokens, temperature: AI_CONFIG.temperature };
}

async function getAiSettings(admin: ReturnType<typeof getAdminClient>) {
  const FALLBACK = getAiSettingsFallback();
  try {
    const { data } = await admin.from("app_settings").select("key, value").in("key", ["ai_model", "ai_max_tokens", "ai_temperature"]);
    const map: Record<string, any> = {};
    for (const row of data || []) map[row.key] = row.value;
    return {
      model: map.ai_model ?? FALLBACK.model,
      maxTokens: map.ai_max_tokens ?? FALLBACK.maxTokens,
      temperature: map.ai_temperature ?? FALLBACK.temperature,
    };
  } catch {
    return FALLBACK;
  }
}

async function callGroqJudge(system: string, userMsg: string, model: string, maxTokens: number, temperature: number) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      max_tokens: maxTokens,
      temperature,
      ...reasoningModelExtras(model),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Groq error");
  return data.choices?.[0]?.message?.content || "";
}

function extractJSON(raw: string) {
  // See lib/ai.ts's extractJSON for why: reasoning models can leak
  // internal reasoning wrapped in <think>...</think> even with
  // reasoning_effort turned down.
  const noThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const s = noThink.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return a !== -1 && b !== -1 ? s.slice(a, b + 1) : s;
}

function impactLabelFor(net: number) {
  if (net >= 35) return "Devastating";
  if (net >= 25) return "Strong";
  if (net >= 14) return "Solid";
  if (net >= 5) return "Weak";
  return "Ineffective";
}

export async function POST(req: NextRequest) {
  try {
    // Real Groq spend + a DB write per call — this is the single most
    // valuable endpoint to cap, since it's also the one a cheat script has
    // the most reason to hammer.
    const rl = checkRateLimit(req, "online-score-turn", { limit: 20, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const { matchId, text } = await req.json();
    if (typeof matchId !== "string" || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Malformed submission." }, { status: 400 });
    }
    // Same ceiling the debate route effectively gets from a real UI —
    // guards against someone posting megabytes of text straight to the API.
    const argument = text.trim().slice(0, 4000);

    const admin = getAdminClient();

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (userError || !callerId) {
      return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const { data: match, error: matchError } = await admin
      .from("online_matches")
      .select("id, status, player_a, player_b, player_a_side, first_arguer, topic_text, rounds_total")
      .eq("id", matchId)
      .maybeSingle();
    if (matchError || !match) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }
    if (match.player_a !== callerId && match.player_b !== callerId) {
      return NextResponse.json({ error: "You are not a participant in this match." }, { status: 403 });
    }
    if (match.status !== "active") {
      return NextResponse.json({ error: "This match isn't active." }, { status: 409 });
    }

    const iAmA = match.player_a === callerId;
    const mySide: "FOR" | "AGAINST" = iAmA ? match.player_a_side : match.player_a_side === "FOR" ? "AGAINST" : "FOR";
    const iAmFirstArguer = match.first_arguer === callerId;
    const firstArguerIsA = match.first_arguer === match.player_a;
    const firstArgKey = firstArguerIsA ? "player_a_argument" : "player_b_argument";
    const secondArgKey = firstArguerIsA ? "player_b_argument" : "player_a_argument";
    const myArgKey = iAmA ? "player_a_argument" : "player_b_argument";
    const myGainKey = iAmA ? "player_a_gain" : "player_b_gain";
    const myPenaltyKey = iAmA ? "player_a_penalty" : "player_b_penalty";
    const fallacyKey = myArgKey === "player_a_argument" ? "a" : "b";
    const tagsKey = myArgKey === "player_a_argument" ? "a_tags" : "b_tags";

    const { data: rounds, error: roundsError } = await admin
      .from("online_match_rounds")
      .select("*")
      .eq("match_id", matchId)
      .order("round_number", { ascending: true });
    if (roundsError) {
      console.error(roundsError);
      return NextResponse.json({ error: "Failed to load match state." }, { status: 500 });
    }

    const activeRound = (rounds || []).find((r: any) => r.player_a_gain === null || r.player_b_gain === null);

    // Re-derive whose turn it is server-side — exactly the same logic the
    // client uses for its UI, but this is the copy that actually gates the
    // write. A request that's out of turn (already-scored round, wrong
    // player, round already has this player's argument in) is rejected
    // instead of silently trusted.
    let myTurn = false;
    if (!activeRound) {
      myTurn = iAmFirstArguer;
    } else if (!activeRound[firstArgKey]) {
      myTurn = iAmFirstArguer;
    } else if (!activeRound[secondArgKey]) {
      myTurn = !iAmFirstArguer;
    }
    if (!myTurn) {
      return NextResponse.json({ error: "It isn't your turn." }, { status: 409 });
    }

    const nextRoundNumber = (rounds?.length || 0) + (activeRound ? 0 : 1);
    const precedingOpponentArg = (() => {
      // Whatever the OTHER side most recently said, anywhere in the match
      // so far — same "flatten to chronological turns" logic the client
      // uses for display, recomputed here rather than trusted from the
      // client.
      const turns: { side: "a" | "b"; roundNumber: number; argument: string }[] = [];
      for (const r of rounds || []) {
        if (r.player_a_argument && r.player_a_gain !== null) turns.push({ side: "a", roundNumber: r.round_number, argument: r.player_a_argument });
        if (r.player_b_argument && r.player_b_gain !== null) turns.push({ side: "b", roundNumber: r.round_number, argument: r.player_b_argument });
      }
      turns.sort((x, y) => x.roundNumber - y.roundNumber || (x.side === (firstArguerIsA ? "a" : "b") ? -1 : 1));
      const last = turns[turns.length - 1];
      return last ? last.argument : null;
    })();

    const settings = DEFAULT_PVP_TURN_JUDGE_SETTINGS;
    const contextBlock = precedingOpponentArg
      ? `THEY JUST SAID: "${precedingOpponentArg}"`
      : "(This is the opening argument of the match — nothing to respond to yet, judge it as an opening statement.)";
    const sys = fillTemplate(settings.systemPromptTemplate, {
      topic: match.topic_text,
      round: Math.min(nextRoundNumber, match.rounds_total),
      rounds: match.rounds_total,
      side: mySide,
      context_block: contextBlock,
      arg: argument,
      max_gain: settings.maxGain,
      max_penalty: settings.maxPenalty,
    });

    const { model, maxTokens, temperature } = await getAiSettings(admin);
    let ev: any = {};
    try {
      ev = JSON.parse(extractJSON(await callGroqJudge(sys, "Evaluate this turn.", model, maxTokens, temperature)));
    } catch (e) {
      console.error("PvP turn judge response wasn't valid JSON:", e);
      ev = {};
    }

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
    let gain = clamp(ev.gain, 0, settings.maxGain);
    let penalty = clamp(ev.penalty, 0, settings.maxPenalty);
    if (isLowEffortInput(argument)) { gain = 0; penalty = settings.maxPenalty; }

    const impact = impactLabelFor(Math.max(0, gain - penalty));
    const scoreResult = { gain, penalty, tags: ev.tags || [], fallacies: ev.fallacies || [] };

    if (!activeRound) {
      const { error } = await admin.from("online_match_rounds").insert({
        match_id: matchId,
        round_number: nextRoundNumber,
        [firstArgKey]: argument,
        [myGainKey]: scoreResult.gain,
        [myPenaltyKey]: scoreResult.penalty,
        impact,
        fallacies: { [fallacyKey]: scoreResult.fallacies, [tagsKey]: scoreResult.tags },
      });
      if (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to record turn." }, { status: 500 });
      }
    } else {
      const existingFallacies = activeRound.fallacies || {};
      const { error } = await admin
        .from("online_match_rounds")
        .update({
          [myArgKey]: argument,
          [myGainKey]: scoreResult.gain,
          [myPenaltyKey]: scoreResult.penalty,
          impact,
          fallacies: { ...existingFallacies, [fallacyKey]: scoreResult.fallacies, [tagsKey]: scoreResult.tags },
        })
        .eq("id", activeRound.id);
      if (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to record turn." }, { status: 500 });
      }
    }

    const { error: finalizeError } = await admin.rpc("apply_match_completion", { p_match_id: matchId });
    if (finalizeError) console.error("apply_match_completion failed:", finalizeError);

    return NextResponse.json({ gain: scoreResult.gain, penalty: scoreResult.penalty, impact, tags: scoreResult.tags });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
