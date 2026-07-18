"use client";

// Achievements — read-only gallery of the admin-editable achievement
// catalog (Admin → Achievements), showing which ones this player has
// unlocked. Unlocking itself happens automatically via GameContext's
// checkAchievements(), called after matches and item purchases — this page
// only displays state, it never grants anything itself.

import { useGame } from "@/contexts/GameContext";
import { useState } from "react";

export default function AchievementsPage() {
  const { achievements, achievementsLoading, unlockedAchievementIds, opps } = useGame();
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");

  const active = achievements.filter((a) => a.active);
  const unlockedCount = active.filter((a) => unlockedAchievementIds.includes(a.id)).length;

  const visible = active.filter((a) => {
    const isUnlocked = unlockedAchievementIds.includes(a.id);
    if (filter === "unlocked") return isUnlocked;
    if (filter === "locked") return !isUnlocked;
    return true;
  });

  function debotName(debotId: any) {
    return opps.find((o: any) => String(o.id) === String(debotId))?.name || null;
  }

  function conditionHint(a: any): string {
    const cfg = a.conditionConfig || {};
    switch (a.conditionType) {
      case "total_wins": return `Win ${cfg.count || 1} matches total`;
      case "debot_defeat": return cfg.debotId != null ? `Defeat ${debotName(cfg.debotId) || "this debot"}` : "Defeat a specific debot";
      case "no_item_win": return cfg.debotId != null ? `Beat ${debotName(cfg.debotId) || "this debot"} without using an item` : "Win a match without using any item";
      case "win_streak": return `Win ${cfg.count || 2} matches in a row`;
      case "item_maxed": {
        if (cfg.itemKey === "confidence_pill") return "Hold Confidence Pills at max stock";
        if (cfg.itemKey === "revival_shot") return "Hold Revival Shots at max stock";
        return "Hold Ace Cards at max stock";
      }
      case "insight_lens_owned": return "Unlock the Insight Lens";
      case "manual": return "Granted by an admin";
      default: return "";
    }
  }

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 className="heading" style={{ fontSize: 26 }}>Achievements</h2>
        <span className="badge" style={{ background: "var(--faint)", color: "var(--muted)" }}>
          {unlockedCount} / {active.length}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
        Unlock achievements by playing debots and using the store — some reward debucks, and a few unlock exclusive themes.
      </p>

      <div style={{ display: "inline-flex", gap: 4, background: "var(--faint)", borderRadius: 999, padding: 3, marginBottom: 18 }}>
        {(["all", "unlocked", "locked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              border: "none", cursor: "pointer", borderRadius: 999,
              padding: "5px 14px", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
              background: filter === f ? "var(--surface2)" : "transparent",
              color: filter === f ? "var(--text)" : "var(--muted)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {achievementsLoading ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading achievements…</p>
      ) : visible.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏅</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing here yet</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((a) => {
            const unlocked = unlockedAchievementIds.includes(a.id);
            return (
              <div
                key={a.id}
                className="card"
                style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", opacity: unlocked ? 1 : 0.6 }}
              >
                <div
                  style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: unlocked ? "var(--amber-soft)" : "var(--faint)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                    filter: unlocked ? "none" : "grayscale(1)",
                  }}
                >
                  {unlocked ? a.icon : "🔒"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{a.description || conditionHint(a)}</div>
                  {!unlocked && a.conditionType !== "manual" && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>{conditionHint(a)}</div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {a.rewardDebucks > 0 && (
                    <div style={{ fontSize: 12, color: "var(--amber)", fontWeight: 700 }}>+{a.rewardDebucks}</div>
                  )}
                  {unlocked && <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 600, marginTop: 2 }}>✓ Unlocked</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
