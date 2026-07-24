"use client";

// Friends system: username search, send/accept/decline/cancel requests,
// friends list with live online/offline status (GameContext's presence
// channel — see contexts/GameContext.tsx). Challenging a friend into an
// actual match is the next slice on top of this; this page is purely the
// social graph.

import { useEffect, useState, ReactNode } from "react";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";
import { AppIcon } from "@/components/ui/AppIcon";

const supabase = createClient();

const STACKABLE_ITEMS: { key: string; label: string }[] = [
  { key: "ace_card", label: "Ace Card" },
  { key: "confidence_pill", label: "Confidence Pill" },
  { key: "revival_shot", label: "Revival Shot" },
];
// A gadget, not a consumable — same as everywhere else it's used in the
// app (user_inventory.insight_lens is a boolean, not a count), so it's a
// toggle here rather than a stepper that could reach 2+.
const GADGET_ITEM = { key: "insight_lens", label: "Insight Lens" };

type ProfileLite = { id: string; name: string; username: string | null; avatar_url: string | null };
type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined" | "blocked";
  other: ProfileLite | undefined;
};

export default function OnlineFriendsPage() {
  const { user, profile, onlineUserIds } = useGame();

  const [rows, setRows] = useState<FriendshipRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionError, setActionError] = useState("");

  const [challengeTarget, setChallengeTarget] = useState<ProfileLite | null>(null);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);

  async function sendInvite(target: ProfileLite, roundsTotal: number, allowedItems: Record<string, number>, topicText: string, hostSide: "FOR" | "AGAINST", firstArguerIsHost: boolean) {
    if (!user) return;
    const { error } = await supabase.from("match_invites").insert({
      host_id: user.id,
      invitee_id: target.id,
      rounds_total: roundsTotal,
      allowed_items: allowedItems,
      topic_text: topicText,
      host_side: hostSide,
      first_arguer_is_host: firstArguerIsHost,
    });
    if (error) { setActionError("Failed to send challenge."); return; }
    setChallengeTarget(null);
    setInviteSentTo(target.id);
    setTimeout(() => setInviteSentTo((cur) => (cur === target.id ? null : cur)), 4000);
  }

  async function refresh() {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    if (error) { console.error(error); setLoading(false); return; }

    const otherIds = Array.from(new Set((data || []).map((f: any) => (f.requester_id === user.id ? f.addressee_id : f.requester_id))));
    let others: Record<string, ProfileLite> = {};
    if (otherIds.length) {
      const { data: profs, error: profsError } = await supabase.from("public_profiles").select("id, name, username, avatar_url").in("id", otherIds);
      if (profsError) console.error(profsError);
      others = Object.fromEntries((profs || []).map((p: any) => [p.id, p]));
    }

    setRows((data || []).map((f: any) => ({ ...f, other: others[f.requester_id === user.id ? f.addressee_id : f.requester_id] })));
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [user]);

  // Debounced username search, excluding people already connected in any way.
  useEffect(() => {
    const trimmed = query.trim();
    if (!user || trimmed.length < 2) { setResults([]); setActionError(""); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("public_profiles")
        .select("id, name, username, avatar_url")
        .ilike("username", `%${trimmed}%`)
        .neq("id", user.id)
        .not("username", "is", null)
        .limit(10);
      if (error) {
        console.error(error);
        setActionError("Search failed — see console for details.");
        setResults([]);
        setSearching(false);
        return;
      }
      setActionError("");
      const knownIds = new Set(rows.map((r) => r.other?.id));
      setResults((data || []).filter((p: any) => !knownIds.has(p.id)));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query, user, rows]);

  async function sendRequest(targetId: string) {
    if (!user) return;
    setActionError("");
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: targetId });
    if (error) {
      setActionError(error.code === "23505" ? "A request already exists between you two." : "Failed to send request.");
      return;
    }
    setQuery("");
    setResults([]);
    refresh();
  }

  async function respond(friendshipId: string, accept: boolean) {
    if (accept) {
      await supabase.from("friendships").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", friendshipId);
    } else {
      await supabase.from("friendships").delete().eq("id", friendshipId);
    }
    refresh();
  }

  async function cancelOrUnfriend(friendshipId: string) {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    refresh();
  }

  if (!user) {
    return (
      <div style={{ padding: 24, color: "var(--muted)", textAlign: "center" }}>
        Log in to add friends and challenge them directly.
      </div>
    );
  }

  if (!profile?.username) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ color: "var(--muted)", marginBottom: 12, fontSize: 13 }}>
          You need a username before you can find or be found by friends.
        </div>
        <a href="/profile" className="btn btn-primary btn-sm">Set a username</a>
      </div>
    );
  }

  const incoming = rows.filter((r) => r.status === "pending" && r.addressee_id === user.id);
  const outgoing = rows.filter((r) => r.status === "pending" && r.requester_id === user.id);
  const friends = rows.filter((r) => r.status === "accepted");

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 22, marginBottom: 16 }}>Friends</h2>

      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <input
          className="input-field"
          placeholder="Search by username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: results.length || searching ? 10 : 0 }}
        />
        {searching && <div style={{ fontSize: 12, color: "var(--muted)" }}>Searching…</div>}
        {!searching && results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13 }}>@{p.username} <span style={{ color: "var(--muted)" }}>({p.name})</span></span>
                <button className="btn btn-primary btn-sm" onClick={() => sendRequest(p.id)}>Add</button>
              </div>
            ))}
          </div>
        )}
        {actionError && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 8 }}>{actionError}</div>}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : (
        <>
          {incoming.length > 0 && (
            <Section title="Friend requests">
              {incoming.map((r) => (
                <Row key={r.id} person={r.other} online={!!r.other && onlineUserIds.has(r.other.id)}>
                  <button className="btn btn-primary btn-sm" onClick={() => respond(r.id, true)}>Accept</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => respond(r.id, false)}>Decline</button>
                </Row>
              ))}
            </Section>
          )}

          {outgoing.length > 0 && (
            <Section title="Sent requests">
              {outgoing.map((r) => (
                <Row key={r.id} person={r.other} online={!!r.other && onlineUserIds.has(r.other.id)} pendingLabel="Pending">
                  <button className="btn btn-ghost btn-sm" onClick={() => cancelOrUnfriend(r.id)}>Cancel</button>
                </Row>
              ))}
            </Section>
          )}

          <Section title={`Friends${friends.length ? ` (${friends.length})` : ""}`}>
            {friends.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No friends yet — search above to add one.</div>
            ) : friends.map((r) => (
              <Row key={r.id} person={r.other} online={!!r.other && onlineUserIds.has(r.other.id)}
                pendingLabel={inviteSentTo === r.other?.id ? "Challenge sent!" : undefined}>
                <button className="btn btn-primary btn-sm" disabled={!r.other} onClick={() => r.other && setChallengeTarget(r.other)}>Challenge</button>
                <button className="btn btn-ghost btn-sm" onClick={() => cancelOrUnfriend(r.id)}>Remove</button>
              </Row>
            ))}
          </Section>
        </>
      )}

      {challengeTarget && (
        <ChallengeSetup
          target={challengeTarget}
          onCancel={() => setChallengeTarget(null)}
          onSend={(rounds, items, topic, hostSide, firstArguerIsHost) => sendInvite(challengeTarget, rounds, items, topic, hostSide, firstArguerIsHost)}
        />
      )}
    </div>
  );
}

