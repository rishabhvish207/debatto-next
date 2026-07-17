"use client";

// Mounted once in the ROOT layout (not just the (app) group), so the
// equipped theme's colors and fonts apply everywhere — including the
// pre-login landing page, since GameProvider already wraps the whole app
// from the root layout down.
//
// Background images are a separate story: the landing page and the (app)
// shell each render their own background layer server/client-side, so
// theme-bg priority is handled locally in each of those (see
// LandingThemeBg.tsx and (app)/layout.tsx) rather than here.

import { useEffect } from "react";
import { useGame } from "@/contexts/GameContext";

export function ThemeApplier() {
  const { equippedTheme } = useGame();

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

  const c = equippedTheme?.colors;
  const themeVarsCss = c
    ? `:root{--bg:${c.bg};--surface:${c.surface};--surface2:${c.surface2};` +
      `--border:${c.border};--border2:${c.border2};--text:${c.text};--muted:${c.muted};--faint:${c.faint};` +
      `--blue:${c.blue};--blue-soft:${c.blueSoft};--red:${c.red};--red-soft:${c.redSoft};` +
      `--amber:${c.amber};--amber-soft:${c.amberSoft};--green:${c.green};--green-soft:${c.greenSoft};` +
      `--purple:${c.purple};--teal:${c.teal};` +
      `--font-heading:${equippedTheme!.fontHeading};--font-body:${equippedTheme!.fontBody};}`
    : "";

  if (!themeVarsCss) return null;
  return <style>{themeVarsCss}</style>;
}
