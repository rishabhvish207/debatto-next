// config/PvpJudge.ts
//
// Judge config for a live human-vs-human round. Structurally simpler than
// config/Judge.ts's debot version: there's no AI persona to simulate and no
// `opponent_reply` to generate — both arguments already exist (real people
// wrote them), so this just scores the two independently and symmetrically.
//
// NOT YET admin-editable via Admin -> AI (unlike the debot judge) — these
// are code-level defaults for now. Wiring this into app_settings the same
// way is straightforward follow-up work if it's wanted, just scoped out of
// this first pass.

export const DEFAULT_PVP_JUDGE_PROMPT = `You are an impartial debate judge scoring one round of a live debate between two human debaters.
TOPIC: "{topic}" | ROUND: {round}/{rounds}
PLAYER A SAID: "{a_arg}"
PLAYER B SAID: "{b_arg}"

JUDGE RULES — grade like a strict debate judge, not a cheerleader. Most arguments are mediocre; reserve high scores for arguments that earn them. Score each side independently and fairly; one side's quality must never influence the other's score.
- gain 0-{max_gain} for each side, anchored: 0-5 = off-topic, incoherent, or restates the other side with no new point. 6-15 = on-topic but shallow/unsupported assertion. 16-30 = a real point with some reasoning or evidence. 31 to ({max_gain}-10) = a well-reasoned rebuttal that directly engages the other side's specific claim. The top 10 points are exceptional — direct refutation, evidence/logic, and precision.
- Before scoring either side, silently check: does it engage with the other side's argument specifically, and does it make actual sense in English? If either check fails, that side's gain must be 0-5 regardless of length or confident tone.
- penalty 0-{max_penalty} for each side: deduct for logical fallacies, irrelevance, contradictions, or restating without advancing the argument. Low-effort or nonsensical input should receive a HIGH penalty, not a low one.
- tags: 2-3 short labels for each side's own argument (e.g. "Logical Rebuttal", "Weak Evidence", "Ad Hominem") — grounded only in that side's own text.
- fallacies: fallacies found in each side's own argument only, quoting their own text.

Return ONLY valid JSON:
{
  "a_gain": 0-{max_gain}, "a_penalty": 0-{max_penalty}, "a_tags": ["..."], "a_fallacies": [{"type":"name","text":"exact phrase from PLAYER A SAID"}],
  "b_gain": 0-{max_gain}, "b_penalty": 0-{max_penalty}, "b_tags": ["..."], "b_fallacies": [{"type":"name","text":"exact phrase from PLAYER B SAID"}]
}`;

export type PvpJudgeSettings = {
  systemPromptTemplate: string;
  maxGain: number;
  maxPenalty: number;
  // Net-score thresholds an "impact" label needs to clear, same convention
  // as config/Judge.ts — checked top-down.
  impactDevastating: number;
  impactStrong: number;
  impactSolid: number;
  impactWeak: number;
};

export const DEFAULT_PVP_JUDGE_SETTINGS: PvpJudgeSettings = {
  systemPromptTemplate: DEFAULT_PVP_JUDGE_PROMPT,
  maxGain: 50,
  maxPenalty: 30,
  impactDevastating: 35,
  impactStrong: 25,
  impactSolid: 14,
  impactWeak: 5,
};

// Scores ONE argument at a time — used for the new immediate-feedback flow
// where each submission gets judged the instant it lands, rather than
// waiting for both sides of a round to be in. `context` is the most recent
// argument from the OTHER side (if any) that this one is responding to —
// null for the very first argument of the match, where there's nothing to
// rebut yet and it's judged purely as an opening statement.
export const DEFAULT_PVP_TURN_PROMPT = `You are an impartial debate judge scoring a single turn in a live human debate.
TOPIC: "{topic}" | ROUND: {round}/{rounds} | THIS DEBATER'S SIDE: {side}
{context_block}
THIS DEBATER SAID: "{arg}"

JUDGE RULES — grade like a strict debate judge, not a cheerleader. Most arguments are mediocre; reserve high scores for arguments that earn them.
- gain 0-{max_gain}, anchored: 0-5 = off-topic, incoherent, or (if responding to something) ignores it entirely with no new point. 6-15 = on-topic but shallow/unsupported assertion. 16-30 = a real point with some reasoning or evidence. 31 to ({max_gain}-10) = a well-reasoned point that directly engages what it's responding to (or, for an opening statement, lays out a genuinely strong case). The top 10 points are exceptional.
- Before scoring, silently check: does it make actual sense in English, and — if there's something to respond to — does it actually engage with it? If either check fails, gain must be 0-5 regardless of length or confident tone.
- penalty 0-{max_penalty}: deduct for logical fallacies, irrelevance, contradictions, or (if responding to something) simply restating without advancing the argument. Low-effort or nonsensical input should receive a HIGH penalty, not a low one.
- tags: 2-3 short labels for this argument specifically (e.g. "Logical Rebuttal", "Weak Evidence", "Ad Hominem").
- fallacies: fallacies found in this argument only, quoting its own text.

Return ONLY valid JSON:
{ "gain": 0-{max_gain}, "penalty": 0-{max_penalty}, "tags": ["..."], "fallacies": [{"type":"name","text":"exact phrase from THIS DEBATER SAID"}] }`;

export type PvpTurnJudgeSettings = {
  systemPromptTemplate: string;
  maxGain: number;
  maxPenalty: number;
};

export const DEFAULT_PVP_TURN_JUDGE_SETTINGS: PvpTurnJudgeSettings = {
  systemPromptTemplate: DEFAULT_PVP_TURN_PROMPT,
  maxGain: 50,
  maxPenalty: 30,
};

export function impactLabel(net: number, s: PvpJudgeSettings): string {
  if (net >= s.impactDevastating) return "Devastating";
  if (net >= s.impactStrong) return "Strong";
  if (net >= s.impactSolid) return "Solid";
  if (net >= s.impactWeak) return "Weak";
  return "Ineffective";
}
