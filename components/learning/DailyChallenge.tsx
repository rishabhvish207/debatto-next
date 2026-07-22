"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { createClient } from "@/utils/supabase/client";
import { DebucksIcon } from "@/components/ui/DebucksIcon";
import { AppIcon } from "@/components/ui/AppIcon";
import { CheckCircle2, XCircle, Trophy, Puzzle } from "lucide-react";
import { todayUTC, GUEST_COMPLETIONS_KEY, GUEST_TODAY_RESULT_PREFIX } from "@/lib/dailyChallengeStatus";

const supabase = createClient();

type PublicQuestion = { text: string; options: [string, string, string, string] };
type SubmitResult = { correctCount: number; totalQuestions: number; score: number; rewardPerCorrect: number; results: { correct: boolean; correctIndex: number }[] };

type Phase = "loading" | "intro" | "already-done" | "in-progress" | "submitting" | "results" | "error";

export function DailyChallenge() {
  const { user, earnCoins, checkAchievements, dailyChallengeRewardPerCorrect, setBattleActive, setNavGuardMessage } = useGame();

  const [phase, setPhase] = useState<Phase>("loading");
  const [challengeDate, setChallengeDate] = useState("");
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
    // Leaving the tab mid-quiz shouldn't be free of consequence even
    // outside this app's own nav-guard (which only catches in-app links) —
    // this catches an actual tab close/refresh.
    return () => { setBattleActive(false); };
  }, []);

  async function load() {
    setPhase("loading");
    setError("");
    try {
      const res = await fetch("/api/daily-challenge");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load today's challenge.");
      setChallengeDate(data.challengeDate);
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(null));

      const already = await checkAlreadyDone(data.challengeDate);
      setPhase(already ? "already-done" : "intro");
    } catch (err: any) {
      setError(err?.message || "Couldn't load today's challenge.");
      setPhase("error");
    }
  }

  async function checkAlreadyDone(date: string): Promise<boolean> {
    if (user) {
      const { data } = await supabase
        .from("daily_challenge_attempts")
        .select("score, correct_count, total_questions")
        .eq("user_id", user.id)
        .eq("challenge_date", date)
        .maybeSingle();
      if (data) {
        setResult({ correctCount: data.correct_count, totalQuestions: data.total_questions, score: data.score, rewardPerCorrect: dailyChallengeRewardPerCorrect, results: [] });
        return true;
      }
      return false;
    }
    // Guest: check localStorage for today's date.
    try {
      const raw = localStorage.getItem(GUEST_TODAY_RESULT_PREFIX + date);
      if (raw) { setResult(JSON.parse(raw)); return true; }
    } catch {}
    return false;
  }

  function start() {
    setCurrent(0);
    setAnswers(new Array(questions.length).fill(null));
    setBattleActive(true);
    setNavGuardMessage({
      title: "Leave the Daily Challenge?",
      message: "Leaving now forfeits today's attempt — you won't be able to retry until tomorrow.",
    });
    setPhase("in-progress");
  }

  function selectAnswer(optionIndex: number) {
    const next = [...answers];
    next[current] = optionIndex;
    setAnswers(next);
    if (current + 1 < questions.length) {
      setCurrent(current + 1);
    } else {
      submit(next);
    }
  }

  async function submit(finalAnswers: (number | null)[]) {
    setPhase("submitting");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/daily-challenge/submit", {
        method: "POST",
        headers,
        body: JSON.stringify({ challengeDate, answers: finalAnswers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Submission failed.");

      setBattleActive(false);
      setResult(data);
      setPhase("results");

      if (data.score > 0) earnCoins(data.score);

      // Tally total completions for the tiered "Daily Devotee" achievement —
      // logged-in count comes from a real row count (server already wrote
      // today's attempt), guests get an honor-system localStorage tally,
      // same trust level as everything else guest-side in this app.
      let completedTotal = 0;
      if (user) {
        const { count } = await supabase
          .from("daily_challenge_attempts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        completedTotal = count || 0;
      } else {
        try {
          const raw = localStorage.getItem(GUEST_COMPLETIONS_KEY);
          const dates: string[] = raw ? JSON.parse(raw) : [];
          if (!dates.includes(challengeDate)) dates.push(challengeDate);
          localStorage.setItem(GUEST_COMPLETIONS_KEY, JSON.stringify(dates));
          completedTotal = dates.length;
        } catch {}
        try { localStorage.setItem(GUEST_TODAY_RESULT_PREFIX + challengeDate, JSON.stringify(data)); } catch {}
      }

      checkAchievements({ lifetimeEarnedDelta: data.score, dailyChallengesCompletedOverride: completedTotal }).catch(() => {});
    } catch (err: any) {
      setBattleActive(false);
      setError(err?.message || "Submission failed — please try again.");
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "40px 0" }}>Loading today's challenge…</div>;
  }

  if (phase === "error") {
    return (
      <div className="card" style={{ padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 12 }}>{error}</div>
        <button className="btn btn-primary btn-sm" onClick={load}>Try again</button>
      </div>
    );
  }

  if (phase === "already-done" && result) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><CheckCircle2 size={32} color="var(--green)" /></div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Today's challenge is done</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
          {result.correctCount} / {result.totalQuestions} correct
        </div>
        <div style={{ fontSize: 15, color: "var(--amber)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          +{result.score} <DebucksIcon />
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 14 }}>Come back tomorrow for a new set of questions.</div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><Puzzle size={32} color="var(--blue)" /></div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Daily Challenge</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4, lineHeight: 1.6 }}>
          10 questions on fallacies, counter-arguments, and debate judgment — the same set for everyone today,
          new tomorrow. {dailyChallengeRewardPerCorrect} debucks per correct answer.
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 18, fontStyle: "italic" }}>
          One attempt per day. Once you start, leaving forfeits it — no pausing to look things up.
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: "100%" }} onClick={start}>Start</button>
      </div>
    );
  }

  if (phase === "in-progress") {
    const q = questions[current];
    return (
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>Question {current + 1} / {questions.length}</div>
        <div style={{ height: 4, background: "var(--faint)", borderRadius: 2, marginBottom: 18, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((current + 1) / questions.length) * 100}%`, background: "var(--blue)", transition: "width .2s" }} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, lineHeight: 1.6 }}>{q.text}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => selectAnswer(i)}
              className="btn btn-ghost"
              style={{ textAlign: "left", padding: "12px 14px", fontSize: 13, fontWeight: 500, lineHeight: 1.5, whiteSpace: "normal", height: "auto" }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "40px 0" }}>Grading…</div>;
  }

  if (phase === "results" && result) {
    return (
      <div>
        <div className="card" style={{ padding: 24, textAlign: "center", marginBottom: 16 }}>
          <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>{result.correctCount === result.totalQuestions ? <Trophy size={32} color="var(--amber)" /> : <Puzzle size={32} color="var(--blue)" />}</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{result.correctCount} / {result.totalQuestions} correct</div>
          <div style={{ fontSize: 15, color: "var(--amber)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            +{result.score} <DebucksIcon />
          </div>
        </div>
        {result.results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {questions.map((q, i) => {
              const r = result.results[i];
              return (
                <div key={i} className="card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span style={{ display: "flex" }}>{r.correct ? <CheckCircle2 size={15} color="var(--green)" /> : <XCircle size={15} color="var(--red)" />}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{q.text}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--green)", marginLeft: 21 }}>{q.options[r.correctIndex]}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}
