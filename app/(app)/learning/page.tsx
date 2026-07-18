"use client";

// Learning — three sections per the app structure spec:
//   Documentation  — argument structure, logical fallacies, debate technique
//   AI Tutor       — a chatbot (grounded in the same documentation below)
//                    that can explain/expand on any of it conversationally
//   Game Guide     — an in-app explainer for how Debatto itself works
//
// All static content lives in this one file rather than a CMS/table, since
// unlike debots/topics/store items it isn't something an admin needs to
// tune per-deployment — it's the same debate theory regardless of who's
// running the app.

import { useState, useRef, useEffect } from "react";
import { callAI } from "@/lib/ai";

type Section = "docs" | "tutor" | "guide";

export default function LearningPage() {
  const [section, setSection] = useState<Section>("docs");

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 720, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 26, marginBottom: 4 }}>Learning</h2>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
        Argument theory, a chatbot to talk it through with, and a guide to how Debatto itself works.
      </p>

      <div style={{ display: "flex", gap: 24, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {([
          ["docs", "Documentation"],
          ["tutor", "AI Tutor"],
          ["guide", "Game Guide"],
        ] as const).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "0 2px 12px", fontSize: 13, fontWeight: 700,
              letterSpacing: "0.02em",
              color: section === s ? "var(--text)" : "var(--muted)",
              borderBottom: section === s ? "2px solid var(--blue)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "docs" && <Documentation />}
      {section === "tutor" && <AiTutor />}
      {section === "guide" && <GameGuide />}
    </div>
  );
}

/* DOCUMENTATION */

const FALLACIES = [
  { name: "Ad Hominem", def: "Attacking the person making the argument instead of the argument itself." },
  { name: "Straw Man", def: "Misrepresenting an opponent's position as something weaker or more extreme, then attacking that instead." },
  { name: "False Dilemma", def: "Presenting only two options when more actually exist." },
  { name: "Slippery Slope", def: "Claiming one step will inevitably lead to an extreme outcome, without showing why each step follows." },
  { name: "Appeal to Authority", def: "Treating a claim as true mainly because an authority figure said it, rather than on its own merits." },
  { name: "Appeal to Emotion", def: "Using fear, pity, or outrage to win agreement instead of evidence or reasoning." },
  { name: "Circular Reasoning", def: "Using the conclusion as one of the premises, so the argument just restates itself." },
  { name: "Hasty Generalization", def: "Drawing a broad conclusion from too small or unrepresentative a sample." },
  { name: "Red Herring", def: "Introducing an irrelevant point to divert attention from the actual issue." },
  { name: "Bandwagon", def: "Arguing something is true or right because it's popular or widely believed." },
  { name: "False Cause", def: "Assuming that because one thing followed another, the first caused the second." },
  { name: "Equivocation", def: "Shifting the meaning of a key word partway through an argument to make it seem to hold together." },
];

function Documentation() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <DocCard title="Argument Structure" icon="🏛">
        <p style={pStyle}>
          A strong argument usually has three parts working together: a <b>claim</b> (the point you're making), a{" "}
          <b>warrant</b> (the reasoning or evidence that supports it), and an <b>impact</b> (why it actually matters —
          who's affected, and how much). Missing any one of the three makes an argument easy to poke through.
        </p>
        <p style={pStyle}>
          A claim on its own is just an assertion — "this policy is bad" doesn't do any work until it's backed by a
          reason. A warrant without a clear claim is reasoning in search of a point. And a claim with a warrant but
          no impact can be technically correct while still not mattering to the debate — the judge, or your
          opponent, is always implicitly asking "so what?"
        </p>
        <p style={pStyle}>
          When you're building a response mid-match, it helps to work backward from impact: decide what you want to
          prove matters, then find the warrant that gets you there, then state the claim plainly enough that it's
          obvious what you're arguing.
        </p>
      </DocCard>

      <DocCard title="Logical Fallacies" icon="⚠">
        <p style={pStyle}>
          A fallacy is a flaw in reasoning that makes an argument unpersuasive even if its conclusion happens to be
          true. Spotting them — in your opponent's argument or your own — is one of the fastest ways to gain ground
          in a match. The Insight lifeline (once unlocked) will flag some of these automatically mid-battle.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FALLACIES.map((f) => (
            <div key={f.name} style={{ display: "flex", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", flexShrink: 0, minWidth: 130 }}>{f.name}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{f.def}</div>
            </div>
          ))}
        </div>
      </DocCard>

      <DocCard title="Debate Technique" icon="🎯">
        <TechniquePoint title="Rebut, don't restate">
          Answering an opponent's point means directly engaging with their warrant — explaining why their reasoning
          doesn't hold, or why it doesn't lead where they claim — not just repeating your own original claim louder.
        </TechniquePoint>
        <TechniquePoint title="Weigh, don't just list">
          When both sides have valid points, explain why yours matters more — in scale (how many people/how much),
          in probability (how likely the impact actually is), or in reversibility (can the harm be undone?).
        </TechniquePoint>
        <TechniquePoint title="Concede strategically">
          Conceding a minor point you can't win, then pivoting to why it doesn't change the overall conclusion, is
          usually stronger than stretching to deny something obviously true.
        </TechniquePoint>
        <TechniquePoint title="Preempt the obvious response">
          If you can see the counter coming, address it before your opponent raises it — it reads as more
          in-control and takes the point off the table before it can land.
        </TechniquePoint>
        <TechniquePoint title="Stay on the actual topic">
          It's tempting to chase a tangent you're confident on, but points that don't connect back to the resolution
          tend to score worse than a tighter, more directly relevant answer.
        </TechniquePoint>
      </DocCard>
    </div>
  );
}

function DocCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function TechniquePoint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

const pStyle: React.CSSProperties = { fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 10 };

/* GAME GUIDE */

function GameGuide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <DocCard title="The Basics" icon="⚔">
        <p style={pStyle}>
          Pick a debot, a topic, and a side, then argue back and forth for a set number of rounds. Each round, an AI
          judge scores your argument (a <b>gain</b> for what worked, a <b>penalty</b> for what didn't — the
          difference is your <b>net</b> for the round) and the debot fires back in character, with its own net
          damage against you.
        </p>
        <p style={pStyle}>
          Both sides have HP. A round's net score becomes damage to the opponent's HP. The match ends when someone's
          HP hits 0, or after the last round — whoever has more total points at that point wins. A tie is a draw.
        </p>
      </DocCard>

      <DocCard title="Debots" icon="🤖">
        <p style={pStyle}>
          Each debot has its own personality, argument style, and a <b>difficulty</b> label (Beginner through
          Expert) that actually changes how it argues and how strictly it grades you — a Beginner debot makes
          exploitable mistakes and grades generously; an Expert one argues tightly and grades hard. Debots with a
          cost need to be unlocked with debucks first.
        </p>
      </DocCard>

      <DocCard title="Items" icon="🎒">
        <TechniquePoint title="🔍 Insight Lens">
          A one-time permanent purchase. Once owned, tap Insight any time during your turn to see the opponent's
          fallacies and weak points highlighted — unlimited uses.
        </TechniquePoint>
        <TechniquePoint title="🂡 Ace Card">
          A consumable. Reveals 3 AI-suggested responses to the opponent's last argument — use one as-is or as a
          starting point. Gets pricier the more you're holding at once; using them brings the price back down.
        </TechniquePoint>
        <TechniquePoint title="💊 Confidence Pill">
          A consumable that heals HP instantly, no AI call needed. Flat price every time.
        </TechniquePoint>
      </DocCard>

      <DocCard title="Debucks, Store & Themes" icon="❋">
        <p style={pStyle}>
          Debucks are earned by winning matches (scaled by how many rounds you played) and from achievement
          rewards. Spend them in the Store on items, or on Themes — full color/font reskins of the whole app,
          equipped instantly.
        </p>
      </DocCard>

      <DocCard title="Achievements" icon="🏅">
        <p style={pStyle}>
          Achievements track things like total wins, win streaks, beating a specific debot, winning without using
          any item, or maxing out your item stock. Check your progress any time on the Achievements tab — some pay
          out debucks, and a few unlock exclusive themes.
        </p>
      </DocCard>

      <DocCard title="Online" icon="🌐">
        <p style={pStyle}>
          Random matchmaking pairs you against another player on an AI-generated topic; Friends lets you challenge
          someone directly and configure the rules yourself. Winning online matches (and not leaving mid-match)
          raises your Prestige — an Elo-style rating separate from your offline debucks/wins.
        </p>
      </DocCard>
    </div>
  );
}

/* AI TUTOR */

type ChatMsg = { role: "user" | "assistant"; text: string };

const TUTOR_SYSTEM_PROMPT = `You are the AI Tutor inside Debatto, a debate-practice game. You help players understand
argument structure (claim / warrant / impact), logical fallacies, and debate technique, and you can also explain
how the app itself works (HP, points, rounds, debots, items, debucks, achievements, online prestige) at a
high level. Keep answers short and conversational — a few sentences, occasionally a short example. If asked
something totally unrelated to debate or the app, gently redirect back to what you can help with. Never claim to
be a human or a licensed instructor.`;

function AiTutor() {
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
