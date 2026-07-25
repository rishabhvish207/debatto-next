"use client";

// The live two-human arena. Visually mirrors the debot arena — fighters,
// HP bars, side badges, impact-colored reveals via the same components —
// but scores each argument the INSTANT it's submitted (not waiting for
// both sides of a round), matching how debot mode gives you a result the
// moment you submit rather than waiting on anything else. See
// lib/onlineArena.ts's scorePvpTurn for the per-turn judge call.
//
// Whoever submits an argument scores their OWN turn — there's no longer a
// "only player_a's client scores" rule (that was a source of fragility:
// if player_a's browser wasn't around, nothing ever got scored). Both
// clients also call finalizeMatchIfComplete defensively after every turn;
// it's a no-op unless the match is actually fully scored.
//
// Realtime (postgres_changes) is the primary sync mechanism, backed by a
// light poll every few seconds as a safety net — belt and suspenders,
// since a single missed realtime event previously meant a manual refresh
// was the only way to see anything move.

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";
import { scorePvpTurn, turnImpact, finalizeMatchIfComplete } from "@/lib/onlineArena";
import { callAI, extractJSON } from "@/lib/ai";
import { PlayerSprite } from "@/components/ui/PlayerSprite";
import { HPBar } from "@/components/ui/HPBar";
import { AdvBar } from "@/components/ui/AdvBar";
import { InputPanel } from "@/components/game/InputPanel";
import { AppIcon } from "@/components/ui/AppIcon";
import { IMPACT_STYLE } from "@/constants/ImpactStyle";

const supabase = createClient();

const ITEM_LABELS: Record<string, string> = {
  insight_lens: "Insight Lens",
  ace_card: "Ace Card",
  confidence_pill: "Confidence Pill",
  revival_shot: "Revival Shot",
};

const MAX_HP = 100;
const DAMAGE_MULTIPLIER = 0.45;
const POLL_MS = 4000;

const iStyle = (k: string) => (IMPACT_STYLE as Record<string, typeof IMPACT_STYLE.Ineffective>)[k] || IMPACT_STYLE.Ineffective;

type Turn = { side: "a" | "b"; roundNumber: number; argument: string; gain: number; penalty: number; tags: string[] };

