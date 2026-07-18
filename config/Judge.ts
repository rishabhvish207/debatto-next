// config/Judge.ts
//
// Everything about how a round gets scored — the actual prompt sent to the
// judge model, the caps applied to whatever it returns, the HP-damage
// conversion, the impact-label thresholds, and the win-bonus rules — is
// admin-editable (Admin → AI → Judge & Scoring), stored in `app_settings`,
// and fetched by GameContext at startup. This file only supplies the
// shipped defaults, used to seed that table and as a fallback if a setting
// is missing.
//
// HOW MUCH IS ACTUALLY TUNABLE, HONESTLY:
// - The prompt TEXT is fully rewritable — nothing about the rubric,
//   tone, or instructions is hardcoded once this is wired up.
// - The runtime FACTS the model needs (topic, sides, round number, debot
//   personality/depth/story, difficulty guidance, emotional context, what
//   each side said) are substituted into the template via the {token}s
//   below — an admin can move them around, drop ones they don't want
//   considered, or repeat one for emphasis, but can't remove the
//   underlying data feed itself without editing code (there's no way to
//   add a wholly new fact the app doesn't already compute).
// - The five fields returned by the model (gain, penalty, opponent_gain,
//   opponent_penalty, opponent_reply — plus the descriptive tags/critique/
//   fallacies/weak_points, which are cosmetic and don't affect score) are a
//   FIXED response shape. An admin can change the *caps* applied to gain/
//   penalty/opponent_gain/opponent_penalty and the wording of what earns
//   what, but can't add a 6th number that affects scoring without a code
//   change — the app only reads those five names out of the JSON.
// - Net = gain − penalty (floored at 0) is NOT admin-editable as a formula —
//   only what feeds into gain and penalty is. Likewise HP damage is always
//   `net * a multiplier`, where the multiplier is admin-editable but the
//   shape of the formula (net → damage, linear) is not.
// - The "low-effort backstop" (a local, non-AI heuristic that zeroes the
//   gain and maxes the penalty for obvious junk input like "asdasd asdasd")
//   can be switched off entirely if an admin wants the model's own
//   judgment fully trusted with no local override.
export const DEFAULT_JUDGE_PROMPT = `You are both {opp_name} and an impartial debate judge.
TOPIC: "{topic}" | OPPONENT SIDE: {opp_side} | PLAYER ({player_name}): {player_side} | ROUND: {round}/{rounds}
DEBOT PERSONALITY: {opp_personality} | ARGUMENT DEPTH: {opp_depth}
DEBOT BACKGROUND STORY: {opp_story} (occasionally, not every round, let a hint of past/present/what-they're-working-toward color the opponent_reply)
{difficulty_guidance}
EMOTIONAL CONTEXT: {emotional_context}
OPPONENT SAID: "{opp_arg}"
PLAYER SAID: "{player_arg}"

JUDGE RULES — grade like a strict debate judge, not a cheerleader, adjusted for this debot's difficulty above. Most arguments are mediocre; reserve high scores for arguments that earn them.
- gain 0-{max_gain}, anchored: 0-5 = off-topic, incoherent, or restates opponent with no new point. 6-15 = on-topic but shallow/unsupported assertion. 16-30 = a real point with some reasoning or evidence. 31 to ({max_gain}-10) = a well-reasoned rebuttal that directly engages the opponent's specific claim. The top 10 points are exceptional — direct refutation, evidence/logic, and precision, reserved for genuinely strong debate.
- Before scoring, silently check: does this response engage with "{opp_arg}" specifically, and does it make actual sense in English? If either check fails, gain must be 0-5 regardless of length or confident tone.
- penalty 0-{max_penalty}: deduct for logical fallacies, irrelevance, contradictions, or restating without advancing the argument. Low-effort or nonsensical input should receive a HIGH penalty, not a low one.
- tags: 2-3 short labels describing the PLAYER's argument specifically (e.g. "Logical Rebuttal", "Weak Evidence", "Ad Hominem") — must match what PLAYER SAID actually contains, never traits of OPPONENT SAID.
- critique: one honest sentence about PLAYER SAID only. Do not describe or restate OPPONENT SAID's content, reasoning style, or weaknesses here — this field is about the player, not the opponent.
- fallacies: fallacies in the PLAYER's response only.
- CHECK BEFORE WRITING gain/penalty/tags/critique/fallacies: re-read PLAYER SAID above. Every one of these five fields must be grounded only in that exact text, never in OPPONENT SAID.
- opponent_gain 0-{max_opp_gain}, opponent_penalty 0-{max_opp_penalty}: evaluate opponent's prior argument (OPPONENT SAID) independently, by the same strict standard.
- weak_points: 2-4 SHORT targetable phrases from YOUR new opponent_reply (the debot's upcoming argument, not the player's).

Return ONLY valid JSON. Fill fields in this order so the player evaluation is grounded before you switch back into {opp_name}'s voice:
{
  "gain": 0-{max_gain},
  "penalty": 0-{max_penalty},
  "impact": "Ineffective|Weak|Solid|Strong|Devastating",
  "tags": ["about PLAYER's argument only"],
  "critique": "One honest sentence about PLAYER SAID only.",
  "fallacies": [{"type":"name","text":"exact phrase from PLAYER SAID"}],
  "opponent_gain": 0-{max_opp_gain},
  "opponent_penalty": 0-{max_opp_penalty},
  "opponent_reply": "{closing_instruction}",
  "weak_points": ["phrase1","phrase2"]
}`;

export type JudgeSettings = {
  systemPromptTemplate: string;
  maxGain: number;
  maxPenalty: number;
  maxOppGain: number;
  maxOppPenalty: number;
  playerDamageMultiplier: number;
  opponentDamageMultiplier: number;
  // Net-score thresholds an "impact" label needs to clear, checked from the
  // top down (>= devastating -> Devastating, >= strong -> Strong, etc.,
  // otherwise Ineffective).
  impactDevastating: number;
  impactStrong: number;
  impactSolid: number;
  impactWeak: number;
  // Debucks bonuses, added to a win's reward on top of the debot's base
  // reward. noPenalty requires every round of the match to have taken zero
  // penalty; domination requires winning by at least dominationMargin net
  // points (player total − opponent total).
  noPenaltyBonus: number;
  dominationBonus: number;
  dominationMargin: number;
  // If on, obviously-junk input (too short, mostly symbols, no real words)
  // is locally zeroed to 0 gain / max penalty regardless of what the model
  // returned — a backstop against small/fast models being too charitable.
  // If off, the model's own gain/penalty are trusted completely.
  lowEffortBackstopEnabled: boolean;
};

export const DEFAULT_JUDGE_SETTINGS: JudgeSettings = {
  systemPromptTemplate: DEFAULT_JUDGE_PROMPT,
  maxGain: 50,
  maxPenalty: 30,
  maxOppGain: 40,
  maxOppPenalty: 15,
  playerDamageMultiplier: 0.52,
  opponentDamageMultiplier: 0.38,
  impactDevastating: 35,
  impactStrong: 25,
  impactSolid: 14,
  impactWeak: 5,
  noPenaltyBonus: 5,
  dominationBonus: 8,
  dominationMargin: 20,
  lowEffortBackstopEnabled: true,
};

/** Replaces every literal `{key}` in `template` with `String(vars[key])`. Unknown keys in the template are left as-is rather than erroring. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}
