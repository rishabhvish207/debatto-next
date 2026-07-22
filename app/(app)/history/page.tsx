"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { loadGameData, loadOnlineHistory, loadDailyHistory } from "@/lib/persistenceManager";

type Tab = "debot" | "online" | "daily";

export default function HistoryPage() {
  const { user, opps, setApiError } = useGame();

  const [tab, setTab] = useState<Tab>("debot");

  const [debotHistory, setDebotHistory] = useState<any[]>([]);
  const [debotLoading, setDebotLoading] = useState(true);
  const [onlineHistory, setOnlineHistory] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [dailyHistory, setDailyHistory] = useState<any[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);

  const [expandedMatchId, setExpandedMatchId] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDebotLoading(true);
      const res = await loadGameData("history", user);
      if (cancelled) return;
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to load match history. See console for details.");
        setDebotHistory([]);
        setDebotLoading(false);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      // Guest-mode entries are appended in save order; DB entries already
      // come back newest-first from readHistory's own query ordering.
      setDebotHistory(user ? list : [...list].reverse());
      setDebotLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOnlineLoading(true);
      const res = await loadOnlineHistory(user);
      if (!cancelled) {
        if (!res.ok) console.error(res.error);
        setOnlineHistory(res.ok && Array.isArray(res.data) ? res.data : []);
        setOnlineLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDailyLoading(true);
      const res = await loadDailyHistory(user);
      if (!cancelled) {
        if (!res.ok) console.error(res.error);
        setDailyHistory(res.ok && Array.isArray(res.data) ? res.data : []);
        setDailyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Normalizes a debot-match record regardless of whether it came from
  // Supabase (snake_case columns + embedded relations) or a guest's
  // localStorage cache (camelCase, no embed) into one shape the UI can render.
  function normalizeMatch(m: any) {
    if (!user) {
      const debot = opps.find((o: any) => o.id === m.debotId);
      return {
        id: m.id,
        debotName: debot?.name || "Unknown Debot",
        debotColor: debot?.color || "var(--muted)",
        topicText: m.topicText,
        result: m.result,
        playerScore: m.playerScore,
        opponentScore: m.opponentScore,
        createdAt: m.createdAt,
        rounds: (m.rounds || []).map((r: any) => ({
          round: r.round,
          pArg: r.pArg,
          oppArg: r.oppArg,
          net: r.net,
          oNet: r.oNet,
          impact: r.eval?.impact,
        })),
      };
    }
    return {
      id: m.id,
      debotName: m.debots?.name || "Unknown Debot",
      debotColor: m.debots?.color || "var(--muted)",
      topicText: m.topic_text,
      result: m.result,
      playerScore: m.player_score,
      opponentScore: m.opponent_score,
      createdAt: m.created_at,
      rounds: (m.match_rounds || [])
        .slice()
        .sort((a: any, b: any) => a.round_number - b.round_number)
        .map((r: any) => ({
          round: r.round_number,
          pArg: r.player_argument,
          oppArg: r.opponent_argument,
          net: r.net,
          oNet: r.opponent_net,
          impact: r.impact,
        })),
    };
  }

  function resultMeta(result: string) {
    const color = result === "win" || result === "a_win" || result === "b_win"
      ? "var(--blue)"
      : result === "loss"
        ? "var(--red)"
        : "var(--muted)";
    const label = result === "win" ? "Victory" : result === "loss" ? "Defeat" : result === "draw" ? "Draw" : result;
    return { color, label };
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "debot", label: "Debots" },
    { key: "online", label: "Online" },
    { key: "daily", label: "Daily Challenge" },
  ];

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 720, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 22, marginBottom: 14 }}>Match History</h2>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="btn btn-ghost"
            style={{
              flex: 1, borderRadius: 0, borderBottom: tab === t.key ? "2px solid var(--blue)" : "2px solid transparent",
              color: tab === t.key ? "var(--text)" : "var(--muted)", fontWeight: tab === t.key ? 700 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "debot" && (
        debotLoading ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
        ) : debotHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No matches yet — finish a debate and it'll show up here.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {debotHistory.map((raw: any) => {
              const m = normalizeMatch(raw);
              const { color: resultColor, label: resultLabel } = resultMeta(m.result);
              const expanded = expandedMatchId === m.id;
              return (
                <div key={m.id} className="card" style={{ padding: 14 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    onClick={() => setExpandedMatchId(expanded ? null : m.id)}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      background: `${m.debotColor}20`, color: m.debotColor,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700,
                    }}>{m.debotName?.[0]?.toUpperCase() || "?"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        vs {m.debotName}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        "{m.topicText}"
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: resultColor }}>{resultLabel}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.playerScore} – {m.opponentScore}</div>
                    </div>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {m.rounds.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>No round detail saved for this match.</div>
                      ) : m.rounds.map((r: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, background: "var(--faint)", borderRadius: 6, padding: 10 }}>
                          <div style={{ color: "var(--muted)", marginBottom: 4 }}>
                            Round {r.round} {r.impact ? `· ${r.impact}` : ""}
                          </div>
                          <div style={{ marginBottom: 3 }}><b>You:</b> {r.pArg}</div>
                          <div style={{ marginBottom: 3 }}><b>{m.debotName}:</b> {r.oppArg}</div>
                          <div style={{ color: "var(--muted)" }}>+{r.net ?? 0} you · +{r.oNet ?? 0} them</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "online" && (
        !user ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Log in to see your online match history.</div>
        ) : onlineLoading ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
        ) : onlineHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No online matches yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {onlineHistory.map((m: any) => {
              const outcome = m.result === "draw" || m.my_score === m.opponent_score
                ? "draw"
                : m.my_score > m.opponent_score ? "win" : "loss";
              const { color: resultColor, label: resultLabel } = resultMeta(outcome);
              const expanded = expandedMatchId === m.id;
              return (
                <div key={m.id} className="card" style={{ padding: 14 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    onClick={() => setExpandedMatchId(expanded ? null : m.id)}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      background: "var(--faint)", color: "var(--muted)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700,
                    }}>{m.opponent_name?.[0]?.toUpperCase() || "?"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        vs {m.opponent_name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({m.mode === "friend" ? "Friend match" : "Random"})</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        "{m.topic_text}"
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: resultColor }}>{resultLabel}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {m.my_score} – {m.opponent_score}
                        {typeof m.my_prestige_delta === "number" && (
                          <span style={{ marginLeft: 6, color: m.my_prestige_delta >= 0 ? "var(--green, #2f9e58)" : "var(--red)" }}>
                            {m.my_prestige_delta >= 0 ? `+${m.my_prestige_delta}` : m.my_prestige_delta} prestige
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {(m.online_match_rounds || []).length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>No round detail saved for this match.</div>
                      ) : (m.online_match_rounds || [])
                        .slice()
                        .sort((a: any, b: any) => a.round_number - b.round_number)
                        .map((r: any) => {
                          const isA = m.is_player_a;
                          return (
                            <div key={r.id} style={{ fontSize: 12, background: "var(--faint)", borderRadius: 6, padding: 10 }}>
                              <div style={{ color: "var(--muted)", marginBottom: 4 }}>
                                Round {r.round_number} {r.impact ? `· ${r.impact}` : ""}
                              </div>
                              <div style={{ marginBottom: 3 }}><b>You:</b> {isA ? r.player_a_argument : r.player_b_argument}</div>
                              <div style={{ marginBottom: 3 }}><b>{m.opponent_name}:</b> {isA ? r.player_b_argument : r.player_a_argument}</div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "daily" && (
        !user ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Log in to see your Daily Challenge history.</div>
        ) : dailyLoading ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
        ) : dailyHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No Daily Challenge attempts yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dailyHistory.map((d: any) => (
              <div key={d.id} className="card" style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.challenge_date}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.correct_count} / {d.total_questions} correct</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)" }}>+{d.score}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
