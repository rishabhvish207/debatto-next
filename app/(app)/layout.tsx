"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { TopBar } from "@/components/shell/TopBar";
import { RightDrawer } from "@/components/shell/RightDrawer";
import { ConfirmModal } from "@/components/shell/ConfirmModal";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { apiError, setApiError, pendingNavAction, confirmNavigation, cancelNavigation, siteBg } = useGame();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const showSiteBg = siteBg.applyEverywhere && !!siteBg.url;

  return (
    <div>
      {showSiteBg && (
        <>
          {/* Every page in this group wraps its content in a `.root` div
              with its own opaque background — transparent it out here so
              the fixed layers below (solid fill + image) can show through,
              same look as the landing page's own background. */}
          <style>{`.root { background: transparent !important; }`}</style>
          <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -2, background: "var(--bg)" }} />
          <div
            aria-hidden
            style={{
              position: "fixed", inset: 0, zIndex: -1,
              backgroundImage: `url(${siteBg.url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
              opacity: siteBg.opacity,
            }}
          />
        </>
      )}

      <TopBar onOpenDrawer={() => setDrawerOpen(true)} />
      {drawerOpen && <RightDrawer onClose={() => setDrawerOpen(false)} />}

      {apiError && (
        <div style={{
          background: "var(--red-soft)", color: "var(--red)", padding: 12, borderRadius: 8,
          fontSize: 13, border: "1px solid var(--red)", display: "flex", justifyContent: "space-between",
          margin: "12px 16px 0",
        }}>
          <span>⚠ {apiError}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setApiError("")}>Dismiss</button>
        </div>
      )}

      {children}

      {pendingNavAction && (
        <ConfirmModal
          title="Exit this match?"
          message="Leaving now will end the debate and lose your progress in this round."
          confirmLabel="Exit anyway"
          cancelLabel="Stay"
          onConfirm={confirmNavigation}
          onCancel={cancelNavigation}
        />
      )}
    </div>
  );
}
