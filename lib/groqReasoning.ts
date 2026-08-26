// lib/groqReasoning.ts
//
// Shared by every route that calls Groq's chat completions endpoint
// directly (app/api/debate, app/api/daily-challenge, app/api/online/score-turn).
//
// Reasoning models (OpenAI's GPT-OSS family, Qwen3) think before they
// answer — by default at "medium" effort on Groq. That's invisible and
// harmless for a route that just wants a paragraph of free-form text back
// (a debot's reply, an ace-card hint), but it's a real problem for every
// route here that asks for a short, strict JSON blob back and parses it:
// the judge/scoring calls in app/api/debate and app/api/online/score-turn,
// and the question-generation call in app/api/daily-challenge. Groq's own
// docs and community forum both note that reasoning content can end up
// mixed into the same `content` field these routes parse, and/or eat into
// the max_tokens budget before the actual JSON answer gets written — either
// way, a JSON.parse() on the result fails and the caller's try/catch
// quietly falls back to a zeroed-out result. That's what "the AI judge
// doesn't work" looks like from the outside: not an error, just silently
// wrong output every time.
//
// Passing `reasoning_effort: "low"` cuts that down substantially (less
// thinking = less to leak, less budget consumed) without disabling
// reasoning entirely (which these models don't reliably support turning
// fully off, and a little reasoning can still help judgment quality).
//
// This is deliberately model-gated, not sent unconditionally: only GPT-OSS
// and Qwen3 document support for `reasoning_effort` — other models
// (including AI_CONFIG.fallbackModel, llama-3.1-8b-instant) may reject an
// unrecognized field outright, and admins can swap in yet another model
// later without necessarily knowing about this parameter at all.

export function isReasoningModel(model: string): boolean {
  return /^openai\/gpt-oss/i.test(model) || /^qwen\//i.test(model);
}

/** Extra body fields to merge into a Groq chat-completion request for this model. */
export function reasoningModelExtras(model: string): Record<string, any> {
  return isReasoningModel(model) ? { reasoning_effort: "low" } : {};
}
