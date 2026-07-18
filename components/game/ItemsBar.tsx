import React from "react";

// Shown during the player's turn so purchased items can actually be used
// mid-match. Insight (formerly the "Hint" lifeline) lives here now too —
// it's unlimited-use once the Insight Lens is owned from the Store, same
// spyglass icon as the Store listing, so the two are visibly the same item.
export function ItemsBar({
  hasInsightLens, insightActive, onUseInsight,
  aceCards, confidencePills, revivalShots, onUseAce, onUseConfidence, onUseRevival,
  disabled,
}: {
  hasInsightLens: boolean;
  insightActive?: boolean;
  onUseInsight: () => void;
  aceCards: number;
  confidencePills: number;
  revivalShots: number;
  onUseAce: () => void;
  onUseConfidence: () => void;
  onUseRevival: () => void;
  disabled?: boolean;
}) {
  const empty = aceCards <= 0 && confidencePills <= 0 && revivalShots <= 0 && !hasInsightLens;

  return (
    <div className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Items
      </span>

      <button
        className={`btn btn-sm ${insightActive ? "btn-amber" : "btn-ghost"}`}
        disabled={disabled || !hasInsightLens}
        onClick={onUseInsight}
        title={hasInsightLens ? "Analyse the opponent's argument for weak points" : "Buy the Insight Lens in the Store to unlock this"}
      >
        {hasInsightLens ? "🔍 Insight" : "🔍 Insight 🔒"}
      </button>

      <button
        className="btn btn-ghost btn-sm"
        disabled={disabled || aceCards <= 0}
        onClick={onUseAce}
        title="Reveal 3 suggested responses"
      >
        🂡 Ace Card ({aceCards})
      </button>

      <button
        className="btn btn-ghost btn-sm"
        disabled={disabled || confidencePills <= 0}
        onClick={onUseConfidence}
        title="Restore +10 HP"
      >
        💊 Confidence Pill ({confidencePills})
      </button>

      <button
        className="btn btn-ghost btn-sm"
        disabled={disabled || revivalShots <= 0}
        onClick={onUseRevival}
        title="Restore HP to full"
      >
        ⚡ Revival Shot ({revivalShots})
      </button>

      {empty && (
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          Buy items in the Store
        </span>
      )}
    </div>
  );
}
