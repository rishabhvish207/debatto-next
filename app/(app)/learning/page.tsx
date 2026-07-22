"use client";

// Learning — four sections:
//   Documentation    — argument structure, fallacies, technique (accordion + search)
//   Daily Challenge  — 10-question MCQ quiz, same for everyone, once a day
//   AI Tutor         — a chatbot grounded in the same material
//   Game Guide       — an in-app explainer for how Debatto itself works

import { useState } from "react";
import { Documentation } from "@/components/learning/Documentation";
import { DailyChallenge } from "@/components/learning/DailyChallenge";
import { AiTutor } from "@/components/learning/AiTutor";
import { GameGuide } from "@/components/learning/GameGuide";

type Section = "daily" | "docs" | "guide" | "tutor";

export default function LearningPage() {
  const [section, setSection] = useState<Section>("daily");

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 720, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 26, marginBottom: 4 }}>Learning</h2>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
        Argument theory, a daily quiz, a chatbot to talk it through with, and a guide to how Debatto itself works.
      </p>

      <div style={{ display: "flex", gap: 20, marginBottom: 20, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {([
          ["daily", "Daily Challenge"],
          ["docs", "Documentation"],
          ["guide", "Game Guide"],
          ["tutor", "AI Tutor"],
        ] as const).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "0 2px 12px", fontSize: 13, fontWeight: 700,
              letterSpacing: "0.02em", whiteSpace: "nowrap",
              color: section === s ? "var(--text)" : "var(--muted)",
              borderBottom: section === s ? "2px solid var(--blue)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "daily" && <DailyChallenge />}
      {section === "docs" && <Documentation />}
      {section === "guide" && <GameGuide />}
      {section === "tutor" && <AiTutor />}
    </div>
  );
}
