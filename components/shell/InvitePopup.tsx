"use client";

// Global "you've been challenged" toast — reads GameContext's
// `incomingInvite` (set either from a one-time fetch on login or a live
// Realtime INSERT — see contexts/GameContext.tsx) and shows the host's
// configured rounds/items/topic before the invitee commits to anything.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";
import { respondToInvite } from "@/lib/matchInvites";
import { AppIcon } from "@/components/ui/AppIcon";

const supabase = createClient();

const ITEM_LABELS: Record<string, string> = {
  insight_lens: "Insight Lens",
  ace_card: "Ace Card",
  confidence_pill: "Confidence Pill",
  revival_shot: "Revival Shot",
};

export function InvitePopup() {
  const { incomingInvite, setIncomingInvite, onlineUserIds } = useGame();
  const router = useRouter();
  const [hostName, setHostName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!incomingInvite) return;
    supabase.from("public_profiles").select("name, username").eq("id", incomingInvite.host_id).maybeSingle()
      .then(({ data }) => setHostName(data?.username ? `@${data.username}` : data?.name || "A friend"));
  }, [incomingInvite?.id]);

  if (!incomingInvite) return null;

  const itemEntries = Object.entries(incomingInvite.allowed_items || {}).filter(([, count]) => (count as number) > 0);

  async function respond(accept: boolean) {
    if (!incomingInvite) return;
    setBusy(true);
    const result = await respondToInvite(incomingInvite, accept, onlineUserIds);
    setBusy(false);
    setIncomingInvite(null);
    if (accept && result.ok && result.matchId) router.push(`/online/match/${result.matchId}`);
  }

  return (
    <div
      style={{
        position: "fixed", top: 12, left: 12, right: 12, zIndex: 200,
        maxWidth: 420, margin: "0 auto",
      }}
    >
      <div className="card" style={{ padding: 16, border: "1.5px solid var(--blue)", boxShadow: "0 8px 24px -8px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <AppIcon token="🤝" size={16} style={{ color: "var(--blue)" }} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>{hostName || "A friend"} challenged you to a Friend Match</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>"{incomingInvite.topic_text}"</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
          {incomingInvite.rounds_total} rounds
          {itemEntries.length > 0 && (
            <> · {itemEntries.map(([key, count]) => `${count}× ${ITEM_LABELS[key] || key}`).join(", ")}</>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => respond(true)} style={{ flex: 1 }}>Accept</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => respond(false)} style={{ flex: 1 }}>Decline</button>
        </div>
      </div>
    </div>
  );
}
