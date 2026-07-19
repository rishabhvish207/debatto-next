"use client";

import { useState, useRef, useEffect } from "react";
import { callAI } from "@/lib/ai";

type ChatMsg = { role: "user" | "assistant"; text: string };

const TUTOR_SYSTEM_PROMPT = `You are the AI Tutor inside Debatto, a debate-practice game. You help players understand
argument structure (claim / warrant / impact), logical fallacies, and debate technique, and you can also explain
how the app itself works (HP, points, rounds, debots, items, debucks, achievements, the Daily Challenge, online
prestige) at a high level. Keep answers short and conversational — a few sentences, occasionally a short example. If
asked something totally unrelated to debate or the app, gently redirect back to what you can help with. Never claim
to be a human or a licensed instructor.`;

export function AiTutor() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", text: "Hi! Ask me about argument structure, fallacies, debate technique, or how anything in Debatto works." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setError("");
    const next = [...messages, { role: "user" as const, text: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const recent = next.slice(-8).map((m) => `${m.role === "user" ? "Player" : "Tutor"}: ${m.text}`).join("\n");
      const reply = await callAI(TUTOR_SYSTEM_PROMPT, recent);
      setMessages((prev) => [...prev, { role: "assistant", text: reply.trim() }]);
    } catch (err: any) {
      setError(err?.message || "The tutor is unavailable right now — please try again.");
    }
    setSending(false);
  }

  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", height: 480, overflow: "hidden" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              maxWidth: "82%",
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? "var(--blue-soft)" : "var(--faint)",
              border: `1px solid ${m.role === "user" ? "var(--blue-soft)" : "var(--border)"}`,
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>Tutor is typing…</div>
        )}
        {error && <div style={{ fontSize: 12, color: "var(--red)" }}>{error}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
        <input
          className="input-field"
          style={{ flex: 1 }}
          placeholder="Ask about fallacies, technique, or how the app works…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={sending}
        />
        <button className="btn btn-primary btn-sm" onClick={send} disabled={sending || !input.trim()}>Send</button>
      </div>
    </div>
  );
}
