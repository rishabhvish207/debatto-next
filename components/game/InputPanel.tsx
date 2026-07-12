import React from "react";

export function InputPanel({
  input, setInput, onSend, isEvaluating,
  onHint, hintsLeft,
  onAns, ansCost, ansUsed = 0, maxAnsUses = 5, coins,
  curSide = "", round = 1, rounds = 10,
  textRef
}: any) {
  const canSubmit = input.trim().length > 8 && !isEvaluating;
  const ansLeft = maxAnsUses - ansUsed;

  return (
    <div className="card" style={{ padding: 14 }}>

      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 8
      }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {curSide ? `You: ${curSide} · ` : ""}Round {round}/{rounds}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{input.length} chars</span>
      </div>

      {/* Textarea */}
      <textarea
        ref={textRef}
        className="textarea"
        rows={4}
        value={input}
        onChange={(e: any) => setInput(e.target.value)}
        placeholder="Rebut the opponent's argument directly. Precision scores higher than length."
        disabled={isEvaluating}
        onKeyDown={(e: any) => { if (e.ctrlKey && e.key === "Enter") onSend(); }}
        style={{ marginBottom: 10 }}
      />

      {/* Action row */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 8
      }}>

        {/* Lifelines */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-amber btn-sm"
            disabled={hintsLeft <= 0 || isEvaluating}
            onClick={onHint}
          >
            💡 Hint ({hintsLeft})
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={ansLeft <= 0 || coins < ansCost || isEvaluating}
            onClick={onAns}
          >
            ✦ Show Answer · ❋{ansCost} ({ansLeft} left)
          </button>
        </div>

        {/* Submit */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Ctrl + ↵</span>
          <button
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={onSend}
          >
            Submit →
          </button>
        </div>

      </div>
    </div>
  );
}
