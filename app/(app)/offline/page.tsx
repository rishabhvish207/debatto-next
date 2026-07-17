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
import { DebotStage } from "@/components/arena/DebotStage";
import { DialogueBox } from "@/components/game/DialogueBox";
import { InputPanel } from "@/components/game/InputPanel";
import { ItemsBar } from "@/components/game/ItemsBar";
import { GAME_CONFIG } from "@/config/Game";
import { IMPACT_STYLE } from "@/constants/ImpactStyle";

/* ═══════════════════════════════════════════════════════════
   STATIC DATA & UTILS
═══════════════════════════════════════════════════════════ */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function extractJSON(raw: string) {
  const s = raw.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return (a !== -1 && b !== -1) ? s.slice(a, b + 1) : s;
}

/**
 * Hard backstop against the judge model just being generous with junk input.
 * The AI judge is asked to grade harshly, but LLMs (especially smaller/faster
 * ones) tend to default to charitable mid-range scores even for gibberish —
 * that's what let "bs" earn ~40 points. This never *increases* a score, it
 * only flags input that clearly isn't a real argument so we can zero the
 * gain locally regardless of what the model returned.
 */
function isLowEffortInput(text: string) {
  const trimmed = (text || "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 4) return true; // too short to make an actual point

  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (letters.length < trimmed.length * 0.5) return true; // mostly punctuation/symbols/digits

  const uniqueLetters = new Set(letters.toLowerCase()).size;
  if (uniqueLetters < 6) return true; // e.g. "asdasd asdasd asdasd"

  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
  if (letters.length > 12 && vowels / letters.length < 0.15) return true; // no real words = almost no vowels

  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  if (words.length > 5 && uniqueWords.size < words.length * 0.4) return true; // "lol lol lol lol lol"

  return false;
}

/**
 * The admin sets a "Difficulty label" per debot (Beginner/Intermediate/...),
 * but nothing ever told the AI to actually play differently based on it — a
 * "Beginner" debot argued exactly as hard as anything else. This turns the
 * label into concrete instructions for both how the debot argues and how
 * strictly the judge should grade the matchup.
 */
function getDifficultyGuidance(diff: string) {
  const key = (diff || "").toLowerCase();
  if (key.includes("beginner") || key.includes("easy")) {
    return "DIFFICULTY: Beginner. Argue in a genuinely weaker way — simple points, occasional shaky logic or an easy-to-exploit assumption, shorter reasoning chains. Don't be incoherent, just unpolished and beatable. As judge, grade the PLAYER generously: reward reasonable rebuttals, don't nitpick minor imprecision.";
  }
  if (key.includes("intermediate") || key.includes("medium")) {
    return "DIFFICULTY: Intermediate. Argue competently with solid, common-sense reasoning, but don't reach for advanced tactics or airtight logic. As judge, grade the PLAYER fairly by the standard rubric.";
  }
  if (key.includes("advanced") || key.includes("hard")) {
    return "DIFFICULTY: Advanced. Argue sharply — precise claims, real evidence-style reasoning, and directly exploit weak points in the player's argument. As judge, grade the PLAYER strictly — reward only genuinely strong rebuttals.";
  }
  if (key.includes("expert") || key.includes("master")) {
    return "DIFFICULTY: Expert. Argue at a highly skilled level — dense, precise reasoning, anticipate counterarguments, and relentlessly target any weakness in the player's case. As judge, grade the PLAYER very strictly — only exceptional, airtight rebuttals should score high.";
  }
  return "DIFFICULTY: Standard. Argue with solid, balanced reasoning and grade the PLAYER fairly by the standard rubric.";
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
    battleActive, setBattleActive,
    opps, oppsLoading, unlockDebot,
    inventory, useAceCard, useConfidencePill,
    storeItems,
    topics, topicsLoading, saveCustomTopic,
    pinnedTopicIds, toggleTopicPin, deleteTopic,
    roundOptions, defaultRounds, requestNavigation, settingsLoaded,
    apiError, setApiError,
  } = useGame();

  const [page, setPage] = useState<"setup" | "battle" | "result">("setup");

  // Setup State
  const [opp, setOpp] = useState<any>(null);
  const [topic, setTopic] = useState<any>(null);
  const [topicSide, setTopicSide] = useState("FOR");
  const [customT, setCustomT] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [topicSearch, setTopicSearch] = useState("");
  const [rounds, setRounds] = useState(defaultRounds);
  const [savingTopic, setSavingTopic] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[] | null>(null);
  const [savedSuggestionIdx, setSavedSuggestionIdx] = useState<number[]>([]);
  const [topicMenuOpenId, setTopicMenuOpenId] = useState<any>(null);
  const [topicDeleteConfirmId, setTopicDeleteConfirmId] = useState<any>(null);

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
  const [history, setHistory] = useState<any[]>([]);

  // Phases: "idle" | "loading" | "player-turn" | "evaluating" | "player-scored" | "opponent-scored"
  const [phase, setPhase] = useState("idle");
  const [loadMsg, setLoadMsg] = useState("");
  const [lastEval, setLastEval] = useState<any>(null);
  const [emotion, setEmotion] = useState("neutral");
  const [shakeP, setShakeP] = useState(false);
  const [shakeO, setShakeO] = useState(false);
  const [dmgFloat, setDmgFloat] = useState<{ val: number; who: "player" | "opp" } | null>(null);

  const [hintData, setHintData] = useState<any>(null);
  const [hintRound, setHintRound] = useState<number | null>(null); // which round hintData was generated for — reused on repeat opens within the same round instead of re-calling the AI
  const [showHint, setShowHint] = useState(false);
  const [showAns, setShowAns] = useState(false);
  const [ansData, setAnsData] = useState<any>(null);
  const [pendingOppDamage, setPendingOppDamage] = useState<any>(null);

  const textRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Keep the shared "is a match in progress" flag in sync — requestNavigation
  // (drawer links, header logo, in-match Exit, browser back) reads this to
  // decide whether to intercept navigation with a confirm modal. Also clear
  // it on unmount so it can't get stuck true.
  useEffect(() => {
    setBattleActive(page === "battle");
    return () => setBattleActive(false);
  }, [page]);

  // Closing the tab or hitting refresh mid-match doesn't go through React
  // Router at all, so requestNavigation can't intercept it — this is the one
  // case that needs the browser's own native "leave site?" prompt instead.
  useEffect(() => {
    if (page !== "battle") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [page]);

  // Derived
  const visibleTopics = topics
    .filter((t: any) => t.text.toLowerCase().includes(topicSearch.toLowerCase()) || t.cat.toLowerCase().includes(topicSearch.toLowerCase()))
    .slice()
    .sort((a: any, b: any) => (pinnedTopicIds.includes(b.id) ? 1 : 0) - (pinnedTopicIds.includes(a.id) ? 1 : 0));

  const activeTopic = useCustom && customT.trim() ? { text: customT.trim(), cat: "Custom" } : topic;
  const playerSide = topicSide;
  const oppSide = playerSide === "FOR" ? "AGAINST" : "FOR";
  const curSide = playerSide;
  const iStyle = (k: string) => (IMPACT_STYLE as Record<string, typeof IMPACT_STYLE.Ineffective>)[k] || IMPACT_STYLE.Ineffective;

  function shakeEl(who: "player" | "opp", dmg: number) {
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

  async function saveSuggestion(suggestion: any, idx: number) {
    const ok = await saveCustomTopic(suggestion.text, suggestion.cat || "Custom");
    if (ok) setSavedSuggestionIdx(prev => [...prev, idx]);
  }

  // ── EMOTIONAL CONTEXT GENERATOR ──
  function getEmotionalContext(currentOPts: number, currentPPts: number) {
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
    setHintRound(null); setHintData(null); setShowHint(false);
    setPendingOppDamage(null); setApiError("");
    
    setPhase("loading"); setLoadMsg("Preparing opening argument…");

    try {
      const n = opp.argSentences ?? 3;
      const sys = `You are ${opp.name} debating ${oppSide} the proposition: "${activeTopic.text}". 
Personality: ${opp.personality} | Argument Depth: ${opp.depth}
BACKGROUND STORY: ${opp.story}
${getDifficultyGuidance(opp.diff)}
BEHAVIOR RULES: Speak like a real human. Show personality. Occasionally (not every time) let a line of your argument be colored by your background story — a hint of your past, your present situation, or what you're working toward — without turning the debate into a monologue about yourself. Give a sharp ${n}-sentence opening argument in-character. Return ONLY the argument text.`;
      
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
${getDifficultyGuidance(opp.diff)}
EMOTIONAL CONTEXT: ${emotionalState}
OPPONENT SAID: "${oppArg}"
PLAYER SAID: "${input}"

JUDGE RULES — grade like a strict debate judge, not a cheerleader, adjusted for this debot's difficulty above. Most arguments are mediocre; reserve high scores for arguments that earn them.
- gain 0-50, anchored: 0-5 = off-topic, incoherent, or restates opponent with no new point. 6-15 = on-topic but shallow/unsupported assertion. 16-30 = a real point with some reasoning or evidence. 31-40 = a well-reasoned rebuttal that directly engages the opponent's specific claim. 41-50 = exceptional — direct refutation, evidence/logic, and precision, reserved for genuinely strong debate.
- Before scoring, silently check: does this response engage with "${oppArg}" specifically, and does it make actual sense in English? If either check fails, gain must be 0-5 regardless of length or confident tone.
- penalty 0-30: deduct for logical fallacies, irrelevance, contradictions, or restating without advancing the argument. Low-effort or nonsensical input should receive a HIGH penalty (20-30), not a low one.
- impact from net: 35+→Devastating, 25-34→Strong, 14-24→Solid, 5-13→Weak, <5→Ineffective
- tags: 2-3 short labels describing the PLAYER's argument specifically (e.g. "Logical Rebuttal", "Weak Evidence", "Ad Hominem") — must match what PLAYER SAID actually contains, never traits of OPPONENT SAID.
- critique: one honest sentence about PLAYER SAID only. Do not describe or restate OPPONENT SAID's content, reasoning style, or weaknesses here — this field is about the player, not the opponent.
- fallacies: fallacies in the PLAYER's response only.
- CHECK BEFORE WRITING gain/penalty/tags/critique/fallacies: re-read PLAYER SAID above. Every one of these five fields must be grounded only in that exact text, never in OPPONENT SAID.
- opponent_gain 0-40, opponent_penalty 0-15: evaluate opponent's prior argument (OPPONENT SAID) independently, by the same strict standard.
- weak_points: 2-4 SHORT targetable phrases from YOUR new opponent_reply (the debot's upcoming argument, not the player's).

Return ONLY valid JSON. Fill fields in this order so the player evaluation is grounded before you switch back into ${opp.name}'s voice:
{
  "gain": 0-50,
  "penalty": 0-30,
  "impact": "Ineffective|Weak|Solid|Strong|Devastating",
  "tags": ["about PLAYER's argument only"],
  "critique": "One honest sentence about PLAYER SAID only.",
  "fallacies": [{"type":"name","text":"exact phrase from PLAYER SAID"}],
  "opponent_gain": 0-40,
  "opponent_penalty": 0-15,
  "opponent_reply": "${isLast ? "Closing statement (2 sentences)" : `Next in-character argument (${opp.argSentences ?? 3} sentences)`}",
  "weak_points": ["phrase1","phrase2"]
}`;

    try {
      const raw = await callAI(sys, "Evaluate and respond.");
      const ev = JSON.parse(extractJSON(raw));

      const lowEffort = isLowEffortInput(input);
      const g = lowEffort ? 0 : clamp(ev.gain || 0, 0, GAME_CONFIG.scoring.maxGain);
      const p = lowEffort ? GAME_CONFIG.scoring.maxPenalty : clamp(ev.penalty || 0, 0, GAME_CONFIG.scoring.maxPenalty);
      const net = Math.max(0, g - p);

      const og = clamp(ev.opponent_gain || 0, 0, GAME_CONFIG.scoring.maxOppGain);
      const op2 = clamp(ev.opponent_penalty || 0, 0, GAME_CONFIG.scoring.maxOppPenalty);
      const oNet = Math.max(0, og - op2);

      // Player's damage to the opponent's HP uses the flat, game-wide
      // multiplier — it's not something any one debot's stats should
      // affect. This paces the HP bar; it is NOT the score. Points scored
      // (pPts) use the judge's raw `net` directly, same number shown in
      // the "Gain − Penalty = net" breakdown, so the score you see always
      // matches the math you see. Multiplying points down to HP-damage
      // size (as this used to do) made every hit look tiny regardless of
      // how good the argument actually was — a "Strong" 30-net hit was
      // displayed as "+15", which never matched its own label.
      const calculatedNewOHP = Math.max(0, oHP - Math.floor(net * GAME_CONFIG.damage.playerMultiplier));
      const playerDmgDealt = oHP - calculatedNewOHP;
      setOHP(calculatedNewOHP);
      setPPts(x => x + net);
      if (net > 8) shakeEl("opp", net);

      // Set emotional reaction based on damage taken
      if (net >= 30) setEmotion("shocked");
      else if (net >= 15) setEmotion("angry");
      else setEmotion("neutral");

      // Save opponent's upcoming counter-damage for Phase 2 — same split as
      // above: oNet is the score, dmgDealt is only how much HP it costs.
      const oppDmgMultiplier = opp.multiplier ?? GAME_CONFIG.damage.opponentMultiplier;
      const newPHP = Math.max(0, pHP - Math.floor(oNet * oppDmgMultiplier));
      const oppDmgDealt = pHP - newPHP;
      setPendingOppDamage({ oNet, newPHP, dmgDealt: oppDmgDealt });

      // The AI is asked to self-report `impact` from its own gain/penalty,
      // but the client independently clamps those (and can zero them out
      // entirely via the low-effort backstop) — trusting the AI's label
      // after that meant the badge could say "Solid"/"Strong" even when
      // the actual, final net was 0. Recompute it here from the same
      // thresholds given in the prompt so the label always matches the
      // number actually shown.
      const impact =
        lowEffort ? "Ineffective" :
        net >= 35 ? "Devastating" :
        net >= 25 ? "Strong" :
        net >= 14 ? "Solid" :
        net >= 5 ? "Weak" : "Ineffective";

      const full = {
        ...ev,
        gain: g,
        penalty: p,
        net,
        oNet,
        impact,
        dmgDealt: playerDmgDealt,
        critique: lowEffort ? "That didn't actually engage with the argument — try addressing their point directly." : ev.critique,
      };
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
       setHistory(prev => [...prev, { round, oppArg, pArg: input, eval: lastEval, net: lastEval.net, oNet: 0, points: lastEval.net, oPoints: 0 }]);
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

    setHistory(prev => [...prev, { round, oppArg, pArg: input, eval: lastEval, net: lastEval.net, oNet: pendingOppDamage.oNet, points: lastEval.net, oPoints: pendingOppDamage.oNet }]);
  }
  
  // ── ITEMS (Insight, Ace Card, Confidence Pill) ──
  // Insight (formerly "Hint") — unlimited uses once the Insight Lens is
  // owned, but the analysis is per-round, not per-tap: closing and
  // reopening it in the same round just re-shows what's already cached
  // instead of burning another AI call for an identical answer.
  async function getInsight() {
    if (!inventory.insightLens || phase !== "player-turn") return;

    if (showHint) { setShowHint(false); return; } // second tap same round: just close it

    if (hintData && hintRound === round) { setShowHint(true); return; } // cached — no AI call

    setPhase("loading"); setLoadMsg("Analysing opponent argument…");
    const sys = `You are a debate coach. Identify logical fallacies and weak points in: "${oppArg}". Return ONLY JSON:
{"fallacies":[{"type":"name","text":"exact short phrase"}],"weak_points":["phrase1","phrase2"]}`;
    try {
      const d = JSON.parse(extractJSON(await callAI(sys, "Identify fallacies and weak points.")));
      setHintData(d); setHintRound(round); setShowHint(true);
    } catch {
      setApiError("Failed to generate insight.");
    }
    setPhase("player-turn");
  }

  // Ace Card ("Show Answer") — spent from inventory bought in the Store.
  // No coin cost here; that was already paid at purchase time. The card is
  // only actually spent (useAceCard) once the AI call comes back — if Groq
  // errors or rate-limits, the player keeps their card instead of losing it
  // for nothing.
  async function getAns() {
    if (phase !== "player-turn" || inventory.aceCards <= 0) return;
    setPhase("loading"); setLoadMsg("Generating response options…");
    const sys = `You are an expert debate coach. The player (${curSide}) responds to: "${oppArg}". Topic: "${activeTopic?.text}". Return ONLY JSON:
{"options":[{"label":"Direct Counter","response":"2-3 sentence response","why":"brief reason"},{"label":"Analytical Attack","response":"2-3 sentence response","why":"brief reason"},{"label":"Reframe","response":"2-3 sentence response","why":"brief reason"}]}`;
    try {
      const d = JSON.parse(extractJSON(await callAI(sys, "Give 3 options.")));
      setAnsData(d.options); setShowAns(true);
      await useAceCard();
    } catch {
      setApiError("Failed to generate answers. Your Ace Card wasn't spent — try again.");
    }
    setPhase("player-turn");
  }

  // Confidence Pill — instant heal, spent from inventory. No AI call, no
  // phase change, so it doesn't cost the player a beat mid-argument. Heal
  // amount comes from the admin-editable storeItems catalog (Admin → Store
  // → Items), falling back to the hardcoded config if that item's missing.
  async function useConfidencePillItem() {
    if (phase !== "player-turn") return;
    const ok = await useConfidencePill();
    if (!ok) return;
    const item = storeItems.find((i) => i.key === "confidence_pill");
    const healAmount = item?.healAmount ?? GAME_CONFIG.store.confidencePill.healAmount;
    setPHP(hp => clamp(hp + healAmount, 0, 100));
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

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: "var(--muted)", cursor: "default" }}>{profile.name}</button>
          <span className="badge" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}><DebucksIcon style={{ marginRight: 4 }} />{profile.coins}</span>
        </div>

        <h2 className="heading" style={{ fontSize: 30, marginBottom: 22 }}>Select Debot</h2>

        {/* Zig-Zag Debot Layout */}
        {oppsLoading ? (
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 22 }}>Loading debots…</p>
        ) : (
          <DebotStage
            opps={opps}
            selectedOpp={opp}
            onSelect={(o: any) => setOpp(o)}
            onUnlock={unlockDebot}
            profile={profile}
          />
        )}

        {/* ── Rounds & Topic ── */}
        <div style={{ fontSize: 12, color: "var(--muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Number of Rounds</div>
        <div style={{ display: "flex", gap: 9, marginBottom: 26, flexWrap: "wrap" }}>
          {!settingsLoaded ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>
          ) : roundOptions.map(r => (
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                ✦ AI Suggestions
              </div>
              <button
                onClick={() => setAiSuggestions(null)}
                title="Close"
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: 14, lineHeight: 1, color: "var(--muted)" }}
              >
                ✕
              </button>
            </div>
            {aiSuggestions.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>No suggestions came back — try a different phrase.</div>
            ) : aiSuggestions.map((s: any, i: number) => (
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

        {topicMenuOpenId && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 15 }}
            onClick={() => { setTopicMenuOpenId(null); setTopicDeleteConfirmId(null); }}
          />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10, maxHeight: 240, overflowY: "auto" }}>
          {topicsLoading ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading topics…</p>
          ) : visibleTopics.map((t: any, i: number) => {
            const sel = !useCustom && topic?.id === t.id;
            const pinned = pinnedTopicIds.includes(t.id);
            const prevPinned = i > 0 && pinnedTopicIds.includes(visibleTopics[i - 1].id);
            const showDivider = i > 0 && prevPinned && !pinned;
            const menuOpen = topicMenuOpenId === t.id;
            const confirmingDelete = topicDeleteConfirmId === t.id;

            return (
              <div key={t.id}>
                {showDivider && (
                  <div style={{ height: 1, background: "var(--border)", opacity: 0.6, margin: "3px 10px" }} />
                )}
                <div className="card" style={{ padding: "11px 14px", borderColor: sel ? "var(--blue)" : "var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: sel ? 10 : 0 }} onClick={() => { setTopic(t); setUseCustom(false); }}>
                    <span style={{ fontSize: 14, color: sel ? "var(--blue)" : "var(--text)", flex: 1, minWidth: 0 }}>{t.text}</span>
                    {pinned && (
                      <span style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>Pinned</span>
                    )}
                    <span className="badge" style={{ background: "var(--faint)", color: "var(--muted)", fontSize: 10, flexShrink: 0 }}>{t.cat}</span>

                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); setTopicDeleteConfirmId(null); setTopicMenuOpenId(menuOpen ? null : t.id); }}
                        title="Options"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: 15, lineHeight: 1, color: "var(--muted)" }}
                      >
                        ⋮
                      </button>

                      {menuOpen && (
                        <div
                          onClick={e => e.stopPropagation()}
                          style={{
                            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20,
                            background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8,
                            minWidth: 150, overflow: "hidden", boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                          }}
                        >
                          {!confirmingDelete ? (
                            <>
                              <button
                                onClick={() => { toggleTopicPin(t.id); setTopicMenuOpenId(null); }}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "var(--text)" }}
                              >
                                {pinned ? "Unpin" : "Pin"}
                              </button>
                              <button
                                onClick={() => setTopicDeleteConfirmId(t.id)}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer", fontSize: 12.5, color: "var(--red)" }}
                              >
                                {t.is_system ? "Remove from my list" : "Delete topic"}
                              </button>
                            </>
                          ) : (
                            <div style={{ padding: "9px 12px" }}>
                              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
                                {t.is_system ? "Remove this topic from your list?" : "Delete this topic?"}
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ flex: 1, fontSize: 11.5 }}
                                  onClick={() => setTopicDeleteConfirmId(null)}
                                >
                                  Cancel
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  style={{ flex: 1, fontSize: 11.5 }}
                                  onClick={async () => {
                                    if (sel) { setTopic(null); }
                                    setTopicMenuOpenId(null);
                                    setTopicDeleteConfirmId(null);
                                    await deleteTopic(t);
                                  }}
                                >
                                  {t.is_system ? "Remove" : "Delete"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {sel && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", animation: "fadeIn 0.2s" }}>
                      <button className={`btn btn-sm ${topicSide === "FOR" ? "btn-primary" : "btn-ghost"}`} onClick={e => { e.stopPropagation(); setTopicSide("FOR"); }}>▲ For</button>
                      <button className={`btn btn-sm ${topicSide === "AGAINST" ? "btn-danger" : "btn-ghost"}`} onClick={e => { e.stopPropagation(); setTopicSide("AGAINST"); }}>▼ Against</button>
                    </div>
                  )}
                </div>
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
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => requestNavigation(() => setPage("setup"))}>← Exit</button>
            <div style={{ fontSize: 12, color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{activeTopic?.text}"</div>
            <span className="badge" style={{ background: "var(--faint)", color: "var(--muted)" }}>R {round}/{rounds}</span>
            <span className="badge" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}><DebucksIcon style={{ marginRight: 4 }} />{profile.coins}</span>
          </div>
          <AdvBar pPts={pPts} oPts={oPts} pLabel={profile.name} oLabel={opp?.name} />
        </div>

        {/* Fighters */}
        {(() => {
          const oppHex = opp?.color || "#6b9fff";
          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", gap: 10, padding: "8px 0" }}>

              {/* Player */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="badge" style={{ background: "var(--blue-soft)", color: "var(--blue)", fontSize: 10, alignSelf: "flex-start" }}>{curSide}</span>
                <div style={{ height: 150, maxWidth: 150, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <div style={{ width: 130, height: 130, flexShrink: 0, transition: "transform 0.6s ease", transform: `scale(${pScale})`, transformOrigin: "center center" }}>
                    <PlayerSprite shake={shakeP} name={profile.name} avatarUrl={profile.avatar_url} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{profile.name}</span>
                    <span>{Math.round(pHP)}/100</span>
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
                    <span>{Math.round(clamp(oHP, 0, opp?.maxHP || 100))}/{opp?.maxHP || 100}</span>
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
                <div style={{ display: "flex", gap: 5 }}>{lastEval.tags?.map((t: any, i: number) => <span key={i} className="badge" style={{ background: "var(--surface2)", fontSize: 11 }}>{t}</span>)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--blue)" }}>+{lastEval.net} Pts</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>−{lastEval.dmgDealt} HP</div>
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
               <div style={{ textAlign: "right" }}>
                 <div style={{ fontSize: 16, fontWeight: 600, color: "var(--red)" }}>+{pendingOppDamage.oNet} Pts</div>
                 <div style={{ fontSize: 12, color: "var(--muted)" }}>−{pendingOppDamage.dmgDealt} HP</div>
               </div>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>The debot fired back, dealing damage to your HP.</div>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={advanceRound}>Next Round →</button>
          </div>
        )}

        {/* Insight Panel */}
        {showHint && hintData && phase === "player-turn" && (
          <div className="card anim-fade-up" style={{ padding: 14, borderColor: "rgba(245,166,35,0.3)", background: "var(--amber-soft)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>🔍 Insight</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowHint(false)}>×</button>
            </div>
            {hintData.fallacies?.map((f: any, i: number) => <div key={i} style={{ fontSize: 12, color: "var(--red)", marginBottom: 4 }}>⚠ <b>{f.type}</b>: "{f.text}"</div>)}
            {hintData.weak_points?.map((wp: any, i: number) => <div key={i} style={{ fontSize: 12, color: "var(--amber)", marginBottom: 4 }}>↗ "{wp}"</div>)}
          </div>
        )}

        {/* Answer Panel */}
        {showAns && ansData && phase === "player-turn" && (
          <div className="card anim-fade-up" style={{ padding: 16, borderColor: "rgba(107,159,255,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>✦ Suggested Responses</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowAns(false)}>×</button>
            </div>
            {ansData.map((opt: any, i: number) => (
              <div key={i} style={{ marginBottom: 10, padding: 12, background: "var(--surface2)", borderRadius: 6, borderLeft: "2px solid var(--blue)" }}>
                <div style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600, marginBottom: 4 }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.65, marginBottom: 5 }}>{opt.response}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>{opt.why}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setInput(opt.response); setShowAns(false); }}>Use this →</button>
              </div>
            ))}
          </div>
        )}

        {/* Items — Insight (unlimited while owned), Ace Cards / Confidence Pills bought in the Store */}
        {phase === "player-turn" && (
          <ItemsBar
            hasInsightLens={inventory.insightLens}
            insightActive={showHint}
            onUseInsight={getInsight}
            aceCards={inventory.aceCards}
            confidencePills={inventory.confidencePills}
            onUseAce={getAns}
            onUseConfidence={useConfidencePillItem}
          />
        )}

        {/* Input */}
        {phase === "player-turn" && (
          <InputPanel
            input={input}
            setInput={setInput}
            onSend={submitArg}
            isEvaluating={false}
            curSide={curSide}
            round={round}
            rounds={rounds}
            textRef={textRef}
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
    // opp.reward is calibrated for a "default length" match (defaultRounds),
    // so a 2-round match and a 30-round match shouldn't pay the same flat
    // amount — scale it by how many rounds were actually played.
    const roundsFactor = rounds / (defaultRounds || 10);
    const totalReward = won ? Math.max(1, Math.round(opp.reward * roundsFactor)) + GAME_CONFIG.bonus.noPenalty : 0;

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
          ) : history.map((h: any, i: number) => {
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
                    <div style={{ fontSize: 13, color: "var(--blue)", fontWeight: 600 }}>+{h.points ?? h.net ?? 0} you</div>
                    <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>+{h.oPoints ?? h.oNet ?? 0} them</div>
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
                    {h.eval.fallacies.map((f: any, fi: number) => (
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
