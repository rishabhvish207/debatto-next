"use client";

// The live two-human arena. Structurally mirrors the debot arena
// (app/(app)/offline/page.tsx) — round-by-round arguments, AI-judged
// scoring, running totals — but both sides are real people, synced over
// Supabase Realtime instead of one local session talking to an AI persona.
//
// Scoring a round is deliberately only ever triggered by player_a's own
// client (see the effect below) so two browsers racing to score the same
// round can't double-call the judge — both clients see the result via the
// row update either way.
//
// NOT in this pass: item usage below only *notifies* the opponent that an
// item was used — it doesn't yet apply any actual gameplay effect (e.g.
// doubling a round's gain). That's real follow-up work, flagged rather
// than quietly half-built.

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";
import { scorePvpRound, finalizeMatchIfComplete } from "@/lib/onlineArena";

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
  const [rounds, setRounds] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [itemsRemaining, setItemsRemaining] = useState<Record<string, number>>({});
  const [itemToast, setItemToast] = useState("");
  const scoringRef = useRef<Set<string>>(new Set());

  async function loadAll() {
    const { data: m } = await supabase.from("online_matches").select("*").eq("id", id).maybeSingle();
    if (!m) { setLoading(false); return; }
    setMatch(m);
    setItemsRemaining((prev) => (Object.keys(prev).length ? prev : { ...(m.allowed_items || {}) }));

    const { data: r } = await supabase.from("online_match_rounds").select("*").eq("match_id", id).order("round_number", { ascending: true });
    setRounds(r || []);

    const { data: profs } = await supabase.from("public_profiles").select("id, name, username").in("id", [m.player_a, m.player_b]);
    setNames(Object.fromEntries((profs || []).map((p: any) => [p.id, p.username ? `@${p.username}` : p.name])));
    setLoading(false);
  }

  // ── All hooks declared unconditionally, before any early return below ──
  useEffect(() => { loadAll(); }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel(`arena:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "online_match_rounds", filter: `match_id=eq.${id}` }, () => loadAll())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "online_matches", filter: `id=eq.${id}` }, (payload: any) => setMatch(payload.new))
      .on("broadcast", { event: "item_used" }, (payload: any) => {
        if (payload.payload?.by !== user?.id) {
          setItemToast(`${payload.payload?.byName || "Opponent"} used ${ITEM_LABELS[payload.payload?.item] || payload.payload?.item}`);
          setTimeout(() => setItemToast(""), 3500);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, user?.id]);

  const iAmA = match?.player_a === user?.id;
  const firstArguerIsA = !!match && match.first_arguer === match.player_a;
  const firstArgKey = firstArguerIsA ? "player_a_argument" : "player_b_argument";
  const secondArgKey = firstArguerIsA ? "player_b_argument" : "player_a_argument";
  const activeRound = rounds.find((r) => r.player_a_gain === null || r.player_b_gain === null);
  const matchDone = match?.status === "completed";

  // Only player_a's own client ever calls the judge — both clients still
  // see the result via the row update, this just prevents two browsers
  // racing to score the same round twice. Guarded internally (not by
  // omitting the hook call) so hook order never changes between renders.
  useEffect(() => {
    if (!match || !iAmA || !activeRound || matchDone) return;
    if (!activeRound.player_a_argument || !activeRound.player_b_argument) return;
    if (activeRound.player_a_gain !== null) return;
    if (scoringRef.current.has(activeRound.id)) return;
    scoringRef.current.add(activeRound.id);

    (async () => {
      const score = await scorePvpRound(match.topic_text, activeRound.round_number, match.rounds_total, activeRound.player_a_argument, activeRound.player_b_argument);
      await supabase.from("online_match_rounds").update({
        player_a_gain: score.aGain, player_a_penalty: score.aPenalty,
        player_b_gain: score.bGain, player_b_penalty: score.bPenalty,
        impact: score.impact, fallacies: { a: score.aFallacies, b: score.bFallacies, a_tags: score.aTags, b_tags: score.bTags },
      }).eq("id", activeRound.id);
      await finalizeMatchIfComplete(match.id);
    })();
  }, [match?.id, activeRound?.id, activeRound?.player_a_argument, activeRound?.player_b_argument, iAmA, matchDone]);

  if (loading) return <div style={{ padding: 24, color: "var(--muted)" }}>Loading…</div>;
  if (!match) return <div style={{ padding: 24, color: "var(--muted)" }}>Match not found.</div>;

  const myKey = iAmA ? "player_a_argument" : "player_b_argument";
  const iAmFirstArguer = match.first_arguer === user?.id;
  const nextRoundNumber = rounds.length + 1;

  // Whose turn is it, right now, for the arena input.
  let myTurn = false;
  let waitingLabel = "";
  if (!matchDone) {
    if (!activeRound) {
      myTurn = iAmFirstArguer;
      if (!myTurn) waitingLabel = `Waiting for ${names[match.first_arguer] || "opponent"} to open round ${nextRoundNumber}`;
    } else if (!activeRound[firstArgKey]) {
      myTurn = iAmFirstArguer;
    } else if (!activeRound[secondArgKey]) {
      myTurn = !iAmFirstArguer;
      if (!myTurn) waitingLabel = `Waiting for ${names[match.player_a === match.first_arguer ? match.player_b : match.player_a] || "opponent"} to respond`;
    } else {
      waitingLabel = "Scoring round…";
    }
  }

  async function submit() {
    const text = input.trim();
    if (!text || !myTurn) return;
    setSubmitting(true);
    if (!activeRound) {
      await supabase.from("online_match_rounds").insert({ match_id: match.id, round_number: nextRoundNumber, [firstArgKey]: text });
    } else {
      await supabase.from("online_match_rounds").update({ [myKey]: text }).eq("id", activeRound.id);
    }
    setInput("");
    setSubmitting(false);
  }

  function handleUseItem(key: string) {
    const remaining = itemsRemaining[key] || 0;
    if (remaining <= 0) return;
    setItemsRemaining((prev) => ({ ...prev, [key]: remaining - 1 }));
    const channel = supabase.channel(`arena:${id}`);
    channel.send({ type: "broadcast", event: "item_used", payload: { by: user?.id, byName: names[user?.id || ""], item: key } });
  }

  const myScore = rounds.reduce((s, r) => s + Math.max(0, (r[iAmA ? "player_a_gain" : "player_b_gain"] || 0) - (r[iAmA ? "player_a_penalty" : "player_b_penalty"] || 0)), 0);
  const oppScore = rounds.reduce((s, r) => s + Math.max(0, (r[iAmA ? "player_b_gain" : "player_a_gain"] || 0) - (r[iAmA ? "player_b_penalty" : "player_a_penalty"] || 0)), 0);
  const oppId = iAmA ? match.player_b : match.player_a;
  const itemEntries = Object.entries(match.allowed_items || {}).filter(([, c]) => (c as number) > 0);

  return (
    <div className="root" style={{ padding: "16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>You</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>Round {Math.min(nextRoundNumber, match.rounds_total)}/{match.rounds_total}</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{names[oppId] || "Opponent"}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--blue)" }}>{myScore}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", flex: 1 }}>"{match.topic_text}"</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{oppScore}</div>
      </div>

      {itemToast && (
        <div style={{ fontSize: 12, color: "var(--amber)", textAlign: "center", marginBottom: 10 }}>{itemToast}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {rounds.map((r) => (
          <div key={r.id} className="card" style={{ padding: 12, fontSize: 12 }}>
            <div style={{ color: "var(--muted)", marginBottom: 4 }}>Round {r.round_number} {r.impact ? `· ${r.impact}` : ""}</div>
            {r.player_a_argument && <div style={{ marginBottom: 3 }}><b>{iAmA ? "You" : names[match.player_a]}:</b> {r.player_a_argument}</div>}
            {r.player_b_argument && <div><b>{!iAmA ? "You" : names[match.player_b]}:</b> {r.player_b_argument}</div>}
          </div>
        ))}
      </div>

      {matchDone ? (
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            {match.result === "draw" ? "Draw" : (match.result === "a_win") === iAmA ? "You Won" : "You Lost"}
          </div>
          {match.mode === "random" && typeof match[iAmA ? "player_a_prestige_delta" : "player_b_prestige_delta"] === "number" && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Prestige {match[iAmA ? "player_a_prestige_delta" : "player_b_prestige_delta"] >= 0 ? "+" : ""}{match[iAmA ? "player_a_prestige_delta" : "player_b_prestige_delta"]}
            </div>
          )}
        </div>
      ) : (
        <>
          {itemEntries.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {itemEntries.map(([key]) => (
                <button key={key} className="btn btn-ghost btn-sm" disabled={!(itemsRemaining[key] > 0)} onClick={() => handleUseItem(key)}>
                  {ITEM_LABELS[key] || key} ({itemsRemaining[key] || 0})
                </button>
              ))}
            </div>
          )}

          {myTurn ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input-field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Your argument…" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
              <button className="btn btn-primary btn-sm" disabled={!input.trim() || submitting} onClick={submit}>Send</button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: 12 }}>{waitingLabel}</div>
          )}
        </>
      )}
    </div>
  );
}
