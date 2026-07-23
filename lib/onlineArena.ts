// lib/onlineArena.ts
//
// Shared logic for a live two-human match: scoring one round via the PvP
// judge, and finalizing the match (final scores, result, and — random mode
// only — the Elo-style prestige update) once all rounds are in. Kept out of
// the arena page component so the same completion logic can't drift between
// however many places end up calling it.

import { createClient } from "@/utils/supabase/client";
import { callAI, extractJSON, isLowEffortInput } from "@/lib/ai";
import { fillTemplate } from "@/config/Judge";
import { DEFAULT_PVP_JUDGE_SETTINGS, impactLabel, type PvpJudgeSettings } from "@/config/PvpJudge";

const supabase = createClient();

export type RoundScore = {
  aGain: number; aPenalty: number; aTags: string[]; aFallacies: any[];
  bGain: number; bPenalty: number; bTags: string[]; bFallacies: any[];
  impact: string;
};

export async function scorePvpRound(
  topic: string,
  round: number,
  roundsTotal: number,
  aArg: string,
  bArg: string,
  settings: PvpJudgeSettings = DEFAULT_PVP_JUDGE_SETTINGS
): Promise<RoundScore> {
  const sys = fillTemplate(settings.systemPromptTemplate, {
    topic, round, rounds: roundsTotal, a_arg: aArg, b_arg: bArg, max_gain: settings.maxGain, max_penalty: settings.maxPenalty,
  });

  let ev: any = {};
  try {
    ev = JSON.parse(extractJSON(await callAI(sys, "Evaluate both sides.")));
  } catch {
    ev = {};
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));

  let aGain = clamp(ev.a_gain, 0, settings.maxGain);
  let aPenalty = clamp(ev.a_penalty, 0, settings.maxPenalty);
  let bGain = clamp(ev.b_gain, 0, settings.maxGain);
  let bPenalty = clamp(ev.b_penalty, 0, settings.maxPenalty);

  // Same local backstop the debot judge uses — an LLM being too charitable
  // to obvious junk input is corrected here regardless of what it returned.
  if (isLowEffortInput(aArg)) { aGain = 0; aPenalty = settings.maxPenalty; }
  if (isLowEffortInput(bArg)) { bGain = 0; bPenalty = settings.maxPenalty; }

  const netA = Math.max(0, aGain - aPenalty);
  const netB = Math.max(0, bGain - bPenalty);

  return {
    aGain, aPenalty, aTags: ev.a_tags || [], aFallacies: ev.a_fallacies || [],
    bGain, bPenalty, bTags: ev.b_tags || [], bFallacies: ev.b_fallacies || [],
    impact: impactLabel(Math.max(netA, netB), settings),
  };
}

// Standard Elo, K=32, floor 100 (per the spec this was designed against).
// score is 1 for a win, 0.5 for a draw, 0 for a loss.
function eloDelta(myRating: number, oppRating: number, score: number): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
  return Math.round(K * (score - expected));
}

export async function finalizeMatchIfComplete(matchId: string): Promise<void> {
  const { data: match } = await supabase.from("online_matches").select("*").eq("id", matchId).maybeSingle();
  if (!match || match.status === "completed") return;

  const { data: rounds } = await supabase.from("online_match_rounds").select("*").eq("match_id", matchId);
  const completedRounds = (rounds || []).filter((r: any) => r.player_a_gain !== null && r.player_b_gain !== null);
  if (completedRounds.length < match.rounds_total) return;

  const aScore = completedRounds.reduce((sum: number, r: any) => sum + Math.max(0, (r.player_a_gain || 0) - (r.player_a_penalty || 0)), 0);
  const bScore = completedRounds.reduce((sum: number, r: any) => sum + Math.max(0, (r.player_b_gain || 0) - (r.player_b_penalty || 0)), 0);
  const result = aScore === bScore ? "draw" : aScore > bScore ? "a_win" : "b_win";

  const update: Record<string, any> = {
    status: "completed",
    completed_at: new Date().toISOString(),
    player_a_score: aScore,
    player_b_score: bScore,
    result,
  };

  if (match.mode === "random") {
    const { data: profs } = await supabase.from("profiles").select("id, prestige").in("id", [match.player_a, match.player_b]);
    const aPrestige = profs?.find((p: any) => p.id === match.player_a)?.prestige ?? 500;
    const bPrestige = profs?.find((p: any) => p.id === match.player_b)?.prestige ?? 500;
    const aOutcome = result === "draw" ? 0.5 : result === "a_win" ? 1 : 0;
    const bOutcome = 1 - aOutcome;
    const aDelta = eloDelta(aPrestige, bPrestige, aOutcome);
    const bDelta = eloDelta(bPrestige, aPrestige, bOutcome);

    update.player_a_prestige_delta = aDelta;
    update.player_b_prestige_delta = bDelta;

    await supabase.from("profiles").update({ prestige: Math.max(100, aPrestige + aDelta) }).eq("id", match.player_a);
    await supabase.from("profiles").update({ prestige: Math.max(100, bPrestige + bDelta) }).eq("id", match.player_b);
  }

  await supabase.from("online_matches").update(update).eq("id", matchId);
}