function ChallengeSetup({ target, onCancel, onSend }: {
  target: ProfileLite;
  onCancel: () => void;
  onSend: (roundsTotal: number, allowedItems: Record<string, number>, topicText: string, hostSide: "FOR" | "AGAINST", firstArguerIsHost: boolean) => void;
}) {
  const [rounds, setRounds] = useState(5);
  const [items, setItems] = useState<Record<string, number>>({});
  const [topic, setTopic] = useState("");
  const [hostSide, setHostSide] = useState<"FOR" | "AGAINST">("FOR");
  const [firstArguerIsHost, setFirstArguerIsHost] = useState(true);

  function setItemCount(key: string, count: number) {
    setItems((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[key];
      else next[key] = count;
      return next;
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={onCancel}>
      <div className="card" style={{ padding: 20, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Challenge @{target.username}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>They'll see this setup before accepting.</div>

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>Topic</label>
        <input className="input-field" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What are you debating?" style={{ marginBottom: 16 }} />

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>Your side</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button className={`btn btn-sm ${hostSide === "FOR" ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1 }} onClick={() => setHostSide("FOR")}>▲ For</button>
          <button className={`btn btn-sm ${hostSide === "AGAINST" ? "btn-danger" : "btn-ghost"}`} style={{ flex: 1 }} onClick={() => setHostSide("AGAINST")}>▼ Against</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: -12, marginBottom: 16 }}>
          @{target.username} automatically argues the opposite side.
        </div>

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>Who goes first</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button className={`btn btn-sm ${firstArguerIsHost ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1 }} onClick={() => setFirstArguerIsHost(true)}>You</button>
          <button className={`btn btn-sm ${!firstArguerIsHost ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1 }} onClick={() => setFirstArguerIsHost(false)}>@{target.username}</button>
        </div>

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>Number of rounds</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[5, 10, 15].map((n) => (
            <button key={n} className={`btn btn-sm ${rounds === n ? "btn-primary" : "btn-ghost"}`} style={{ flex: 1 }} onClick={() => setRounds(n)}>{n} Rounds</button>
          ))}
        </div>

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>
          Items <span style={{ color: "var(--muted)" }}>(off by default — nothing here unless you turn it on)</span>
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {STACKABLE_ITEMS.map((opt) => {
            const count = items[opt.key] || 0;
            return (
              <div key={opt.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{opt.label}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setItemCount(opt.key, Math.max(0, count - 1))} disabled={count === 0}>−</button>
                <span style={{ fontSize: 13, width: 20, textAlign: "center" }}>{count}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setItemCount(opt.key, count + 1)}>+</button>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, fontSize: 13 }}>{GADGET_ITEM.label} <span style={{ color: "var(--muted)" }}>(1 max)</span></span>
            <button
              className={`btn btn-sm ${items[GADGET_ITEM.key] ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setItemCount(GADGET_ITEM.key, items[GADGET_ITEM.key] ? 0 : 1)}
            >
              {items[GADGET_ITEM.key] ? "Enabled" : "Off"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={!topic.trim()} onClick={() => onSend(rounds, items, topic.trim(), hostSide, firstArguerIsHost)}>Send Challenge</button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Row({ person, online, pendingLabel, children }: { person: ProfileLite | undefined; online: boolean; pendingLabel?: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ position: "relative", flexShrink: 0 }}>
        <span style={{
          width: 32, height: 32, borderRadius: "50%", background: "var(--surface2)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--muted)", overflow: "hidden",
        }}>
          {person?.avatar_url ? <img src={person.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (person?.name?.[0]?.toUpperCase() || "?")}
        </span>
        <span style={{
          position: "absolute", bottom: -1, right: -1, width: 10, height: 10, borderRadius: "50%",
          background: online ? "var(--blue)" : "var(--muted)", border: "2px solid var(--bg, #0b0b12)",
        }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          @{person?.username || "unknown"}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {pendingLabel || (online ? "Online" : "Offline")}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>{children}</div>
    </div>
  );
}
