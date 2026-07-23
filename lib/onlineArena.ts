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
// The actual computation lives server-side now — see apply_match_completion
// in the SQL migrations — since a client writing another player's
// prestige, or reporting its own match's final score, is the wrong shape
// regardless of RLS. This just calls that RPC.
export async function finalizeMatchIfComplete(matchId: string): Promise<void> {
  const { error } = await supabase.rpc("apply_match_completion", { p_match_id: matchId });
  if (error) console.error("apply_match_completion failed:", error);
}
