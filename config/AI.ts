export const AI_CONFIG = {
  baseUrl: "https://api.groq.com/openai/v1",
  // NOTE: llama-3.3-70b-versatile was decommissioned by Groq (Aug 16,
  // 2026 notice). This is only the code-level FALLBACK used if
  // app_settings.ai_model was never set — the live model is whatever's
  // configured in Admin → AI → Judge & Scoring, which takes priority over
  // this. Update this too, though, so a fresh deploy/reset settings row
  // doesn't silently fall back to a dead model.
  model: "openai/gpt-oss-120b",
  maxTokens: 1000,
  temperature: 0.6,
  // Used when the primary model hits a rate limit (429) — a smaller model
  // with a much higher free-tier daily token budget, so a spike in usage
  // degrades gracefully instead of failing every in-flight match outright.
  fallbackModel: "llama-3.1-8b-instant",
  fallbackEnabled: true,
};