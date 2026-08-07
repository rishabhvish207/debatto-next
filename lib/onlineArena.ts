// lib/onlineArena.ts
//
// Shared logic for the live two-human arena: submitting ONE argument the
// instant it's ready (not waiting for both sides of a round — see
// submitPvpTurn), and finalizing the match once all rounds are scored.
//
// submitPvpTurn used to run the AI judge call directly from the browser
// and then write gain/penalty straight into `online_match_rounds` with the
// anon-key client — that meant the only thing standing between a player
// and an arbitrary self-awarded score was Row Level Security checking
// *ownership* of the row, not *correctness* of the value being written.
// Both the judge call and the write now happen server-side, in
// app/api/online/score-turn/route.ts (service-role key) — this function is
// just a thin, auth-carrying fetch wrapper around that route. See that
// route's file comment for the full reasoning and the required companion
// RLS migration.

import { createClient } from "@/utils/supabase/client";
import { DEFAULT_PVP_JUDGE_SETTINGS, impactLabel } from "@/config/PvpJudge";

const supabase = createClient();

export type TurnScore = { gain: number; penalty: number; tags: string[]; fallacies?: any[] };

/**
 * Submits one argument for server-side judging + persistence. Throws if the
 * request is rejected (not your turn, not a participant, match not active,
 * etc.) so the caller can surface that to the player instead of silently
 * doing nothing.
 */
export async function submitPvpTurn(matchId: string, argument: string): Promise<TurnScore> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("You need to be signed in to play online matches.");

  const res = await fetch("/api/online/score-turn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
    body: JSON.stringify({ matchId, text: argument }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Failed to submit turn.");
  return { gain: data.gain, penalty: data.penalty, tags: data.tags || [] };
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
