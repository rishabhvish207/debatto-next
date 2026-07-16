import React from "react";

// Shown during the player's turn so purchased consumables (Ace Cards,
// Confidence Pills) can actually be spent mid-match. Deliberately separate
// from InputPanel's lifelines row — those are per-round abilities (Hint),
// this is inventory the player stocked up on in the Store beforehand.
export function ItemsBar({ aceCards, confidencePills, onUseAce, onUseConfidence, disabled }: {
  aceCards: number;
  confidencePills: number;
  onUseAce: () => void;
  onUseConfidence: () => void;
  disabled?: boolean;
}) {
  const empty = aceCards <= 0 && confidencePills <= 0;

  return (
    <div className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Items
      </span>

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

      {empty && (
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          Buy items in the Store
        </span>
      )}
    </div>
  );
}
