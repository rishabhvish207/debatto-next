"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { loadGameData } from "@/lib/persistenceManager";

export default function HistoryPage() {
  const { user, opps, setApiError } = useGame();

  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedMatchId, setExpandedMatchId] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      const res = await loadGameData("history", user);
      if (cancelled) return;
      if (!res.ok) {
        console.error(res.error);
        setApiError("Failed to load match history. See console for details.");
        setMatchHistory([]);
        setHistoryLoading(false);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      // Guest-mode entries are appended in save order; DB entries already
      // come back newest-first from readHistory's own query ordering.
      setMatchHistory(user ? list : [...list].reverse());
      setHistoryLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Normalizes a match record regardless of whether it came from Supabase
  // (snake_case columns + embedded relations) or a guest's localStorage
  // cache (camelCase, no embed) into one shape the UI can render.
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

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 720, margin: "0 auto" }}>
      <h2 className="heading" style={{ fontSize: 22, marginBottom: 20 }}>Match History</h2>

      {historyLoading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : matchHistory.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>No matches yet — finish a debate and it'll show up here.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {matchHistory.map((raw: any) => {
            const m = normalizeMatch(raw);
            const resultColor = m.result === "win" ? "var(--blue)" : m.result === "loss" ? "var(--red)" : "var(--muted)";
            const resultLabel = m.result === "win" ? "Victory" : m.result === "loss" ? "Defeat" : "Draw";
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
      )}
    </div>
  );
}