export default function OnlineMatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user, storeItems } = useGame();

  const [match, setMatch] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; username: string | null; avatar_url: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [itemsRemaining, setItemsRemaining] = useState<Record<string, number>>({});
  const [itemToast, setItemToast] = useState("");
  const [opponentTyping, setOpponentTyping] = useState(false);
  const [dmgFloat, setDmgFloat] = useState<{ who: "me" | "opp"; val: number } | null>(null);
  const [shakeMe, setShakeMe] = useState(false);
  const [shakeOpp, setShakeOpp] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showInsight, setShowInsight] = useState(false);
  const [insightData, setInsightData] = useState<{ fallacies: any[]; weak_points: string[] } | null>(null);
  const [insightForArg, setInsightForArg] = useState<string | null>(null); // which argument the cached insight is for
  const [insightLoading, setInsightLoading] = useState(false);
  const [showAce, setShowAce] = useState(false);
  const [aceOptions, setAceOptions] = useState<{ label: string; response: string; why: string }[] | null>(null);
  const [aceLoading, setAceLoading] = useState(false);
  const seenTurns = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  async function loadAll() {
    const { data: m } = await supabase.from("online_matches").select("*").eq("id", id).maybeSingle();
    if (!m) { setLoading(false); return; }
    setMatch(m);
    setItemsRemaining((prev) => (Object.keys(prev).length ? prev : { ...(m.allowed_items || {}) }));

    const { data: r } = await supabase.from("online_match_rounds").select("*").eq("match_id", id).order("round_number", { ascending: true });
    setRounds(r || []);

    const { data: profs, error: profsError } = await supabase.from("public_profiles").select("id, name, username, avatar_url").in("id", [m.player_a, m.player_b]);
    if (profsError) console.error(profsError);
    setProfiles(Object.fromEntries((profs || []).map((p: any) => [p.id, p])));
    setLoading(false);
  }

  // ══════════ Every hook below is unconditional — declared before ANY
  // early return in this component, with null-safe derived values so they
  // work fine before `match`/`rounds` have actually loaded yet. ══════════

  useEffect(() => { loadAll(); }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel(`arena:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "online_match_rounds", filter: `match_id=eq.${id}` }, () => { setOpponentTyping(false); loadAll(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "online_matches", filter: `id=eq.${id}` }, (payload: any) => setMatch(payload.new))
      .on("broadcast", { event: "item_used" }, (payload: any) => {
        if (payload.payload?.by !== user?.id) {
          setItemToast(`${payload.payload?.byName || "Opponent"} used ${ITEM_LABELS[payload.payload?.item] || payload.payload?.item}`);
          setTimeout(() => setItemToast(""), 3500);
        }
      })
      .on("broadcast", { event: "typing" }, (payload: any) => {
        if (payload.payload?.by === user?.id) return;
        setOpponentTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setOpponentTyping(false), 2500);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [id, user?.id]);

  // Safety-net poll — realtime is the primary path, this just means a
  // missed event self-heals within a few seconds instead of needing a
  // manual refresh.
  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === "visible") loadAll(); }, POLL_MS);
    return () => clearInterval(interval);
  }, [id]);

  const iAmA = match?.player_a === user?.id;
  const firstArguerIsA = !!match && match.first_arguer === match.player_a;
  const firstArgKey = firstArguerIsA ? "player_a_argument" : "player_b_argument";
  const secondArgKey = firstArguerIsA ? "player_b_argument" : "player_a_argument";
  const activeRound = rounds.find((r) => r.player_a_gain === null || r.player_b_gain === null);
  const matchDone = match?.status === "completed" || match?.status === "abandoned";

  // Flat chronological turn list, oldest first.
  const turns: Turn[] = [];
  for (const r of rounds) {
    if (r.player_a_argument && r.player_a_gain !== null) {
      turns.push({ side: "a", roundNumber: r.round_number, argument: r.player_a_argument, gain: r.player_a_gain, penalty: r.player_a_penalty || 0, tags: r.fallacies?.a_tags || [] });
    }
    if (r.player_b_argument && r.player_b_gain !== null) {
      turns.push({ side: "b", roundNumber: r.round_number, argument: r.player_b_argument, gain: r.player_b_gain, penalty: r.player_b_penalty || 0, tags: r.fallacies?.b_tags || [] });
    }
  }
  turns.sort((x, y) => x.roundNumber - y.roundNumber || (x.side === (firstArguerIsA ? "a" : "b") ? -1 : 1));

  // Damage-float + shake whenever a turn we haven't already reacted to
  // finishes scoring.
  useEffect(() => {
    if (!match) return;
    const last = turns[turns.length - 1];
    if (!last) return;
    const key = `${last.roundNumber}-${last.side}`;
    if (seenTurns.current.has(key)) return;
    seenTurns.current.add(key);
    const isMine = (last.side === "a") === iAmA;
    const net = Math.max(0, last.gain - last.penalty);
    const dmg = Math.round(net * DAMAGE_MULTIPLIER);
    if (dmg <= 0) return;
    if (isMine) { setShakeOpp(true); setDmgFloat({ who: "opp", val: dmg }); setTimeout(() => setShakeOpp(false), 400); }
    else { setShakeMe(true); setDmgFloat({ who: "me", val: dmg }); setTimeout(() => setShakeMe(false), 400); }
    setTimeout(() => setDmgFloat(null), 1100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns.length, match?.id]);

  if (loading) return <div style={{ padding: 24, color: "var(--muted)" }}>Loading…</div>;
  if (!match) return <div style={{ padding: 24, color: "var(--muted)" }}>Match not found.</div>;

  const myKey = iAmA ? "player_a_argument" : "player_b_argument";
  const myGainKey = iAmA ? "player_a_gain" : "player_b_gain";
  const myPenaltyKey = iAmA ? "player_a_penalty" : "player_b_penalty";
  const iAmFirstArguer = match.first_arguer === user?.id;
  const nextRoundNumber = rounds.length + 1;
  const oppId = iAmA ? match.player_b : match.player_a;
  const me = profiles[user?.id || ""];
  const opp = profiles[oppId];
  const mySide: "FOR" | "AGAINST" = iAmA ? match.player_a_side : (match.player_a_side === "FOR" ? "AGAINST" : "FOR");
  const oppSide = mySide === "FOR" ? "AGAINST" : "FOR";
  const oppHandle = opp?.username ? `@${opp.username}` : opp?.name || "your opponent";

  // Whose turn is it, right now.
  let myTurn = false;
  let waitingLabel = "";
  if (!matchDone) {
    if (!activeRound) {
      myTurn = iAmFirstArguer;
      if (!myTurn) waitingLabel = opponentTyping ? `${oppHandle} is typing…` : `Waiting for ${oppHandle} to open round ${nextRoundNumber}`;
    } else if (!activeRound[firstArgKey]) {
      myTurn = iAmFirstArguer;
    } else if (!activeRound[secondArgKey]) {
      myTurn = !iAmFirstArguer;
      if (!myTurn) waitingLabel = opponentTyping ? `${oppHandle} is typing…` : `Waiting for ${oppHandle} to respond`;
    }
  }

  // Raw damage taken from scored turns — heal (Confidence Pill/Revival
  // Shot, persisted on the match row so both sides see it) is applied on
  // top of this separately, same two-step debot mode effectively uses
  // (damage always lands, then whatever heal you've used offsets it).
  let myDamageTaken = 0, oppDamageTaken = 0;
  for (const t of turns) {
    const net = Math.max(0, t.gain - t.penalty);
    const dmg = Math.round(net * DAMAGE_MULTIPLIER);
    const dealtToMe = (t.side === "a") !== iAmA;
    if (dealtToMe) myDamageTaken += dmg; else oppDamageTaken += dmg;
  }
  const myHeal = (iAmA ? match.player_a_heal : match.player_b_heal) || 0;
  const oppHeal = (iAmA ? match.player_b_heal : match.player_a_heal) || 0;
  const myHP = Math.max(0, Math.min(MAX_HP, MAX_HP - myDamageTaken + myHeal));
  const oppHP = Math.max(0, Math.min(MAX_HP, MAX_HP - oppDamageTaken + oppHeal));

  const myScore = turns.filter((t) => (t.side === "a") === iAmA).reduce((s, t) => s + Math.max(0, t.gain - t.penalty), 0);
  const oppScore = turns.filter((t) => (t.side === "a") !== iAmA).reduce((s, t) => s + Math.max(0, t.gain - t.penalty), 0);

  // Whatever the OTHER side most recently said, anywhere in the match so
  // far — null only before the very first argument of the whole match has
  // been made. Insight Lens needs something to work off of; there's
  // nothing to analyze yet if this is null (Ace Card is fine either way —
  // it falls back to suggesting an opening statement).
  const precedingOpponentArg = turns.length ? turns[turns.length - 1].argument : null;

  function handleInputChange(v: string) {
    setInput(v);
    if (!myTurn) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 400) return;
    lastTypingSentRef.current = now;
    supabase.channel(`arena:${id}`).send({ type: "broadcast", event: "typing", payload: { by: user?.id } });
  }

  async function submit() {
    const text = input.trim();
    if (!text || !myTurn || submitting) return;
    setSubmitting(true);
    setInput("");
    setShowInsight(false);
    setShowAce(false);

    // Whatever the OTHER side most recently said is already computed above
    // as precedingOpponentArg.
    const score = await scorePvpTurn(match.topic_text, mySide, text, precedingOpponentArg, Math.min(nextRoundNumber, match.rounds_total), match.rounds_total);
    const impact = turnImpact(Math.max(0, score.gain - score.penalty));
    const fallacyKey = myKey === "player_a_argument" ? "a" : "b";
    const tagsKey = myKey === "player_a_argument" ? "a_tags" : "b_tags";

    if (!activeRound) {
      const { error } = await supabase.from("online_match_rounds").insert({
        match_id: match.id, round_number: nextRoundNumber, [firstArgKey]: text,
        [myGainKey]: score.gain, [myPenaltyKey]: score.penalty, impact,
        fallacies: { [fallacyKey]: score.fallacies, [tagsKey]: score.tags },
      });
      if (error) console.error(error);
    } else {
      const existingFallacies = activeRound.fallacies || {};
      const { error } = await supabase.from("online_match_rounds").update({
        [myKey]: text, [myGainKey]: score.gain, [myPenaltyKey]: score.penalty, impact,
        fallacies: { ...existingFallacies, [fallacyKey]: score.fallacies, [tagsKey]: score.tags },
      }).eq("id", activeRound.id);
      if (error) console.error(error);
    }

    await finalizeMatchIfComplete(match.id);
    setSubmitting(false);
  }

  // Insight Lens is a gadget, not a consumable — same as debot mode
  // (inventory.insightLens is a boolean there too): unlimited uses per
  // match once the host enables it, not decremented from itemsRemaining.
  // Cached per opponent-argument so reopening it doesn't re-burn an AI call
  // for an identical analysis.
  async function getInsight() {
    if (!myTurn || !precedingOpponentArg || !(itemsRemaining.insight_lens > 0)) return;
    if (showInsight) { setShowInsight(false); return; } // second tap: just close it
    if (insightData && insightForArg === precedingOpponentArg) { setShowInsight(true); return; } // cached

    setInsightLoading(true);
    const sys = `You are a debate coach. Identify logical fallacies and weak points in: "${precedingOpponentArg}". Return ONLY JSON:
{"fallacies":[{"type":"name","text":"exact short phrase"}],"weak_points":["phrase1","phrase2"]}`;
    try {
      const d = JSON.parse(extractJSON(await callAI(sys, "Identify fallacies and weak points.")));
      setInsightData(d);
      setInsightForArg(precedingOpponentArg);
      setShowInsight(true);
      broadcastItemUse("insight_lens");
    } catch (e) {
      console.error(e);
    }
    setInsightLoading(false);
  }

  // Ace Card — finite, spent from itemsRemaining like the other
  // consumables. Works with or without something to respond to: if this is
  // the opening argument of the match, it suggests strong openings instead
  // of rebuttals. Only spent once the AI call actually comes back, so a
  // Groq error/rate-limit doesn't cost the player a card for nothing.
  async function getAceOptions() {
    if (!myTurn || !(itemsRemaining.ace_card > 0) || aceLoading) return;
    setAceLoading(true);
    const sys = precedingOpponentArg
      ? `You are an expert debate coach. The player (${mySide}) responds to: "${precedingOpponentArg}". Topic: "${match.topic_text}". Return ONLY JSON:
{"options":[{"label":"Direct Counter","response":"2-3 sentence response","why":"brief reason"},{"label":"Analytical Attack","response":"2-3 sentence response","why":"brief reason"},{"label":"Reframe","response":"2-3 sentence response","why":"brief reason"}]}`
      : `You are an expert debate coach. The player is opening a debate arguing ${mySide} the proposition: "${match.topic_text}". Suggest 3 strong opening arguments. Return ONLY JSON:
{"options":[{"label":"Strong Claim","response":"2-3 sentence opening argument","why":"brief reason"},{"label":"Evidence-Led","response":"2-3 sentence opening argument","why":"brief reason"},{"label":"Framing Angle","response":"2-3 sentence opening argument","why":"brief reason"}]}`;
    try {
      const d = JSON.parse(extractJSON(await callAI(sys, "Give 3 options.")));
      setAceOptions(d.options);
      setShowAce(true);
      setItemsRemaining((prev) => ({ ...prev, ace_card: (prev.ace_card || 0) - 1 }));
      broadcastItemUse("ace_card");
    } catch (e) {
      console.error(e);
    }
    setAceLoading(false);
  }

  function broadcastItemUse(key: string) {
    supabase.channel(`arena:${id}`).send({ type: "broadcast", event: "item_used", payload: { by: user?.id, byName: me?.username ? `@${me.username}` : me?.name, item: key } });
  }

  // Confidence Pill / Revival Shot — real healing now, persisted on the
  // match row (player_a_heal/player_b_heal) so it's visible to both sides
  // and survives a refresh. Computed the same way debot mode does it: heal
  // is applied to whatever your CURRENT (already-clamped) HP is, not
  // banked for later — using a pill at full health just wastes it, same as
  // there.
  async function applyHealItem(key: "confidence_pill" | "revival_shot") {
    const remaining = itemsRemaining[key] || 0;
    if (remaining <= 0) return;
    const item = storeItems.find((si) => si.key === key);
    const newHP = key === "revival_shot" ? MAX_HP : Math.min(MAX_HP, myHP + (item?.healAmount ?? 10));
    const newHeal = newHP + myDamageTaken - MAX_HP;
    const healColumn = iAmA ? "player_a_heal" : "player_b_heal";
    const { error } = await supabase.from("online_matches").update({ [healColumn]: newHeal }).eq("id", match.id);
    if (error) { console.error(error); return; }
    setItemsRemaining((prev) => ({ ...prev, [key]: remaining - 1 }));
    broadcastItemUse(key);
  }

  function handleUseItem(key: string) {
    if (key === "insight_lens") { getInsight(); return; }
    if (key === "ace_card") { getAceOptions(); return; }
    if (key === "confidence_pill" || key === "revival_shot") { applyHealItem(key); return; }
  }

  async function confirmLeave() {
    setLeaving(true);
    const { error } = await supabase.from("online_matches").update({ status: "abandoned", completed_at: new Date().toISOString() }).eq("id", match.id);
    if (error) console.error(error);
    setLeaving(false);
    setLeaveConfirm(false);
  }

  const itemEntries = Object.entries(match.allowed_items || {}).filter(([, c]) => (c as number) > 0);
  const lastTurn = turns[turns.length - 1];
  const lastTurnNet = lastTurn ? Math.max(0, lastTurn.gain - lastTurn.penalty) : 0;
  const lastTurnImpact = lastTurn ? turnImpact(lastTurnNet) : "Ineffective";

  return (
    <div className="root" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", maxWidth: 840, margin: "0 auto", padding: 14, gap: 10 }}>
      {dmgFloat && (
        <div style={{
          position: "fixed", top: "30%", left: dmgFloat.who === "opp" ? "65%" : "25%", fontSize: 36, fontWeight: 800,
          color: dmgFloat.who === "opp" ? "var(--red)" : "var(--blue)", textShadow: "0 2px 14px rgba(0,0,0,0.8)",
          pointerEvents: "none", zIndex: 999, animation: "dmgFloat 1.1s ease forwards",
        }}>
          -{dmgFloat.val}
        </div>
      )}

      <div className="card" style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{match.topic_text}"</div>
          <span className="badge" style={{ background: "var(--faint)", color: "var(--muted)" }}>R {Math.min(nextRoundNumber, match.rounds_total)}/{match.rounds_total}</span>
          {!matchDone && (
            <button className="btn btn-ghost btn-sm" onClick={() => setLeaveConfirm(true)} style={{ fontSize: 11, padding: "3px 8px" }}>Forfeit</button>
          )}
        </div>
        <AdvBar pPts={myScore} oPts={oppScore} pLabel="You" oLabel={oppHandle} />
      </div>

      {leaveConfirm && (
        <div className="card" style={{ padding: 14, borderColor: "var(--red)" }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>Forfeit this match? Your opponent wins and this can't be undone.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-danger btn-sm" disabled={leaving} onClick={confirmLeave} style={{ flex: 1 }}>Forfeit</button>
            <button className="btn btn-ghost btn-sm" disabled={leaving} onClick={() => setLeaveConfirm(false)} style={{ flex: 1 }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", gap: 10, padding: "8px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="badge" style={{ background: "var(--blue-soft)", color: "var(--blue)", fontSize: 10, alignSelf: "flex-start" }}>{mySide}</span>
          <div style={{ height: 150, maxWidth: 150, width: "100%", margin: "0 auto" }}>
            <PlayerSprite shake={shakeMe} name={me?.name || "You"} avatarUrl={me?.avatar_url} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
              <span>You</span><span>{Math.round(myHP)}/{MAX_HP}</span>
            </div>
            <HPBar current={myHP} max={MAX_HP} color="var(--blue)" />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 7px", fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>vs</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="badge" style={{ background: "var(--red-soft)", color: "var(--red)", fontSize: 10, alignSelf: "flex-end" }}>{oppSide}</span>
          <div style={{ height: 150, maxWidth: 150, width: "100%", margin: "0 auto" }}>
            <PlayerSprite shake={shakeOpp} name={oppHandle} avatarUrl={opp?.avatar_url} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{oppHandle}</span>
              <span>{Math.round(oppHP)}/{MAX_HP}</span>
            </div>
            <HPBar current={oppHP} max={MAX_HP} color="var(--red)" />
          </div>
        </div>
      </div>

      {precedingOpponentArg && (
        <div className="card" style={{ padding: "12px 14px", borderLeft: "3px solid var(--red)" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{oppHandle} said</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{precedingOpponentArg}</div>
        </div>
      )}

      {itemToast && <div style={{ fontSize: 12, color: "var(--amber)", textAlign: "center" }}>{itemToast}</div>}

      {matchDone ? (
        <div className="card anim-fade-up" style={{ padding: 18, textAlign: "center" }}>
          <div className="heading" style={{ fontSize: 24, marginBottom: 4 }}>
            {match.status === "abandoned"
              ? "Match Forfeited"
              : match.result === "draw" ? "Draw" : (match.result === "a_win") === iAmA ? "You Won" : "You Lost"}
          </div>
          {match.mode === "random" && typeof match[iAmA ? "player_a_prestige_delta" : "player_b_prestige_delta"] === "number" && (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Prestige {match[iAmA ? "player_a_prestige_delta" : "player_b_prestige_delta"] >= 0 ? "+" : ""}{match[iAmA ? "player_a_prestige_delta" : "player_b_prestige_delta"]}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Latest turn reveal — impact-colored like the debot arena's "Strike" card */}
          {lastTurn && (
            <div className="card anim-fade-up" style={{ padding: 16, borderColor: iStyle(lastTurnImpact).bc, background: iStyle(lastTurnImpact).bg }}>
              <div className="anim-pop heading" style={{ fontSize: 20, color: iStyle(lastTurnImpact).color, marginBottom: 6 }}>
                {lastTurnImpact} — {(lastTurn.side === "a") === iAmA ? "You" : oppHandle}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>+{lastTurnNet} Pts</div>
              {lastTurn.tags.length > 0 && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{lastTurn.tags.join(" · ")}</div>}
            </div>
          )}

          {/* Insight panel */}
          {showInsight && insightData && myTurn && (
            <div className="card anim-fade-up" style={{ padding: 14, borderColor: "rgba(245,166,35,0.3)", background: "var(--amber-soft)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <AppIcon token="🔍" size={12} /> Insight
                </span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowInsight(false)}>×</button>
              </div>
              {insightData.fallacies?.map((f: any, i: number) => (
                <div key={i} style={{ fontSize: 12, color: "var(--red)", marginBottom: 4, display: "flex", gap: 5 }}>
                  <AppIcon token="⚠" size={13} /><span><b>{f.type}</b>: "{f.text}"</span>
                </div>
              ))}
              {insightData.weak_points?.map((wp: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: "var(--amber)", marginBottom: 4, display: "flex", gap: 5 }}>
                  <AppIcon token="↗" size={13} /><span>"{wp}"</span>
                </div>
              ))}
            </div>
          )}

          {/* Ace Card suggested-response panel */}
          {showAce && aceOptions && myTurn && (
            <div className="card anim-fade-up" style={{ padding: 16, borderColor: "rgba(107,159,255,0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <AppIcon token="✨" size={12} /> Suggested Responses
                </span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAce(false)}>×</button>
              </div>
              {aceOptions.map((opt, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 12, background: "var(--surface2)", borderRadius: 6, borderLeft: "2px solid var(--blue)" }}>
                  <div style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600, marginBottom: 4 }}>{opt.label}</div>
                  <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.65, marginBottom: 5 }}>{opt.response}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>{opt.why}</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setInput(opt.response); setShowAce(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    Use this <AppIcon token="→" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {itemEntries.length > 0 && myTurn && (
            <div className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Items</span>
              {itemEntries.map(([key]) => {
                if (key === "insight_lens") {
                  return (
                    <button
                      key={key}
                      className={`btn btn-sm ${showInsight ? "btn-primary" : "btn-ghost"}`}
                      disabled={!precedingOpponentArg || insightLoading}
                      onClick={getInsight}
                      title={!precedingOpponentArg ? "Nothing to analyze yet — you're opening this match" : "Analyze your opponent's last argument"}
                    >
                      {insightLoading ? "Analysing…" : "Insight Lens"}
                    </button>
                  );
                }
                if (key === "ace_card") {
                  return (
                    <button
                      key={key}
                      className="btn btn-ghost btn-sm"
                      disabled={!(itemsRemaining.ace_card > 0) || aceLoading}
                      onClick={getAceOptions}
                      title={precedingOpponentArg ? "Get 3 suggested responses" : "Get 3 suggested opening arguments"}
                    >
                      {aceLoading ? "Generating…" : `Ace Card (${itemsRemaining.ace_card || 0})`}
                    </button>
                  );
                }
                return (
                  <button
                    key={key}
                    className="btn btn-ghost btn-sm"
                    disabled={!(itemsRemaining[key] > 0)}
                    onClick={() => handleUseItem(key)}
                    title={key === "revival_shot" ? "Heal to full HP" : "Heal HP"}
                  >
                    {ITEM_LABELS[key] || key} ({itemsRemaining[key] || 0})
                  </button>
                );
              })}
            </div>
          )}

          {myTurn ? (
            <InputPanel input={input} setInput={handleInputChange} onSend={submit} isEvaluating={submitting} curSide={mySide} round={Math.min(nextRoundNumber, match.rounds_total)} rounds={match.rounds_total} />
          ) : (
            <div className="card" style={{ padding: 14, textAlign: "center" }}>
              <span className="anim-pulse" style={{ fontSize: 13, color: "var(--muted)" }}>{waitingLabel}</span>
            </div>
          )}
        </>
      )}

      {/* Full exchange history, newest first, excluding the just-revealed last turn above */}
      {turns.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {turns.slice(0, -1).reverse().map((t, i) => {
            const net = Math.max(0, t.gain - t.penalty);
            const isMine = (t.side === "a") === iAmA;
            return (
              <div key={i} className="card" style={{ padding: 12, fontSize: 12, borderLeft: `3px solid ${iStyle(turnImpact(net)).color}` }}>
                <div style={{ color: "var(--muted)", marginBottom: 4 }}>Round {t.roundNumber} · {isMine ? "You" : oppHandle} · +{net} Pts</div>
                <div>{t.argument}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
