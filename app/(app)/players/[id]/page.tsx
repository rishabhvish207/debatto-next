"use client";

// Another player's public profile — name/username/bio/prestige, rendered
// in THEIR equipped theme (scoped to this page only, via CSS variables on
// a wrapper div — the rest of the app keeps using the viewer's own theme),
// with a friend-request button and (if they've opted in via
// show_history_public) a light online match history.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";

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
  const { user, themes } = useGame();

  const [target, setTarget] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendship, setFriendship] = useState<{ id: string; status: string; requesterId: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("public_profiles").select("*").eq("id", id).maybeSingle();
      if (error) console.error(error);
      setTarget(data as PublicProfile | null);

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

  const theirTheme = themes.find((t) => t.id === target.equipped_theme_id && t.active);
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

  return (
    <div className="root" style={{ ...themeVars, background: "var(--bg)", minHeight: "100vh", padding: "24px 16px" } as React.CSSProperties}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="card" style={{ padding: 20, textAlign: "center", marginBottom: 16 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", margin: "0 auto 12px", overflow: "hidden",
            background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "var(--muted)",
          }}>
            {target.avatar_url ? <img src={target.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : target.name?.[0]?.toUpperCase()}
          </div>
          <div className="heading" style={{ fontSize: 20 }}>{target.name}</div>
          {target.username && <div style={{ fontSize: 13, color: "var(--blue)", marginBottom: 8 }}>@{target.username}</div>}
          {target.bio && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>{target.bio}</div>}
          <div className="badge" style={{ background: "var(--amber-soft)", color: "var(--amber)", display: "inline-block" }}>Prestige {target.prestige}</div>

          {!isSelf && user && (
            <div style={{ marginTop: 14 }}>
              {!friendship && (
                <button className="btn btn-primary btn-sm" disabled={actionBusy} onClick={sendFriendRequest}>Add Friend</button>
              )}
              {friendship?.status === "pending" && friendship.requesterId === user.id && (
                <button className="btn btn-ghost btn-sm" disabled>Request Sent</button>
              )}
              {friendship?.status === "pending" && friendship.requesterId !== user.id && (
                <button className="btn btn-primary btn-sm" disabled={actionBusy} onClick={acceptFriendRequest}>Accept Friend Request</button>
              )}
              {friendship?.status === "accepted" && (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Friends</span>
              )}
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
