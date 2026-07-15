"use client";

import Link from "next/link";
import { useGame } from "@/contexts/GameContext";
import { DebucksIcon } from "@/components/ui/DebucksIcon";

export function RightDrawer({ onClose }: { onClose: () => void }) {
  const { user, profile, signInWithGoogle, signOut } = useGame();

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

        <Link href="/profile" className="drawer-item" onClick={onClose}>
          <span style={{ width: 20, textAlign: "center" }}>👤</span> Profile
        </Link>
        <Link href="/history" className="drawer-item" onClick={onClose}>
          <span style={{ width: 20, textAlign: "center" }}>📜</span> Match History
        </Link>
        <Link href="/settings" className="drawer-item" onClick={onClose}>
          <span style={{ width: 20, textAlign: "center" }}>⚙</span> Settings
        </Link>
        {profile?.is_admin && (
          <Link href="/admin" className="drawer-item" style={{ color: "var(--amber)" }} onClick={onClose}>
            <span style={{ width: 20, textAlign: "center" }}>🛠</span> Admin
          </Link>
        )}
      </div>
    </>
  );
}
