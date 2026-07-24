"use client";

// The live two-human arena. Visually mirrors the debot arena
// (app/(app)/offline/page.tsx) — same fighter/HP-bar/side-badge layout via
// the same PlayerSprite/HPBar/AdvBar components, same impact-colored
// reveal card styling — but scores BOTH sides at once each round instead
// of debot mode's sequential "you hit, then they hit" phases, since a PvP
// round genuinely is simultaneous (the judge grades both real arguments
// together, there's no AI turn to wait on afterward).
//
// Turn-taking, scoring, and completion are unchanged from the previous
// pass — see lib/onlineArena.ts. NOT in this pass: item usage still only
// notifies the opponent, it doesn't apply an actual gameplay effect (e.g.
// an Ace Card doesn't currently do anything to the round beyond the toast).

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";
import { scorePvpRound, finalizeMatchIfComplete } from "@/lib/onlineArena";
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
const DAMAGE_MULTIPLIER = 0.45; // symmetric — no player/opponent asymmetry makes sense when both sides are human

const iStyle = (k: string) => (IMPACT_STYLE as Record<string, typeof IMPACT_STYLE.Ineffective>)[k] || IMPACT_STYLE.Ineffective;

export default function OnlineMatchPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useGame();

  const [match, setMatch] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; username: string | null; avatar_url: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [itemsRemaining, setItemsRemaining] = useState<Record<string, number>>({});
  const [itemToast, setItemToast] = useState("");
  const [dmgFloat, setDmgFloat] = useState<{ who: "me" | "opp"; val: number } | null>(null);
  const [shakeMe, setShakeMe] = useState(false);
  const [shakeOpp, setShakeOpp] = useState(false);
  const scoringRef = useRef<Set<string>>(new Set());
  const seenScoredRounds = useRef<Set<string>>(new Set());

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

  // ── All hooks unconditional, before any early return below ──
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
  // racing to score the same round twice.
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

  // Damage-float + shake whenever a round we haven't already reacted to
  // finishes scoring — mirrors the debot arena's hit-feedback, just
  // triggered by a row update instead of a phase transition.
  useEffect(() => {
    if (!match) return;
    const justScored = rounds.find((r) => r.player_a_gain !== null && r.player_b_gain !== null && !seenScoredRounds.current.has(r.id));
    if (!justScored) return;
    seenScoredRounds.current.add(justScored.id);

    const myGain = justScored[iAmA ? "player_a_gain" : "player_b_gain"] || 0;
    const myPenalty = justScored[iAmA ? "player_a_penalty" : "player_b_penalty"] || 0;
    const oppGain = justScored[iAmA ? "player_b_gain" : "player_a_gain"] || 0;
    const oppPenalty = justScored[iAmA ? "player_b_penalty" : "player_a_penalty"] || 0;
    const myNet = Math.max(0, myGain - myPenalty);
    const oppNet = Math.max(0, oppGain - oppPenalty);
    const dmgToOpp = Math.round(myNet * DAMAGE_MULTIPLIER);
    const dmgToMe = Math.round(oppNet * DAMAGE_MULTIPLIER);

    if (dmgToMe > 0) { setShakeMe(true); setDmgFloat({ who: "me", val: dmgToMe }); setTimeout(() => setShakeMe(false), 400); }
    else if (dmgToOpp > 0) { setShakeOpp(true); setDmgFloat({ who: "opp", val: dmgToOpp }); setTimeout(() => setShakeOpp(false), 400); }
    setTimeout(() => setDmgFloat(null), 1100);
  }, [rounds, iAmA, match]);

  if (loading) return <div style={{ padding: 24, color: "var(--muted)" }}>Loading…</div>;
  if (!match) return <div style={{ padding: 24, color: "var(--muted)" }}>Match not found.</div>;

  const myKey = iAmA ? "player_a_argument" : "player_b_argument";
  const iAmFirstArguer = match.first_arguer === user?.id;
  const nextRoundNumber = rounds.length + 1;
  const oppId = iAmA ? match.player_b : match.player_a;
  const me = profiles[user?.id || ""];
  const opp = profiles[oppId];
  const mySide = iAmA ? match.player_a_side : (match.player_a_side === "FOR" ? "AGAINST" : "FOR");
  const oppSide = mySide === "FOR" ? "AGAINST" : "FOR";

  // Whose turn is it, right now, for the arena input.
  let myTurn = false;
  let waitingLabel = "";
  if (!matchDone) {
    if (!activeRound) {
      myTurn = iAmFirstArguer;
      if (!myTurn) waitingLabel = `Waiting for ${opp?.username ? "@" + opp.username : "your opponent"} to open round ${nextRoundNumber}`;
    } else if (!activeRound[firstArgKey]) {
      myTurn = iAmFirstArguer;
    } else if (!activeRound[secondArgKey]) {
      myTurn = !iAmFirstArguer;
      if (!myTurn) waitingLabel = `Waiting for ${opp?.username ? "@" + opp.username : "your opponent"} to respond`;
    } else {
      waitingLabel = "Scoring round…";
    }
  }

  // HP derived from cumulative damage taken across all scored rounds —
  // same math the debot arena uses (net * a multiplier), just symmetric
  // since there's no AI persona to weight differently.
  let myHP = MAX_HP, oppHP = MAX_HP;
  for (const r of rounds) {
    if (r.player_a_gain === null || r.player_b_gain === null) continue;
    const myNet = Math.max(0, (r[iAmA ? "player_a_gain" : "player_b_gain"] || 0) - (r[iAmA ? "player_a_penalty" : "player_b_penalty"] || 0));
    const oppNet = Math.max(0, (r[iAmA ? "player_b_gain" : "player_a_gain"] || 0) - (r[iAmA ? "player_b_penalty" : "player_a_penalty"] || 0));
    oppHP = Math.max(0, oppHP - Math.round(myNet * DAMAGE_MULTIPLIER));
    myHP = Math.max(0, myHP - Math.round(oppNet * DAMAGE_MULTIPLIER));
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
    channel.send({ type: "broadcast", event: "item_used", payload: { by: user?.id, byName: me?.username ? `@${me.username}` : me?.name, item: key } });
  }

  const myScore = rounds.reduce((s, r) => s + Math.max(0, (r[iAmA ? "player_a_gain" : "player_b_gain"] || 0) - (r[iAmA ? "player_a_penalty" : "player_b_penalty"] || 0)), 0);
  const oppScore = rounds.reduce((s, r) => s + Math.max(0, (r[iAmA ? "player_b_gain" : "player_a_gain"] || 0) - (r[iAmA ? "player_b_penalty" : "player_a_penalty"] || 0)), 0);
  const itemEntries = Object.entries(match.allowed_items || {}).filter(([, c]) => (c as number) > 0);
  const scoredRounds = rounds.filter((r) => r.player_a_gain !== null && r.player_b_gain !== null).slice().reverse();

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
        </div>
        <AdvBar pPts={myScore} oPts={oppScore} pLabel="You" oLabel={opp?.username ? `@${opp.username}` : opp?.name || "Opponent"} />
      </div>

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
            <PlayerSprite shake={shakeOpp} name={opp?.username ? `@${opp.username}` : opp?.name || "Opponent"} avatarUrl={opp?.avatar_url} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{opp?.username ? `@${opp.username}` : opp?.name}</span>
              <span>{Math.round(oppHP)}/{MAX_HP}</span>
            </div>
            <HPBar current={oppHP} max={MAX_HP} color="var(--red)" />
          </div>
        </div>
      </div>

      {itemToast && <div style={{ fontSize: 12, color: "var(--amber)", textAlign: "center" }}>{itemToast}</div>}

      {matchDone ? (
        <div className="card anim-fade-up" style={{ padding: 18, textAlign: "center" }}>
          <div className="heading" style={{ fontSize: 24, marginBottom: 4 }}>
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
          {/* Latest round reveal — impact-colored like the debot arena's "Strike" card, but both sides at once since PvP scores simultaneously */}
          {scoredRounds[0] && (
            <div className="card anim-fade-up" style={{ padding: 16, borderColor: iStyle(scoredRounds[0].impact).bc, background: iStyle(scoredRounds[0].impact).bg }}>
              <div className="anim-pop heading" style={{ fontSize: 20, color: iStyle(scoredRounds[0].impact).color, marginBottom: 10 }}>{scoredRounds[0].impact} Round</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>You</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--blue)" }}>+{Math.max(0, (scoredRounds[0][iAmA ? "player_a_gain" : "player_b_gain"] || 0) - (scoredRounds[0][iAmA ? "player_a_penalty" : "player_b_penalty"] || 0))} Pts</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{opp?.username ? `@${opp.username}` : "Opponent"}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--red)" }}>+{Math.max(0, (scoredRounds[0][iAmA ? "player_b_gain" : "player_a_gain"] || 0) - (scoredRounds[0][iAmA ? "player_b_penalty" : "player_a_penalty"] || 0))} Pts</div>
                </div>
              </div>
            </div>
          )}

          {itemEntries.length > 0 && (
            <div className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Items</span>
              {itemEntries.map(([key]) => (
                <button
                  key={key}
                  className="btn btn-ghost btn-sm"
                  disabled={!(itemsRemaining[key] > 0)}
                  onClick={() => handleUseItem(key)}
                  title="Notifies your opponent — doesn't change scoring yet"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {ITEM_LABELS[key] || key} ({itemsRemaining[key] || 0})
                </button>
              ))}
            </div>
          )}

          {myTurn ? (
            <InputPanel input={input} setInput={setInput} onSend={submit} isEvaluating={submitting} curSide={mySide} round={Math.min(nextRoundNumber, match.rounds_total)} rounds={match.rounds_total} />
          ) : (
            <div className="card" style={{ padding: 14, textAlign: "center" }}>
              <span className="anim-pulse" style={{ fontSize: 13, color: "var(--muted)" }}>{waitingLabel}</span>
            </div>
          )}
        </>
      )}

      {/* Full round history — the debot arena only shows the last exchange since it's mid-flow;
          this is worth keeping in full since it's the permanent record of a completed exchange. */}
      {scoredRounds.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scoredRounds.slice(1).map((r) => (
            <div key={r.id} className="card" style={{ padding: 12, fontSize: 12, borderLeft: `3px solid ${iStyle(r.impact).color}` }}>
              <div style={{ color: "var(--muted)", marginBottom: 4 }}>Round {r.round_number} · {r.impact}</div>
              <div style={{ marginBottom: 3 }}><b>{iAmA ? "You" : (profiles[match.player_a]?.username ? `@${profiles[match.player_a].username}` : "Host")}:</b> {r.player_a_argument}</div>
              <div><b>{!iAmA ? "You" : (profiles[match.player_b]?.username ? `@${profiles[match.player_b].username}` : "Opponent")}:</b> {r.player_b_argument}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
