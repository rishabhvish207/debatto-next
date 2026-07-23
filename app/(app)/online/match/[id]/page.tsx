"use client";

// Placeholder landing spot once a Friend Match invite is accepted and
// online_matches actually has a row — proves the invite → match pipeline
// works end-to-end. The live two-human arena (round input, PvP judge
// scoring, item-use notifications) is its own follow-up phase; this page
// intentionally does not try to be that yet.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useGame } from "@/contexts/GameContext";

const supabase = createClient();

const ITEM_LABELS: Record<string, string> = {
  insight_lens: "Insight Lens",
  ace_card: "Ace Card",
  confidence_pill: "Confidence Pill",
  revival_shot: "Revival Shot",
};

export default function OnlineMatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useGame();
  const [match, setMatch] = useState<any>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("online_matches").select("*").eq("id", id).maybeSingle();
      if (data) {
        setMatch(data);
        const { data: profs } = await supabase.from("profiles").select("id, name, username").in("id", [data.player_a, data.player_b]);
        setNames(Object.fromEntries((profs || []).map((p: any) => [p.id, p.username ? `@${p.username}` : p.name])));
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div style={{ padding: 24, color: "var(--muted)" }}>Loading…</div>;
  if (!match) return <div style={{ padding: 24, color: "var(--muted)" }}>Match not found.</div>;

  const itemEntries = Object.entries(match.allowed_items || {}).filter(([, c]) => (c as number) > 0);
  const iAmA = match.player_a === user?.id;

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 22, marginBottom: 4 }}>Friend Match</h2>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
        The live arena for two-human matches isn't built yet — this confirms the invite went through correctly.
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          {names[match.player_a] || "Host"} vs {names[match.player_b] || "…"}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>"{match.topic_text}"</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{match.rounds_total} rounds · {iAmA ? "you go first" : `${names[match.first_arguer] || "host"} goes first`}</div>
        {itemEntries.length > 0 && (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Items: {itemEntries.map(([k, c]) => `${c}× ${ITEM_LABELS[k] || k}`).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
