"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";
import { expireStaleInvites, finalizeInviteIntoMatch, respondToInvite, type MatchInvite } from "@/lib/matchInvites";

const supabase = createClient();

const ITEM_LABELS: Record<string, string> = {
  insight_lens: "Insight Lens",
  ace_card: "Ace Card",
  confidence_pill: "Confidence Pill",
  revival_shot: "Revival Shot",
};

type ProfileLite = { id: string; name: string; username: string | null };
type FriendRequestRow = { id: string; requester_id: string; other: ProfileLite | undefined };

export default function NotificationsPage() {
  const { user, onlineUserIds } = useGame();
  const router = useRouter();

  const [friendRequests, setFriendRequests] = useState<FriendRequestRow[]>([]);
  const [incoming, setIncoming] = useState<MatchInvite[]>([]);
  const [outgoing, setOutgoing] = useState<MatchInvite[]>([]);
  const [people, setPeople] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    await expireStaleInvites();

    const [{ data: reqs }, { data: inv }] = await Promise.all([
      supabase.from("friendships").select("id, requester_id").eq("addressee_id", user.id).eq("status", "pending"),
      supabase.from("match_invites").select("*").or(`invitee_id.eq.${user.id},host_id.eq.${user.id}`).order("created_at", { ascending: false }),
    ]);

    const allInvites = (inv || []) as MatchInvite[];
    const mine = allInvites.filter((i) => i.invitee_id === user.id && !i.invitee_dismissed);
    const sent = allInvites.filter((i) => i.host_id === user.id && !i.host_dismissed);

    const otherIds = Array.from(new Set([
      ...(reqs || []).map((r: any) => r.requester_id),
      ...mine.map((i) => i.host_id),
      ...sent.map((i) => i.invitee_id),
    ]));
    let peopleMap: Record<string, ProfileLite> = {};
    if (otherIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, name, username").in("id", otherIds);
      peopleMap = Object.fromEntries((profs || []).map((p: any) => [p.id, p]));
    }

    setPeople(peopleMap);
    setFriendRequests((reqs || []).map((r: any) => ({ id: r.id, requester_id: r.requester_id, other: peopleMap[r.requester_id] })));
    setIncoming(mine);
    setOutgoing(sent);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [user]);

  // If I'm the invitee and already accepted (waiting on the host), and the
  // host has since come online, pull us both into the match automatically —
  // the whole point of accepting-while-host-is-offline instead of just
  // failing outright.
  useEffect(() => {
    const waiting = incoming.find((i) => i.status === "accepted" && !i.match_id && onlineUserIds.has(i.host_id));
    if (waiting) {
      finalizeInviteIntoMatch(waiting).then((res) => {
        if (res.ok && res.matchId) router.push(`/online/match/${res.matchId}`);
      });
    }
  }, [onlineUserIds, incoming]);

  async function acceptFriendRequest(id: string) {
    setBusyId(id);
    await supabase.from("friendships").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", id);
    setBusyId(null);
    refresh();
  }
  async function declineFriendRequest(id: string) {
    setBusyId(id);
    await supabase.from("friendships").delete().eq("id", id);
    setBusyId(null);
    refresh();
  }

  async function respond(invite: MatchInvite, accept: boolean) {
    setBusyId(invite.id);
    const result = await respondToInvite(invite, accept, onlineUserIds);
    setBusyId(null);
    if (accept && result.ok && result.matchId) { router.push(`/online/match/${result.matchId}`); return; }
    refresh();
  }

  async function cancelInvite(id: string) {
    setBusyId(id);
    await supabase.from("match_invites").update({ status: "cancelled" }).eq("id", id);
    setBusyId(null);
    refresh();
  }

  async function dismiss(invite: MatchInvite, asHost: boolean) {
    await supabase.from("match_invites").update(asHost ? { host_dismissed: true } : { invitee_dismissed: true }).eq("id", invite.id);
    refresh();
  }

  function inviteStatusLabel(i: MatchInvite): { text: string; color: string } {
    switch (i.status) {
      case "pending": return { text: "Awaiting response", color: "var(--muted)" };
      case "accepted": return i.match_id ? { text: "Match ready", color: "var(--blue)" } : { text: "Accepted — waiting for host to come online", color: "var(--amber)" };
      case "declined": return { text: "Declined", color: "var(--red)" };
      case "expired": return { text: "Expired", color: "var(--muted)" };
      case "cancelled": return { text: "Cancelled", color: "var(--muted)" };
      default: return { text: i.status, color: "var(--muted)" };
    }
  }

  if (!user) {
    return <div style={{ padding: 24, color: "var(--muted)", textAlign: "center" }}>Log in to see your notifications.</div>;
  }

  const isEmpty = !loading && friendRequests.length === 0 && incoming.length === 0 && outgoing.length === 0;

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 22, marginBottom: 16 }}>Notifications</h2>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : isEmpty ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing here right now.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {friendRequests.length > 0 && (
            <Section title="Friend requests">
              {friendRequests.map((r) => (
                <div key={r.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 13 }}>@{r.other?.username || "unknown"} wants to be friends</div>
                  <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => acceptFriendRequest(r.id)}>Accept</button>
                  <button className="btn btn-ghost btn-sm" disabled={busyId === r.id} onClick={() => declineFriendRequest(r.id)}>Decline</button>
                </div>
              ))}
            </Section>
          )}

          {incoming.length > 0 && (
            <Section title="Match invites">
              {incoming.map((i) => {
                const host = people[i.host_id];
                const { text, color } = inviteStatusLabel(i);
                const itemEntries = Object.entries(i.allowed_items || {}).filter(([, c]) => (c as number) > 0);
                return (
                  <div key={i.id} className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>@{host?.username || "unknown"} challenged you</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>"{i.topic_text}" · {i.rounds_total} rounds</div>
                    {itemEntries.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
                        {itemEntries.map(([k, c]) => `${c}× ${ITEM_LABELS[k] || k}`).join(", ")}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color, marginBottom: 8 }}>{text}</div>
                    {i.status === "pending" ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary btn-sm" disabled={busyId === i.id} onClick={() => respond(i, true)}>Accept</button>
                        <button className="btn btn-ghost btn-sm" disabled={busyId === i.id} onClick={() => respond(i, false)}>Decline</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => dismiss(i, false)}>Dismiss</button>
                    )}
                  </div>
                );
              })}
            </Section>
          )}

          {outgoing.length > 0 && (
            <Section title="Sent invites">
              {outgoing.map((i) => {
                const invitee = people[i.invitee_id];
                const { text, color } = inviteStatusLabel(i);
                return (
                  <div key={i.id} className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>@{invitee?.username || "unknown"}</div>
                      <div style={{ fontSize: 11, color }}>{text}</div>
                    </div>
                    {i.status === "pending" ? (
                      <button className="btn btn-ghost btn-sm" disabled={busyId === i.id} onClick={() => cancelInvite(i.id)}>Cancel</button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => dismiss(i, true)}>Dismiss</button>
                    )}
                  </div>
                );
              })}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}
