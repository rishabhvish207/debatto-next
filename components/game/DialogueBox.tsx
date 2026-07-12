import React from "react";
import { WeakText } from "./WeakText";

export function DialogueBox({ history, oppArg, phase, oppName, showHint, hintData }: any) {
  // Only show the last history entry (previous round's exchange) if it exists
  const lastEntry = history?.length > 0 ? history[history.length - 1] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Previous round recap — compact, faded */}
      {lastEntry && phase === "player-turn" && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 8,
          background: "var(--faint)",
          border: "1px solid var(--border)",
          opacity: 0.7,
        }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>
            Round {lastEntry.round} recap
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>{oppName}: </span>
            {lastEntry.oppArg?.slice(0, 120)}{lastEntry.oppArg?.length > 120 ? "…" : ""}
          </div>
        </div>
      )}

      {/* Current opponent argument */}
      {oppArg && (
        <div className="card anim-fade-up" style={{
          padding: 16,
          borderLeft: `3px solid var(--blue)`,
        }}>
          <div style={{
            fontSize: 11, color: "var(--muted)",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>{oppName} argues</span>
            {phase === "opponent-scored" && (
              <span style={{ color: "var(--red)", fontWeight: 700 }}>Counter-Attack!</span>
            )}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.78, color: "var(--text)" }}>
            {showHint && hintData
              ? <WeakText text={oppArg} weakPoints={hintData?.weak_points} fallacies={hintData?.fallacies} />
              : oppArg}
          </p>
        </div>
      )}

    </div>
  );
}
