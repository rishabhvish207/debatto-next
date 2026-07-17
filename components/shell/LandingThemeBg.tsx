"use client";

// The landing page's own background image (set in Admin → Settings) is
// server-rendered directly into the page, since it needs to show correctly
// even for a signed-out visitor with no session at all. This component only
// handles the override case: if the current visitor (guest or signed-in)
// has a theme equipped with its own background image, that takes priority
// — same rule as the (app) shell.
//
// It works by hiding the server-rendered layer (targeted by id) and
// drawing its own on top once mounted, rather than trying to pass
// server-side theme state into an async Server Component.

import { useGame } from "@/contexts/GameContext";

export function LandingThemeBg() {
  const { equippedTheme } = useGame();
  const url = equippedTheme?.backgroundImageUrl;
  if (!url) return null;

  return (
    <>
      <style>{`#landing-admin-bg { display: none; }`}</style>
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: equippedTheme?.backgroundOpacity ?? 0.16,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
