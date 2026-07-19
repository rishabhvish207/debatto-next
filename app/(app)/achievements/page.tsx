"use client";

// Achievements — read-only gallery of the admin-editable achievement
// catalog (Admin → Achievements), showing which ones this player has
// unlocked. Unlocking itself happens automatically via GameContext's
// checkAchievements(), called after matches and purchases — this page only
// displays state, it never grants anything itself.
//
// Tiered achievements (sharing a groupKey) collapse to a single row showing
// only the lowest tier not yet completed — tapping it expands the full
// ladder, each tier colored up the TIER_COLORS ramp as it's cleared.

import { useGame } from "@/contexts/GameContext";
import { useState } from "react";
import { displayName, tierColor } from "@/config/Achievements";

export default function AchievementsPage() {
  const { achievements, achievementsLoading, unlockedAchievementIds, opps } = useGame();
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const active = achievements.filter((a) => a.active);

  // Group by groupKey — ungrouped achievements are their own "group of one."
  const groups = new Map<string, typeof active>();
  for (const a of active) {
    const key = a.groupKey || `__solo_${a.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const groupList = Array.from(groups.entries()).map(([key, members]) => {
    const sorted = [...members].sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1));
    const unlockedCount = sorted.filter((a) => unlockedAchievementIds.includes(a.id)).length;
    const isGroup = !!sorted[0].groupKey;
    // The "headline" tier for a collapsed row: the lowest not-yet-cleared
    // tier, or the top tier if every tier's already done.
    const headline = sorted[unlockedCount] || sorted[sorted.length - 1];
    return { key, sorted, unlockedCount, isGroup, headline, allDone: unlockedCount === sorted.length };
  });

  const unlockedTotal = groupList.filter((g) => g.unlockedCount > 0).length;

  const visible = groupList.filter((g) => {
    if (filter === "unlocked") return g.unlockedCount > 0;
    if (filter === "locked") return g.unlockedCount === 0;
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
      case "no_item_win_difficulty": return `Beat a ${cfg.difficulty || "?"}-tier debot without using any item`;
      case "win_streak": return `Win ${cfg.count || 2} matches in a row`;
      case "item_maxed": {
        const label = cfg.itemKey === "confidence_pill" ? "Confidence Pills" : cfg.itemKey === "revival_shot" ? "Revival Shots" : "Ace Cards";
        return `Hold ${label} at max stock`;
      }
      case "insight_lens_owned": return "Unlock the Insight Lens";
      case "total_debucks_earned": return `Earn ${cfg.count || 1} debucks in total`;
      case "total_debucks_spent": return `Spend ${cfg.count || 1} debucks in total`;
      case "all_debots_unlocked": return "Unlock every debot";
      case "themes_owned": return (cfg.count || 1) <= 1 ? "Buy your first theme" : `Own ${cfg.count} themes`;
      case "daily_challenges_completed": return `Complete ${cfg.count || 1} Daily Challenges in total`;
      case "manual": return "Granted by an admin";
      default: return "";
    }
  }

  function toggleExpand(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="root" style={{ padding: "20px 16px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 className="heading" style={{ fontSize: 26 }}>Achievements</h2>
        <span className="badge" style={{ background: "var(--faint)", color: "var(--muted)" }}>
          {unlockedTotal} / {groupList.length}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
        Unlock achievements by playing debots and using the store — some reward debucks, and a few unlock exclusive
        themes. Tiered achievements show only the next tier until you clear it.
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
          {visible.map((g) => {
            const a = g.headline;
            const unlocked = unlockedAchievementIds.includes(a.id);
            const expanded = expandedGroups.has(g.key);
            const color = g.allDone ? tierColor(g.sorted.length) : tierColor(a.tier);
            return (
              <div key={g.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  onClick={g.isGroup ? () => toggleExpand(g.key) : undefined}
                  style={{ padding: 14, display: "flex", gap: 12, alignItems: "center", opacity: unlocked ? 1 : 0.6, cursor: g.isGroup ? "pointer" : "default" }}
                >
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: unlocked ? `${color}33` : "var(--faint)",
                      border: unlocked ? `1.5px solid ${color}` : "1.5px solid transparent",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                      filter: unlocked ? "none" : "grayscale(1)",
                      transition: "background .2s, border-color .2s",
                    }}
                  >
                    {unlocked ? a.icon : "🔒"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: unlocked ? color : "var(--text)" }}>
                      {displayName(a)}
                      {g.isGroup && <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}>{g.unlockedCount}/{g.sorted.length}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{a.description || conditionHint(a)}</div>
                    {!unlocked && a.conditionType !== "manual" && (
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>{conditionHint(a)}</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <div>
                      {a.rewardDebucks > 0 && (
                        <div style={{ fontSize: 12, color: "var(--amber)", fontWeight: 700 }}>+{a.rewardDebucks}</div>
                      )}
                      {unlocked && <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 600, marginTop: 2 }}>✓ Unlocked</div>}
                    </div>
                    {g.isGroup && <span style={{ color: "var(--muted)", fontSize: 12, transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>}
                  </div>
                </div>

                {g.isGroup && expanded && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "8px 14px 12px" }}>
                    {g.sorted.map((tierA) => {
                      const tierUnlocked = unlockedAchievementIds.includes(tierA.id);
                      const tc = tierColor(tierA.tier);
                      return (
                        <div key={tierA.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", opacity: tierUnlocked ? 1 : 0.55 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: tierUnlocked ? tc : "var(--muted)", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: tierUnlocked ? tc : "var(--text)" }}>{displayName(tierA)}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{tierA.description || conditionHint(tierA)}</div>
                          </div>
                          {tierUnlocked ? (
                            <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>✓</span>
                          ) : (
                            tierA.rewardDebucks > 0 && <span style={{ fontSize: 11, color: "var(--amber)" }}>+{tierA.rewardDebucks}</span>
                          )}
                        </div>
                      );
                    })}
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
