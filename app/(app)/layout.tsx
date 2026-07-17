"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { TopBar } from "@/components/shell/TopBar";
import { RightDrawer } from "@/components/shell/RightDrawer";
import { ConfirmModal } from "@/components/shell/ConfirmModal";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { apiError, setApiError, pendingNavAction, confirmNavigation, cancelNavigation, siteBg, equippedTheme } = useGame();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A theme's own custom Google Font (if it has one) is loaded on demand
  // rather than baked into Debatto.css, since only a handful of themes will
  // ever be equipped at once and most people will never touch this.
  useEffect(() => {
    const href = equippedTheme?.googleFontUrl;
    if (!href) return;
    const id = "theme-google-font";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [equippedTheme?.googleFontUrl]);

  // A theme's own background image takes priority over the admin's
  // site-wide background — a themed look shouldn't get overridden by
  // whatever's configured in Admin → Settings.
  const themeBgUrl = equippedTheme?.backgroundImageUrl || null;
  const bgUrl = themeBgUrl || (siteBg.applyEverywhere ? siteBg.url : null);
  const bgOpacity = themeBgUrl ? (equippedTheme?.backgroundOpacity ?? 0.16) : siteBg.opacity;
  const showBg = !!bgUrl;

  const c = equippedTheme?.colors;
  const themeVarsCss = c
    ? `:root{--bg:${c.bg};--surface:${c.surface};--surface2:${c.surface2};` +
      `--border:${c.border};--border2:${c.border2};--text:${c.text};--muted:${c.muted};--faint:${c.faint};` +
      `--blue:${c.blue};--blue-soft:${c.blueSoft};--red:${c.red};--red-soft:${c.redSoft};` +
      `--amber:${c.amber};--amber-soft:${c.amberSoft};--green:${c.green};--green-soft:${c.greenSoft};` +
      `--purple:${c.purple};--teal:${c.teal};` +
      `--font-heading:${equippedTheme!.fontHeading};--font-body:${equippedTheme!.fontBody};}`
    : "";

  return (
    <div>
      {themeVarsCss && <style>{themeVarsCss}</style>}

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
