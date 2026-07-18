"use client";

import { useRouter } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { DebucksIcon } from "@/components/ui/DebucksIcon";

export function RightDrawer({ onClose }: { onClose: () => void }) {
  const { user, profile, signInWithGoogle, signOut, requestNavigation } = useGame();
  const router = useRouter();

  function go(href: string) {
    onClose();
    requestNavigation(() => router.push(href));
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="heading" style={{ fontSize: 16 }}>Menu</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>×</button>
        </div>

        {/* Profile — inline, no separate route needed for the basics */}
        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>
            {user ? "Logged in as" : "Playing as Guest"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {profile?.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--amber)", fontWeight: "bold", display: "flex", alignItems: "center", marginBottom: 10 }}>
            <DebucksIcon style={{ marginRight: 4 }} />{profile?.coins ?? 0}
          </div>
          {user ? (
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={signOut}>Logout</button>
          ) : (
            <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={signInWithGoogle}>Login to Google</button>
          )}
        </div>

        <button className="drawer-item" onClick={() => go("/profile")}>
          <span style={{ width: 20, textAlign: "center" }}>👤</span> Profile
        </button>
        <button className="drawer-item" onClick={() => go("/history")}>
          <span style={{ width: 20, textAlign: "center" }}>📜</span> Match History
        </button>
        <button className="drawer-item" onClick={() => go("/achievements")}>
          <span style={{ width: 20, textAlign: "center" }}>🏅</span> Achievements
        </button>
        <button className="drawer-item" onClick={() => go("/settings")}>
          <span style={{ width: 20, textAlign: "center" }}>⚙</span> Settings
        </button>
        {profile?.is_admin && (
          <button className="drawer-item" style={{ color: "var(--amber)" }} onClick={() => go("/admin")}>
            <span style={{ width: 20, textAlign: "center" }}>🛠</span> Admin
          </button>
        )}
      </div>
    </>
  );
}
