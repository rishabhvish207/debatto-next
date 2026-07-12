"use client";

import Link from "next/link";

export function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <div className="app-topbar">
      <Link href="/hub" className="heading" style={{ fontSize: 18, textDecoration: "none", color: "var(--text)" }}>
        <span style={{ color: "var(--blue)" }}>Deb</span>atto
      </Link>
      <button className="topbar-dots" onClick={onOpenDrawer} aria-label="Open menu">⋮</button>
    </div>
  );
}
