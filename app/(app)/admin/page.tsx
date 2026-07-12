"use client";

import { useGame } from "@/contexts/GameContext";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default function AdminPage() {
  const { profile } = useGame();
  return (
    <div style={{ padding: "20px 16px", maxWidth: 820, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 22, marginBottom: 8 }}>Admin</h2>
      {/* AdminPanel itself also checks profile.is_admin and renders nothing
          if false — this route being reachable at all isn't a security
          boundary, RLS on the underlying tables is. */}
      <AdminPanel profile={profile} />
    </div>
  );
}
