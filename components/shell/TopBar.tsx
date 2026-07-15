"use client";

import { useRouter } from "next/navigation";
import { useGame } from "@/contexts/GameContext";

export function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { user, signInWithGoogle, requestNavigation } = useGame();
  const router = useRouter();

  return (
    <div className="app-topbar">
      <button
        onClick={() => requestNavigation(() => router.push("/hub"))}
        className="heading"
        style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text)" }}
      >
        <span style={{ color: "var(--blue)" }}>Deb</span>atto
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!user && (
          <button className="btn btn-ghost btn-sm" onClick={signInWithGoogle}>Log in</button>
        )}
        <button className="topbar-dots" onClick={onOpenDrawer} aria-label="Open menu">⋮</button>
      </div>
    </div>
  );
}
