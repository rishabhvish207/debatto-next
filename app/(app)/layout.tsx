"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { TopBar } from "@/components/shell/TopBar";
import { RightDrawer } from "@/components/shell/RightDrawer";
import { ConfirmModal } from "@/components/shell/ConfirmModal";
import { AppIcon } from "@/components/ui/AppIcon";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { apiError, setApiError, pendingNavAction, confirmNavigation, cancelNavigation, navGuardMessage, siteBg, equippedTheme } = useGame();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A theme's own background image takes priority over the admin's
  // site-wide background — a themed look shouldn't get overridden by
  // whatever's configured in Admin → Settings. (Colors/fonts are applied
  // globally by <ThemeApplier /> in the root layout, not here.)
  const themeBgUrl = equippedTheme?.backgroundImageUrl || null;
  const bgUrl = themeBgUrl || (siteBg.applyEverywhere ? siteBg.url : null);
  const bgOpacity = themeBgUrl ? (equippedTheme?.backgroundOpacity ?? 0.16) : siteBg.opacity;
  const showBg = !!bgUrl;

  return (
    <div>
      {showBg && (
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
              backgroundImage: `url(${bgUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
              opacity: bgOpacity,
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
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><AppIcon token="⚠" size={14} /> {apiError}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setApiError("")}>Dismiss</button>
        </div>
      )}

      {children}

      {pendingNavAction && (
        <ConfirmModal
          title={navGuardMessage.title}
          message={navGuardMessage.message}
          confirmLabel="Exit anyway"
          cancelLabel="Stay"
          onConfirm={confirmNavigation}
          onCancel={cancelNavigation}
        />
      )}
    </div>
  );
}
