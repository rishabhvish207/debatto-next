"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { TopBar } from "@/components/shell/TopBar";
import { RightDrawer } from "@/components/shell/RightDrawer";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { apiError, setApiError } = useGame();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div>
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
    </div>
  );
}
