"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { hasPendingNotifications } from "@/lib/notificationsBadge";
import { AppIcon } from "@/components/ui/AppIcon";

// How often to re-check for something notification-worthy while the app is
// open. Nothing here is real-time-pushed (no Supabase Realtime subscription
// for friend requests/invites at the badge level) — a friendly, cheap
// polling interval is the honest middle ground between "never updates
// without a refresh" and building a full Realtime channel just for a dot.
const POLL_MS = 45_000;

export function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { user, signInWithGoogle, requestNavigation } = useGame();
  const router = useRouter();

  // null while we haven't checked yet — kept hidden until we actually know,
  // rather than flashing on then off.
  const [hasNotif, setHasNotif] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    function check() {
      hasPendingNotifications(user).then((v) => { if (!cancelled) setHasNotif(v); });
    }
    check();
    const id = setInterval(check, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
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
        <button
          onClick={() => requestNavigation(() => router.push("/notifications"))}
          className="btn btn-ghost btn-sm"
          aria-label="Notifications"
          title="Notifications"
          style={{ position: "relative", display: "flex", alignItems: "center", padding: "6px 8px" }}
        >
          <AppIcon token="🔔" size={16} />
          {hasNotif && (
            <span
              style={{
                position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%",
                background: "var(--amber)", boxShadow: "0 0 0 2px var(--surface)",
              }}
            />
          )}
        </button>
        {!user && (
          <button className="btn btn-ghost btn-sm" onClick={signInWithGoogle}>Log in</button>
        )}
        <button className="topbar-dots" onClick={onOpenDrawer} aria-label="Open menu">⋮</button>
      </div>
    </div>
  );
}
