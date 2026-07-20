"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { hasCompletedToday } from "@/lib/dailyChallengeStatus";

export function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { user, signInWithGoogle, requestNavigation } = useGame();
  const router = useRouter();

  // null while we haven't checked yet — kept hidden until we actually know,
  // rather than flashing on then off.
  const [dailyDone, setDailyDone] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasCompletedToday(user).then((done) => { if (!cancelled) setDailyDone(done); });
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="app-topbar">
      <button
        onClick={() => requestNavigation(() => router.push("/"))}
        className="heading"
        style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text)" }}
      >
        <span style={{ color: "var(--blue)" }}>Deb</span>atto
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {dailyDone === false && (
          <button
            onClick={() => requestNavigation(() => router.push("/learning"))}
            className="btn btn-ghost btn-sm"
            title="Today's Daily Challenge isn't done yet"
            style={{ position: "relative", display: "flex", alignItems: "center", gap: 5 }}
          >
            <span style={{ fontSize: 15 }}>🧩</span>
            <span
              style={{
                position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%",
                background: "var(--amber)", boxShadow: "0 0 0 2px var(--surface)",
              }}
            />
          </button>
        )}
        {!user && (
          <button className="btn btn-ghost btn-sm" onClick={signInWithGoogle}>Log in</button>
        )}
        <button className="topbar-dots" onClick={onOpenDrawer} aria-label="Open menu">⋮</button>
      </div>
    </div>
  );
}
