export const AI_CONFIG = {
  baseUrl: "https://api.groq.com/openai/v1",
  model: "llama-3.3-70b-versatile",
  maxTokens: 1000,
  temperature: 0.6,
  // Used when the primary model hits a rate limit (429) — a smaller model
  // with a much higher free-tier daily token budget, so a spike in usage
  // degrades gracefully instead of failing every in-flight match outright.
  fallbackModel: "llama-3.1-8b-instant",
  fallbackEnabled: true,
};