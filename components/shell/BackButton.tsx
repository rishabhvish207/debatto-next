"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { ConfirmModal } from "@/components/shell/ConfirmModal";

// Universal back button — lives in the (app) group layout, directly under
// TopBar, so it's in the same place on every in-app page instead of each
// page needing its own ad hoc "back" affordance. Uses browser history so
// it naturally respects wherever the user actually came from.
//
// If a match is in progress (battleActive, set by the offline game while
// page === "battle"), leaving would silently lose that match — so this
// intercepts and asks first, with a real styled modal instead of a native
// confirm() popup.
export function BackButton() {
  const router = useRouter();
  const { battleActive, setBattleActive } = useGame();
  const [confirming, setConfirming] = useState(false);

  function handleBack() {
    if (battleActive) {
      setConfirming(true);
      return;
    }
    router.back();
  }

  return (
    <>
      <div style={{ padding: "10px 16px 0" }}>
        <button className="btn btn-ghost btn-sm" onClick={handleBack}>← Back</button>
      </div>

      {confirming && (
        <ConfirmModal
          title="Leave this match?"
          message="You're in the middle of a debate. Going back now will lose your progress in this match."
          confirmLabel="Leave anyway"
          cancelLabel="Stay"
          onConfirm={() => { setBattleActive(false); setConfirming(false); router.back(); }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
