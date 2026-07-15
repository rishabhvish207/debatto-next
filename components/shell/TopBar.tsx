"use client";

import Link from "next/link";
import { useGame } from "@/contexts/GameContext";

export function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { user, signInWithGoogle } = useGame();

  return (
    <div className="app-topbar">
      <Link href="/hub" className="heading" style={{ fontSize: 18, textDecoration: "none", color: "var(--text)" }}>
        <span style={{ color: "var(--blue)" }}>Deb</span>atto
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!user && (
          <button className="btn btn-ghost btn-sm" onClick={signInWithGoogle}>Log in</button>
        )}
        <button className="topbar-dots" onClick={onOpenDrawer} aria-label="Open menu">⋮</button>
      </div>
    </div>
  );
}
