// lib/onlineArena.ts
//
// Shared logic for the live two-human arena: scoring ONE argument the
// instant it's submitted (not waiting for both sides of a round — see
// scorePvpTurn), and finalizing the match once all rounds are scored.

import { createClient } from "@/utils/supabase/client";
import { callAI, extractJSON, isLowEffortInput } from "@/lib/ai";
import { fillTemplate } from "@/config/Judge";
import { DEFAULT_PVP_JUDGE_SETTINGS, DEFAULT_PVP_TURN_JUDGE_SETTINGS, impactLabel, type PvpTurnJudgeSettings } from "@/config/PvpJudge";

const supabase = createClient();

export type TurnScore = { gain: number; penalty: number; tags: string[]; fallacies: any[] };

// Scores a single argument in isolation. `precedingOpponentArg` is whatever
// the OTHER side most recently said (across the whole match, not just this
// round) — null only for the very first argument of the match, where
// there's nothing yet to respond to and it's judged purely as an opening
// statement.
export async function scorePvpTurn(
  topic: string,
  side: "FOR" | "AGAINST",
  myArg: string,
  precedingOpponentArg: string | null,
  round: number,
  roundsTotal: number,
  settings: PvpTurnJudgeSettings = DEFAULT_PVP_TURN_JUDGE_SETTINGS
): Promise<TurnScore> {
  const contextBlock = precedingOpponentArg
    ? `THEY JUST SAID: "${precedingOpponentArg}"`
    : "(This is the opening argument of the match — nothing to respond to yet, judge it as an opening statement.)";

  const sys = fillTemplate(settings.systemPromptTemplate, {
    topic, round, rounds: roundsTotal, side, context_block: contextBlock, arg: myArg,
    max_gain: settings.maxGain, max_penalty: settings.maxPenalty,
  });

  let ev: any = {};
  try {
    ev = JSON.parse(extractJSON(await callAI(sys, "Evaluate this turn.")));
  } catch (e) {
    // Silently defaulting to {} here (as this used to) is exactly why a bad
    // judge response looked like "no score, just Ineffective" with zero way
    // to tell why — logging it is the only way to actually diagnose a
    // model response that isn't coming back as clean JSON.
    console.error("PvP turn judge response wasn't valid JSON:", e);
    ev = {};
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
  let gain = clamp(ev.gain, 0, settings.maxGain);
  let penalty = clamp(ev.penalty, 0, settings.maxPenalty);

  if (isLowEffortInput(myArg)) { gain = 0; penalty = settings.maxPenalty; }

  return { gain, penalty, tags: ev.tags || [], fallacies: ev.fallacies || [] };
}

// Thresholds only — reused from the old paired-round settings since impact
// labeling is just "how good was this net score", independent of whether
// scoring happens per-turn or per-round-pair.
export function turnImpact(net: number): string {
  return impactLabel(net, DEFAULT_PVP_JUDGE_SETTINGS);
}

export async function finalizeMatchIfComplete(matchId: string): Promise<void> {
  const { error } = await supabase.rpc("apply_match_completion", { p_match_id: matchId });
  if (error) console.error("apply_match_completion failed:", error);
}
