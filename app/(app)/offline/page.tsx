"use client";

import { useState, useRef, useEffect } from "react";
import { useGame } from "@/contexts/GameContext";
import { callAI } from "@/lib/ai";
import { saveGameData } from "@/lib/persistenceManager";
import { HPBar } from "@/components/ui/HPBar";
import { AdvBar } from "@/components/ui/AdvBar";
import { PlayerSprite } from "@/components/ui/PlayerSprite";
import { DebotSprite } from "@/components/ui/DebotSprite";
import { DebucksIcon } from "@/components/ui/DebucksIcon";
import ProfileModal from "@/components/modals/ProfileModal";
import { DebotStage } from "@/components/arena/DebotStage";
import { DialogueBox } from "@/components/game/DialogueBox";
import { InputPanel } from "@/components/game/InputPanel";
import { GAME_CONFIG } from "@/config/Game";
import { IMPACT_STYLE } from "@/constants/ImpactStyle";

/* ═══════════════════════════════════════════════════════════
   STATIC DATA & UTILS
═══════════════════════════════════════════════════════════ */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function extractJSON(raw) {
  const s = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return (a !== -1 && b !== -1) ? s.slice(a, b + 1) : s;
}

/* ═══════════════════════════════════════════════════════════
   OFFLINE GAME — menu / setup / battle / result
   Shared state (user, profile, opps, topics, apiError) now comes from
   GameContext via useGame() instead of being fetched here directly.
═══════════════════════════════════════════════════════════ */
export default function OfflinePage() {
  const {
    user,
    profile, upProfile,
    opps, oppsLoading, unlockDebot,
    topics, topicsLoading, saveCustomTopic,
    roundOptions, defaultRounds,
    apiError, setApiError,
  } = useGame();

  const [page, setPage] = useState("setup");
  const [showProfile, setShowProfile] = useState(false);

  // Setup State
  const [opp, setOpp] = useState(null);
  const [topic, setTopic] = useState(null);
  const [topicSide, setTopicSide] = useState("FOR");
  const [customT, setCustomT] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [topicSearch, setTopicSearch] = useState("");
  const [rounds, setRounds] = useState(defaultRounds);
  const [savingTopic, setSavingTopic] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [savedSuggestionIdx, setSavedSuggestionIdx] = useState([]);

  // defaultRounds starts as the GAME_CONFIG fallback and updates once
  // GameContext's app_settings fetch resolves — keep in sync in case that
  // happens after this page has already mounted.
  useEffect(() => {
    setRounds(defaultRounds);
  }, [defaultRounds]);

  // Battle State
  const [round, setRound] = useState(1);
  const [oppArg, setOppArg] = useState("");
  const [nextOppArg, setNextOppArg] = useState("");
  const [input, setInput] = useState("");
  const [pHP, setPHP] = useState(100);
  const [oHP, setOHP] = useState(100);
  const [pPts, setPPts] = useState(0);
  const [oPts, setOPts] = useState(0);
  const [history, setHistory] = useState([]);

  // Phases: "idle" | "loading" | "player-turn" | "evaluating" | "player-scored" | "opponent-scored"
  const [phase, setPhase] = useState("idle");
  const [loadMsg, setLoadMsg] = useState("");
  const [lastEval, setLastEval] = useState(null);
  const [emotion, setEmotion] = useState("neutral");
  const [shakeP, setShakeP] = useState(false);
  const [shakeO, setShakeO] = useState(false);
  const [dmgFloat, setDmgFloat] = useState(null);

  const [hintsLeft, setHintsLeft] = useState(GAME_CONFIG.hint.perRound);
  const [hintData, setHintData] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [showAns, setShowAns] = useState(false);
  const [ansData, setAnsData] = useState(null);
  const [ansUsed, setAnsUsed] = useState(0);
  const [pendingOppDamage, setPendingOppDamage] = useState(null);

  const textRef = useRef(null);

  // ── EASTER EGG: 5 consecutive taps on the Debucks counter -> 10,000 ──
  const coinTapCountRef = useRef(0);
  const coinTapTimerRef = useRef(null);

  function handleCoinTap() {
    coinTapCountRef.current += 1;
    if (coinTapTimerRef.current) clearTimeout(coinTapTimerRef.current);
    coinTapTimerRef.current = setTimeout(() => { coinTapCountRef.current = 0; }, 800);
    if (coinTapCountRef.current >= 5) {
      coinTapCountRef.current = 0;
      upProfile({ coins: 10000 });
    }
  }

  // ── SAVE MATCH RESULT ──
  // Fires once, the moment the Result page is reached. Guarded by a ref so
  // re-renders on the same result screen can't write the same match twice.
  const matchSavedRef = useRef(false);

  useEffect(() => {
    if (page !== "result") {
      matchSavedRef.current = false;
      return;
    }
    if (matchSavedRef.current || !opp) return;
    matchSavedRef.current = true;

    const won = oHP <= 0 || pPts > oPts;
    const draw = !won && (pHP <= 0 || oPts > pPts) ? false : pPts === oPts;
    const result = draw ? "draw" : won ? "win" : "loss";

    saveGameData("history", {
      id: `match-${Date.now()}`,
      createdAt: new Date().toISOString(),
      debotId: opp.id,
      topicText: activeTopic?.text || "",
      result,
      playerScore: pPts,
      opponentScore: oPts,
      rounds: history,
    }, user).then(res => {
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to save match history.");
      }
    });
  }, [page]);

  // Derived
  const activeTopic = useCustom && customT.trim() ? { text: customT.trim(), cat: "Custom" } : topic;
  const playerSide = topicSide;
  const oppSide = playerSide === "FOR" ? "AGAINST" : "FOR";
  const curSide = playerSide;
  const ansCost = GAME_CONFIG.showAnswer.baseCost * Math.pow(2, ansUsed);
  const iStyle = k => IMPACT_STYLE[k] || IMPACT_STYLE.Ineffective;

  function shakeEl(who, dmg) {
    if (who === "opp") { setShakeO(true); setTimeout(() => setShakeO(false), 420); }
    else { setShakeP(true); setTimeout(() => setShakeP(false), 420); }
    setDmgFloat({ val: dmg, who });
    setTimeout(() => setDmgFloat(null), 1100);
  }

  async function handleSaveTopic() {
    if (!customT.trim() || savingTopic) return;
    setSavingTopic(true);
    const ok = await saveCustomTopic(customT);
    setSavingTopic(false);
    if (ok) { setCustomT(""); setUseCustom(false); }
  }

  // ── AI TOPIC SEARCH ──
  // Note: this asks the model to generate plausible debate topics related to
  // the search text from its own knowledge — the app has no live web-search
  // tool wired up, so these are AI-suggested, not literally freshly scraped
  // from the internet.
  async function searchTopicsWithAI() {
    const query = topicSearch.trim();
    if (!query || aiSearching) return;
    setAiSearching(true);
    setAiSuggestions(null);
    setSavedSuggestionIdx([]);
    const sys = `You are a debate topic curator. Given a keyword or partial sentence, suggest 5 sharp, debatable propositions related to it. Return ONLY JSON:
{"topics":[{"text":"proposition as a clear statement","cat":"short category label"}]}`;
    try {
      const raw = await callAI(sys, `Keyword/phrase: "${query}"`);
      const parsed = JSON.parse(extractJSON(raw));
      setAiSuggestions(Array.isArray(parsed.topics) ? parsed.topics : []);
    } catch (err) {
      console.error(err);
      setApiError("AI topic search failed. Please try again.");
    }
    setAiSearching(false);
  }

  async function saveSuggestion(suggestion, idx) {
    const ok = await saveCustomTopic(suggestion.text, suggestion.cat || "Custom");
    if (ok) setSavedSuggestionIdx(prev => [...prev, idx]);
  }

  // ── EMOTIONAL CONTEXT GENERATOR ──
  function getEmotionalContext(currentOPts, currentPPts) {
    const diff = currentOPts - currentPPts;
    if (diff > 15) return "You are winning by a large margin. Act highly confident, triumphant, and slightly dismissive.";
    if (diff < -15) return "You are losing badly. Act defensive, frustrated, or desperate depending on your persona.";
    return "The debate is currently tied or very close. Maintain your baseline composure.";
  }

  // ── START BATTLE ──
  async function startBattle() {
    if (!activeTopic || !opp) return;
    setPage("battle"); setRound(1); setPPts(0); setOPts(0);
    setPHP(100); setOHP(opp.maxHP); setHistory([]); setLastEval(null); setInput(""); 
    setNextOppArg(""); setEmotion("neutral"); setShowAns(false); setAnsData(null);
    setHintsLeft(GAME_CONFIG.hint.perRound); setHintData(null); setShowHint(false);
    setAnsUsed(0); setPendingOppDamage(null); setApiError("");
    
    setPhase("loading"); setLoadMsg("Preparing opening argument…");

    try {
      const sys = `You are ${opp.name} debating ${oppSide} the proposition: "${activeTopic.text}". 
Personality: ${opp.personality} | Argument Depth: ${opp.depth}
BACKGROUND STORY: ${opp.story}
BEHAVIOR RULES: Speak like a real human. Show personality. Occasionally (not every time) let a line of your argument be colored by your background story — a hint of your past, your present situation, or what you're working toward — without turning the debate into a monologue about yourself. Give a sharp 2-3 sentence opening argument in-character. Return ONLY the argument text.`;
      
      const text = await callAI(sys, "State your opening argument.");
      setOppArg(text);
      setEmotion("confident");
      setPhase("player-turn");
    } catch (err) {
      console.error(err);
      setApiError("Failed to connect to the debate server. Please try again.");
      setPhase("idle");
    }
    setTimeout(() => textRef.current?.focus(), 200);
  }

  // ── SUBMIT ARGUMENT (Phase 1: Player hits Opponent) ──
  async function submitArg() {
    if (!input.trim() || phase !== "player-turn") return;
    setPhase("evaluating"); setLoadMsg("Judge is evaluating…");
    setShowAns(false); setAnsData(null); setShowHint(false); setHintData(null); setLastEval(null); setApiError("");

    const isLast = round >= rounds;
    const emotionalState = getEmotionalContext(oPts, pPts);

    const sys = `You are both ${opp.name} and an impartial debate judge.
TOPIC: "${activeTopic.text}" | OPPONENT SIDE: ${oppSide} | PLAYER (${profile.name}): ${curSide} | ROUND: ${round}/${rounds}
DEBOT PERSONALITY: ${opp.personality} | ARGUMENT DEPTH: ${opp.depth}
DEBOT BACKGROUND STORY: ${opp.story} (occasionally, not every round, let a hint of past/present/what-they're-working-toward color the opponent_reply)
EMOTIONAL CONTEXT: ${emotionalState}
OPPONENT SAID: "${oppArg}"
PLAYER SAID: "${input}"

JUDGE RULES:
- gain 0-50: quality of rebuttal.
- penalty 0-30: ONLY deduct for clear flaws.
- impact from net: 35+→Devastating, 25-34→Strong, 14-24→Solid, 5-13→Weak, <5→Ineffective
- opponent_gain 0-40, opponent_penalty 0-15: evaluate opponent's prior argument independently.
- weak_points: 2-4 SHORT targetable phrases from YOUR new opponent_reply.
- fallacies: fallacies in the PLAYER's response only.

Return ONLY valid JSON:
{
  "opponent_reply": "${isLast ? "Closing statement (2 sentences)" : "Next in-character argument (2-3 sentences)"}",
  "gain": 0-50,
  "penalty": 0-30,
  "tags": ["Style","Depth","Quality"],
  "impact": "Ineffective|Weak|Solid|Strong|Devastating",
  "critique": "One honest sentence about the player's argument.",
  "fallacies": [{"type":"name","text":"exact phrase"}],
  "weak_points": ["phrase1","phrase2"],
  "opponent_gain": 0-40,
  "opponent_penalty": 0-15
}`;

    try {
      const raw = await callAI(sys, "Evaluate and respond.");
      const ev = JSON.parse(extractJSON(raw));

      const g = clamp(ev.gain || 0, 0, GAME_CONFIG.scoring.maxGain);
      const p = clamp(ev.penalty || 0, 0, GAME_CONFIG.scoring.maxPenalty);
      const net = Math.max(0, g - p);

      const og = clamp(ev.opponent_gain || 0, 0, GAME_CONFIG.scoring.maxOppGain);
      const op2 = clamp(ev.opponent_penalty || 0, 0, GAME_CONFIG.scoring.maxOppPenalty);
      const oNet = Math.max(0, og - op2);

      // Apply Player Damage Immediately (each debot has its own damage multiplier from the DB)
      const dmgMultiplier = opp.multiplier ?? GAME_CONFIG.damage.playerMultiplier;
      const calculatedNewOHP = Math.max(0, oHP - Math.floor(net * dmgMultiplier));
      setOHP(calculatedNewOHP);
      setPPts(x => x + net);
      if (net > 8) shakeEl("opp", net);

      // Set emotional reaction based on damage taken
      if (net >= 30) setEmotion("shocked");
      else if (net >= 15) setEmotion("angry");
      else setEmotion("neutral");

      // Save opponent's upcoming counter-damage for Phase 2
      setPendingOppDamage({ oNet, newPHP: Math.max(0, pHP - Math.floor(oNet * GAME_CONFIG.damage.opponentMultiplier)) });
      
      const full = { ...ev, gain: g, penalty: p, net, oNet };
      setLastEval(full);
      setNextOppArg(ev.opponent_reply || "");
      setPhase("player-scored"); // Transition to cinematic phase 1
    } catch (err) {
      console.error(err);
      setApiError("Evaluation failed. The judge AI dropped the connection. Try again.");
      setPhase("player-turn");
    }
  }

  // ── OPPONENT COUNTERS (Phase 2: Opponent hits Player) ──
  function triggerOpponentCounter() {
    if (oHP <= 0) {
       // Opponent defeated by this hit — still record the final round (this
       // was previously skipped entirely, silently dropping the KO round
       // from both the Result breakdown and the saved match history). No
       // opponent counter-attack since they're already beaten, so oNet is 0.
       setHistory(prev => [...prev, { round, oppArg, pArg: input, eval: lastEval, net: lastEval.net, oNet: 0 }]);
       setTimeout(() => { setEmotion("defeated"); setPage("result"); }, 600);
       return;
    }

    setPhase("opponent-scored");
    setOppArg(nextOppArg);
    
    // Apply opponent damage
    setPHP(pendingOppDamage.newPHP);
    setOPts(x => x + pendingOppDamage.oNet);
    if (pendingOppDamage.oNet > 10) shakeEl("player", pendingOppDamage.oNet);

    if (pendingOppDamage.oNet > 18) setEmotion("confident");
    else setEmotion("neutral");

    setHistory(prev => [...prev, { round, oppArg, pArg: input, eval: lastEval, net: lastEval.net, oNet: pendingOppDamage.oNet }]);
  }
  
  // ── LIFELINES (Hint & Show Answer) ──
  async function getHint() {
    if (hintsLeft <= 0 || phase !== "player-turn") return;
    setHintsLeft(h => h - 1); setPhase("loading"); setLoadMsg("Analysing opponent argument…");
    const sys = `You are a debate coach. Identify logical fallacies and weak points in: "${oppArg}". Return ONLY JSON:
{"fallacies":[{"type":"name","text":"exact short phrase"}],"weak_points":["phrase1","phrase2"]}`;
    try {
      const d = JSON.parse(extractJSON(await callAI(sys, "Identify fallacies and weak points.")));
      setHintData(d); setShowHint(true);
    } catch {
      setApiError("Failed to generate hint.");
    }
    setPhase("player-turn");
  }

  async function getAns() {
    if (ansUsed >= GAME_CONFIG.showAnswer.maxUses || profile.coins < ansCost || phase !== "player-turn") return;
    upProfile({ coins: profile.coins - ansCost });
    setAnsUsed(u => u + 1);
    setPhase("loading"); setLoadMsg("Generating response options…");
    const sys = `You are an expert debate coach. The player (${curSide}) responds to: "${oppArg}". Topic: "${activeTopic?.text}". Return ONLY JSON:
{"options":[{"label":"Direct Counter","response":"2-3 sentence response","why":"brief reason"},{"label":"Analytical Attack","response":"2-3 sentence response","why":"brief reason"},{"label":"Reframe","response":"2-3 sentence response","why":"brief reason"}]}`;
    try {
      const d = JSON.parse(extractJSON(await callAI(sys, "Give 3 options.")));
      setAnsData(d.options); setShowAns(true);
    } catch {
      setApiError("Failed to generate answers.");
    }
    setPhase("player-turn");
  }

  // ── ADVANCE TO NEXT ROUND ──
  function advanceRound() {
    if (pendingOppDamage?.newPHP <= 0 || round >= rounds) {
      setPage("result");
      return;
    }
    setRound(r => r + 1);
    setInput("");
    setLastEval(null);
    setHintsLeft(1);
    setPhase("player-turn");
    setTimeout(() => textRef.current?.focus(), 200);
  }

  /* ─────────────────── DOMINANCE SCALING ─────────────────── */
  const totalPoints = pPts + oPts;
  const pScale = totalPoints === 0 ? 1 : clamp(1 + ((pPts / totalPoints) - 0.5) * 0.3, 0.92, 1.08);
  const oScale = totalPoints === 0 ? 1 : clamp(1 + ((oPts / totalPoints) - 0.5) * 0.3, 0.92, 1.08);

  /* ─────────────────── SETUP ─────────────────── */
  if (page === "setup") {
    const bgBlurColor = opp ? opp.color : "transparent";

    return (
      <div className="root" style={{ minHeight: "100vh", padding: "20px 16px", maxWidth: 820, margin: "0 auto", position: "relative" }}>
        {/* Dynamic Blurry Background */}
        <div style={{
          position: "fixed", top: "-20%", left: "-20%", right: "-20%", bottom: "-20%",
          background: `radial-gradient(circle at 50% 30%, ${bgBlurColor}20 0%, transparent 60%)`,
          filter: "blur(80px)", zIndex: -1, pointerEvents: "none", transition: "background 0.8s ease"
        }} />

        {showProfile && <ProfileModal profile={profile} onSave={name => { upProfile({ name }); setShowProfile(false); }} onClose={() => setShowProfile(false)} />}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setShowProfile(true)} style={{ fontSize: 12, color: "var(--muted)" }}>{profile.name}</button>
          <span className="badge" onClick={handleCoinTap} style={{ background: "var(--amber-soft)", color: "var(--amber)" }}><DebucksIcon style={{ marginRight: 4 }} />{profile.coins}</span>
        </div>

        <h2 className="heading" style={{ fontSize: 30, marginBottom: 22 }}>Select Debot</h2>

        {/* Zig-Zag Debot Layout */}
        {oppsLoading ? (
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 22 }}>Loading debots…</p>
        ) : (
          <DebotStage
            opps={opps}
            selectedOpp={opp}
            onSelect={(o) => setOpp(o)}
            onUnlock={unlockDebot}
            profile={profile}
          />
        )}

        {/* ── Rounds & Topic ── */}
        <div style={{ fontSize: 12, color: "var(--muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Number of Rounds</div>
        <div style={{ display: "flex", gap: 9, marginBottom: 26, flexWrap: "wrap" }}>
          {roundOptions.map(r => (
            <button key={r} className={`btn ${rounds === r ? "btn-primary" : "btn-ghost"}`} onClick={() => setRounds(r)}>{r} Rounds</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 14 }}>⌕</span>
            <input className="search-input" placeholder="Search topics by keyword…" value={topicSearch} onChange={e => setTopicSearch(e.target.value)} />
          </div>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!topicSearch.trim() || aiSearching}
            onClick={searchTopicsWithAI}
            title="Ask AI to suggest debate topics related to this search"
          >
            {aiSearching ? "Searching…" : "✦ Search AI"}
          </button>
        </div>

        {aiSuggestions && (
          <div className="card anim-fade-up" style={{ padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              ✦ AI Suggestions
            </div>
            {aiSuggestions.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>No suggestions came back — try a different phrase.</div>
            ) : aiSuggestions.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{s.text}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.cat}</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={savedSuggestionIdx.includes(i)}
                  onClick={() => saveSuggestion(s, i)}
                >
                  {savedSuggestionIdx.includes(i) ? "Saved ✓" : "💾 Save"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10, maxHeight: 240, overflowY: "auto" }}>
          {topicsLoading ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading topics…</p>
          ) : topics.filter(t => t.text.toLowerCase().includes(topicSearch.toLowerCase()) || t.cat.toLowerCase().includes(topicSearch.toLowerCase())).map(t => {
            const sel = !useCustom && topic?.id === t.id;
            return (
              <div key={t.id} className="card" style={{ padding: "11px 14px", borderColor: sel ? "var(--blue)" : "var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: sel ? 10 : 0 }} onClick={() => { setTopic(t); setUseCustom(false); }}>
                  <span style={{ fontSize: 14, color: sel ? "var(--blue)" : "var(--text)" }}>{t.text}</span>
                  <span className="badge" style={{ background: "var(--faint)", color: "var(--muted)", fontSize: 10 }}>{t.cat}</span>
                </div>
                {sel && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", animation: "fadeIn 0.2s" }}>
                    <button className={`btn btn-sm ${topicSide === "FOR" ? "btn-primary" : "btn-ghost"}`} onClick={e => { e.stopPropagation(); setTopicSide("FOR"); }}>▲ For</button>
                    <button className={`btn btn-sm ${topicSide === "AGAINST" ? "btn-danger" : "btn-ghost"}`} onClick={e => { e.stopPropagation(); setTopicSide("AGAINST"); }}>▼ Against</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: useCustom ? 12 : 0 }}>
            <input type="checkbox" id="custom" checked={useCustom} onChange={e => setUseCustom(e.target.checked)} style={{ accentColor: "var(--blue)" }} />
            <label htmlFor="custom" style={{ fontSize: 13, cursor: "pointer", color: "var(--muted)" }}>Custom proposition</label>
          </div>
          {useCustom && (
            <>
              <input className="input-field" placeholder="Enter your proposition…" value={customT} onChange={e => setCustomT(e.target.value)} style={{ marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className={`btn btn-sm ${topicSide === "FOR" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTopicSide("FOR")}>▲ For</button>
                <button className={`btn btn-sm ${topicSide === "AGAINST" ? "btn-danger" : "btn-ghost"}`} onClick={() => setTopicSide("AGAINST")}>▼ Against</button>
                <div style={{ flex: 1 }} />
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!customT.trim() || savingTopic}
                  onClick={handleSaveTopic}
                  title="Save this to your topic list for future battles"
                >
                  {savingTopic ? "Saving…" : "💾 Save topic"}
                </button>
              </div>
            </>
          )}
        </div>

        <button className="btn btn-primary btn-lg" disabled={!activeTopic || !opp} style={{ width: "100%" }} onClick={startBattle}>
          Begin Debate →
        </button>
      </div>
    );
  }

  /* ─────────────────── BATTLE ─────────────────── */
  if (page === "battle") {
    return (
      <div className="root" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", maxWidth: 840, margin: "0 auto", padding: "14px", gap: 10 }}>
        {dmgFloat && (
          <div style={{ position: "fixed", top: "30%", left: dmgFloat.who === "opp" ? "65%" : "25%", fontSize: 36, fontWeight: 800, color: dmgFloat.who === "opp" ? "var(--red)" : "var(--blue)", textShadow: "0 2px 14px rgba(0,0,0,0.8)", pointerEvents: "none", zIndex: 999, animation: "dmgFloat 1.1s ease forwards" }}>
            -{dmgFloat.val}
          </div>
        )}

        <div className="card" style={{ padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setPage("setup")}>← Exit</button>
            <div style={{ fontSize: 12, color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{activeTopic?.text}"</div>
            <span className="badge" style={{ background: "var(--faint)", color: "var(--muted)" }}>R {round}/{rounds}</span>
            <span className="badge" onClick={handleCoinTap} style={{ background: "var(--amber-soft)", color: "var(--amber)" }}><DebucksIcon style={{ marginRight: 4 }} />{profile.coins}</span>
          </div>
          <AdvBar pPts={pPts} oPts={oPts} pLabel={profile.name} oLabel={opp?.name} />
        </div>

        {/* Fighters */}
        {(() => {
          const OPP_HEX = {
            1:"#5dbb8a",2:"#2dd4bf",3:"#6b9fff",4:"#a78bfa",5:"#f5a623",6:"#38bdf8",
            7:"#ff7070",8:"#e879f9",9:"#fb923c",10:"#6b6b84",11:"#005dce",12:"#c084fc"
          };
          const oppHex = OPP_HEX[opp?.id] || "#6b9fff";
          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", gap: 10, padding: "8px 0" }}>

              {/* Player */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="badge" style={{ background: "var(--blue-soft)", color: "var(--blue)", fontSize: 10, alignSelf: "flex-start" }}>{curSide}</span>
                <div style={{ height: 150, maxWidth: 150, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <div style={{ width: 130, height: 130, flexShrink: 0, transition: "transform 0.6s ease", transform: `scale(${pScale})`, transformOrigin: "center center" }}>
                    <PlayerSprite shake={shakeP} name={profile.name} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{profile.name}</span>
                    <span>{Math.round(pHP)}%</span>
                  </div>
                  <HPBar current={pHP} max={100} color="var(--blue)" />
                </div>
              </div>

              {/* VS */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 5 }}>
                <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 7px", fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>vs</div>
              </div>

              {/* Debot */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="badge" style={{ background: "var(--red-soft)", color: "var(--red)", fontSize: 10, alignSelf: "flex-end" }}>{oppSide}</span>
                <div style={{ height: 150, maxWidth: 150, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <div style={{ width: 130, height: 130, flexShrink: 0, transition: "transform 0.6s ease", transform: `scale(${oScale})`, transformOrigin: "center center" }}>
                    <DebotSprite opp={opp} emotion={emotion} shake={shakeO} hexColor={oppHex} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{opp?.name}</span>
                    <span>{Math.round(clamp((oHP / (opp?.maxHP || 100)) * 100, 0, 100))}%</span>
                  </div>
                  <HPBar current={oHP} max={opp?.maxHP || 100} color={opp?.color || "var(--red)"} />
                </div>
              </div>

            </div>
          );
        })()}

        {/* Dialogue Box */}
        <DialogueBox history={history} oppArg={oppArg} phase={phase} oppName={opp?.name} showHint={showHint} hintData={hintData} />

        {/* Loading */}
        {(phase === "loading" || phase === "evaluating") && (
          <div style={{ padding: "14px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            <span className="anim-pulse">●●●</span> {loadMsg}
          </div>
        )}

        {/* Phase 1: Judge Eval / Player Hit */}
        {phase === "player-scored" && lastEval && (
          <div className="card anim-fade-up" style={{ padding: 18, borderColor: iStyle(lastEval.impact).bc, background: iStyle(lastEval.impact).bg }}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div className="anim-pop heading" style={{ fontSize: 28, color: iStyle(lastEval.impact).color, marginBottom: 6 }}>{lastEval.impact} Strike</div>
                <div style={{ display: "flex", gap: 5 }}>{lastEval.tags?.map((t, i) => <span key={i} className="badge" style={{ background: "var(--surface2)", fontSize: 11 }}>{t}</span>)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--blue)" }}>+{lastEval.net} Pts</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic", marginBottom: 14 }}>"{lastEval.critique}"</div>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={triggerOpponentCounter}>See Debot's Counter →</button>
          </div>
        )}

        {/* Phase 2: Opponent Hit */}
        {phase === "opponent-scored" && pendingOppDamage && (
          <div className="card anim-fade-up" style={{ padding: 18, borderColor: "var(--red-soft)", background: "rgba(255,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
               <div className="heading" style={{ fontSize: 20, color: "var(--red)" }}>Debot Retaliation</div>
               <div style={{ fontSize: 16, fontWeight: 600, color: "var(--red)" }}>+{pendingOppDamage.oNet} Pts</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>The debot fired back, dealing damage to your HP.</div>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={advanceRound}>Next Round →</button>
          </div>
        )}

        {/* Hint Panel */}
        {showHint && hintData && phase === "player-turn" && (
          <div className="card anim-fade-up" style={{ padding: 14, borderColor: "rgba(245,166,35,0.3)", background: "var(--amber-soft)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>💡 Hint</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowHint(false)}>×</button>
            </div>
            {hintData.fallacies?.map((f, i) => <div key={i} style={{ fontSize: 12, color: "var(--red)", marginBottom: 4 }}>⚠ <b>{f.type}</b>: "{f.text}"</div>)}
            {hintData.weak_points?.map((wp, i) => <div key={i} style={{ fontSize: 12, color: "var(--amber)", marginBottom: 4 }}>↗ "{wp}"</div>)}
          </div>
        )}

        {/* Answer Panel */}
        {showAns && ansData && phase === "player-turn" && (
          <div className="card anim-fade-up" style={{ padding: 16, borderColor: "rgba(107,159,255,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>✦ Suggested Responses</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAns(false)}>×</button>
            </div>
            {ansData.map((opt, i) => (
              <div key={i} style={{ marginBottom: 10, padding: 12, background: "var(--surface2)", borderRadius: 6, borderLeft: "2px solid var(--blue)" }}>
                <div style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600, marginBottom: 4 }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.65, marginBottom: 5 }}>{opt.response}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>{opt.why}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setInput(opt.response); setShowAns(false); }}>Use this →</button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        {phase === "player-turn" && (
          <InputPanel
            input={input}
            setInput={setInput}
            onSend={submitArg}
            isEvaluating={phase === "evaluating"}
            onHint={getHint}
            hintsLeft={hintsLeft}
            onAns={getAns}
            ansCost={ansCost}
            coins={profile.coins}
          />
        )}
      </div>
    );
  }

  /* ─────────────────── RESULT ─────────────────── */
  if (page === "result") {
    const won = oHP <= 0 || pPts > oPts;
    const draw = !won && (pHP <= 0 || oPts > pPts) ? false : pPts === oPts;
    const label = draw ? "Draw" : won ? "Victory" : "Defeat";
    const totalReward = won ? opp.reward + GAME_CONFIG.bonus.noPenalty : 0;

    return (
      <div className="root" style={{ minHeight: "100vh", padding: "24px 16px", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div className="anim-pop heading" style={{ fontSize: 52, color: won ? "var(--blue)" : draw ? "var(--muted)" : "var(--red)", marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>vs {opp?.name} · "{activeTopic?.text}"</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{pPts} <span style={{ color: "var(--muted)", fontWeight: 400 }}>–</span> {oPts}</div>
          {won && <div style={{ fontSize: 15, color: "var(--amber)", fontWeight: "bold", marginTop: 6 }}>+{totalReward} <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />earned</div>}
        </div>

        <div style={{ fontSize: 12, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
          Round by Round
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {history.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No round detail recorded for this match.</div>
          ) : history.map((h, i) => {
            const impact = h.eval?.impact || "Ineffective";
            const style = iStyle(impact);
            return (
              <div key={i} className="card" style={{ padding: 14, borderColor: style.bc, background: style.bg }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>Round {h.round}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: style.color }}>{impact} Strike</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: "var(--blue)", fontWeight: 600 }}>+{h.net ?? 0} you</div>
                    <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>+{h.oNet ?? 0} them</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  Gain {h.eval?.gain ?? 0} − Penalty {h.eval?.penalty ?? 0} = <b style={{ color: "var(--text)" }}>{h.net ?? 0} net</b>
                </div>

                {h.eval?.critique && (
                  <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginBottom: 8 }}>"{h.eval.critique}"</div>
                )}

                {h.eval?.fallacies?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {h.eval.fallacies.map((f, fi) => (
                      <div key={fi} style={{ fontSize: 11, color: "var(--red)" }}>⚠ <b>{f.type}</b>: "{f.text}"</div>
                    ))}
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4, fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div><b>You:</b> {h.pArg}</div>
                  <div><b>{opp?.name}:</b> {h.oppArg}</div>
                </div>
              </div>
            );
          })}
        </div>

        <button className="btn btn-primary btn-lg" style={{ width: "100%" }} onClick={() => { if (won) upProfile({ coins: profile.coins + totalReward, wins: profile.wins + 1 }); setPage("setup"); }}>Continue</button>
      </div>
    );
  }

  return null;
}
