"use client";

// Another player's public profile — deliberately mirrors the STRUCTURE of
// our own /profile page (same avatar/name/username layout, same
// achievements card treatment) minus anything only meaningful to the
// owner (debucks, wins, editing controls). Rendered in THEIR equipped
// theme, scoped to just this page via CSS variables on a wrapper — if A
// views B's profile it shows B's theme, and vice versa, regardless of
// what the viewer has equipped.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";
import { AppIcon } from "@/components/ui/AppIcon";
import { displayName, tierColor } from "@/config/Achievements";

const supabase = createClient();

type PublicProfile = {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  equipped_theme_id: string | null;
  prestige: number;
  show_history_public: boolean;
};

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, themes, achievements } = useGame();

  const [target, setTarget] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendship, setFriendship] = useState<{ id: string; status: string; requesterId: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("public_profiles").select("*").eq("id", id).maybeSingle();
      if (error) console.error(error);
      setTarget(data as PublicProfile | null);

      if (data) {
        const { data: ua, error: uaError } = await supabase.from("user_achievements").select("achievement_id").eq("user_id", id);
        if (uaError) console.error(uaError);
        setUnlockedIds((ua || []).map((r: any) => r.achievement_id));
      }

      if (user && data && user.id !== id) {
        const { data: fs } = await supabase
          .from("friendships")
          .select("id, status, requester_id")
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`)
          .maybeSingle();
        setFriendship(fs ? { id: fs.id, status: fs.status, requesterId: fs.requester_id } : null);
      }

      if (data?.show_history_public) {
        const { data: matches } = await supabase
          .from("online_matches")
          .select("id, mode, result, player_a, player_b, created_at, completed_at")
          .or(`player_a.eq.${id},player_b.eq.${id}`)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(10);
        setHistory(matches || []);
      }
      setLoading(false);
    })();
  }, [id, user]);

  async function sendFriendRequest() {
    if (!user) return;
    setActionBusy(true);
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: id });
    setActionBusy(false);
    if (!error) setFriendship({ id: "", status: "pending", requesterId: user.id });
  }

  async function acceptFriendRequest() {
    if (!friendship) return;
    setActionBusy(true);
    await supabase.from("friendships").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", friendship.id);
    setFriendship({ ...friendship, status: "accepted" });
    setActionBusy(false);
  }

  if (loading) return <div style={{ padding: 24, color: "var(--muted)" }}>Loading…</div>;
  if (!target) return <div style={{ padding: 24, color: "var(--muted)" }}>Player not found.</div>;

  // Same fallback chain GameContext uses for the viewer's own equipped
  // theme — falls back to the free default rather than silently inheriting
  // whatever the VIEWER happens to have equipped if this player never set one.
  const theirTheme = themes.find((t) => t.id === target.equipped_theme_id && t.active) || themes.find((t) => t.isDefault) || null;
  const c = theirTheme?.colors;
  const themeVars: Record<string, string> = c
    ? {
        "--bg": c.bg, "--surface": c.surface, "--surface2": c.surface2,
        "--border": c.border, "--border2": c.border2, "--text": c.text, "--muted": c.muted, "--faint": c.faint,
        "--blue": c.blue, "--blue-soft": c.blueSoft, "--red": c.red, "--red-soft": c.redSoft,
        "--amber": c.amber, "--amber-soft": c.amberSoft, "--green": c.green, "--green-soft": c.greenSoft,
        "--purple": c.purple, "--teal": c.teal,
        "--font-heading": theirTheme!.fontHeading, "--font-body": theirTheme!.fontBody,
      }
    : {};

  const isSelf = user?.id === id;

  // Same "highest tier per group" summary /profile computes for the
  // viewer's own achievements, just built from the TARGET's unlocked ids.
  const achievementGroupSummary = (() => {
    const active = achievements.filter((a) => a.active);
    const groups = new Map<string, typeof active>();
    for (const a of active) {
      const key = a.groupKey || `__solo_${a.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    let unlockedGroups = 0;
    const badges: typeof active = [];
    for (const members of groups.values()) {
      const sorted = [...members].sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1));
      let highest: (typeof active)[number] | null = null;
      for (const m of sorted) {
        if (unlockedIds.includes(m.id)) highest = m;
      }
      if (highest) { unlockedGroups += 1; badges.push(highest); }
    }
    return { unlockedGroups, totalGroups: groups.size, badges: badges.slice(0, 12) };
  })();

  return (
    <div style={{ ...themeVars, background: "var(--bg)", minHeight: "100vh" } as React.CSSProperties}>
      <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
        <h2 className="heading" style={{ fontSize: 26, marginBottom: 20 }}>Profile</h2>

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                width: 76, height: 76, borderRadius: "50%", overflow: "hidden",
                border: "2px solid var(--border)", background: "var(--surface2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {target.avatar_url ? (
                  <img src={target.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 24, color: "var(--muted)" }}>{(target.name || "?")[0]?.toUpperCase()}</span>
                )}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {target.name}
              </div>
              {target.username && <div style={{ fontSize: 12, color: "var(--blue)" }}>@{target.username}</div>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Prestige</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{target.prestige}</div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Bio</div>
            <div style={{ fontSize: 13, color: target.bio ? "var(--text)" : "var(--muted)", lineHeight: 1.5 }}>
              {target.bio || "No bio yet."}
            </div>
          </div>
        </div>

        {!isSelf && user && (
          <div style={{ marginBottom: 16 }}>
            {!friendship && <button className="btn btn-primary btn-sm" disabled={actionBusy} onClick={sendFriendRequest}>Add Friend</button>}
            {friendship?.status === "pending" && friendship.requesterId === user.id && (
              <button className="btn btn-ghost btn-sm" disabled>Request Sent</button>
            )}
            {friendship?.status === "pending" && friendship.requesterId !== user.id && (
              <button className="btn btn-primary btn-sm" disabled={actionBusy} onClick={acceptFriendRequest}>Accept Friend Request</button>
            )}
            {friendship?.status === "accepted" && <span style={{ fontSize: 12, color: "var(--muted)" }}>Friends</span>}
          </div>
        )}

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "flex" }}><AppIcon token="🏅" size={20} style={{ color: "var(--amber)" }} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Achievements</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {achievementGroupSummary.unlockedGroups} unlocked
                {achievementGroupSummary.totalGroups ? ` / ${achievementGroupSummary.totalGroups}` : ""}
              </div>
            </div>
          </div>
          {achievementGroupSummary.badges.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {achievementGroupSummary.badges.map((b) => (
                <div
                  key={b.id}
                  title={displayName(b)}
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: `${tierColor(b.tier)}33`, border: `1.5px solid ${tierColor(b.tier)}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                  }}
                >
                  {b.icon}
                </div>
              ))}
            </div>
          )}
        </div>

        {target.show_history_public && (
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Recent Online Matches</div>
            {history.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No completed online matches yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {history.map((m: any) => {
                  const isA = m.player_a === target.id;
                  const won = (m.result === "a_win") === isA;
                  return (
                    <div key={m.id} className="card" style={{ padding: 10, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>{m.mode === "friend" ? "Friend match" : "Random match"}</span>
                      <span style={{ color: m.result === "draw" ? "var(--muted)" : won ? "var(--blue)" : "var(--red)" }}>
                        {m.result === "draw" ? "Draw" : won ? "Won" : "Lost"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
