// lib/achievements.ts
//
// Pure, dependency-free evaluator: given the achievement catalog, which ones
// a user already has, and a snapshot of their current stats/history/
// inventory, it returns whichever *new* achievements just became satisfied.
// GameContext calls this after a match ends or a purchase happens and
// handles the actual persistence/reward-granting side effects — kept
// separate so the condition logic itself stays easy to test and reason
// about.
//
// TIERING: achievements sharing a `groupKey` are evaluated together — the
// highest tier whose condition is met gets unlocked, AND every lower tier
// in that same group gets unlocked alongside it (even if that lower tier's
// own condition wasn't independently true), matching "clearing a harder
// tier claims the easier ones too."

import { AchievementDef } from "@/config/Achievements";

export type MatchRecord = {
  debotId: any;
  result: "win" | "loss" | "draw";
  usedItem: boolean;
  createdAt: string;
};

// Handles both the DB row shape (snake_case, from the `matches` table) and
// the guest localStorage shape (camelCase, written by GameContext's
// saveGameData("history", ...) calls) so callers don't have to care which
// backend a match record came from.
export function normalizeMatch(raw: any): MatchRecord {
  return {
    debotId: raw.debotId ?? raw.debot_id,
    result: raw.result,
    usedItem: !!(raw.usedItem ?? raw.used_item),
    createdAt: raw.createdAt ?? raw.created_at ?? "",
  };
}

// Same difficulty-bucket matching as app/(app)/offline/page.tsx's
// getDifficultyGuidance() — kept in sync deliberately since a debot's `diff`
// field is free text ("Beginner", "Hard", etc.) and this is the one place
// outside that judge-prompt builder that needs to bucket it the same way.
export function normalizeDifficulty(diff: string | undefined | null): "beginner" | "intermediate" | "advanced" | "expert" | "standard" {
  const key = (diff || "").toLowerCase();
  if (key.includes("beginner") || key.includes("easy")) return "beginner";
  if (key.includes("intermediate") || key.includes("medium")) return "intermediate";
  if (key.includes("advanced") || key.includes("hard")) return "advanced";
  if (key.includes("expert") || key.includes("master")) return "expert";
  return "standard";
}

export type AchievementEvalContext = {
  matchHistory: MatchRecord[]; // chronological ascending order
  inventory: { insightLens: boolean; aceCards: number; confidencePills: number; revivalShots: number };
  storeItems: { key: string; maxStock: number | null }[];
  debotDifficultyById: Record<string, string>; // debotId (as string) -> raw `diff` text
  lifetimeDebucksEarned: number;
  lifetimeDebucksSpent: number;
  unlockedDebotIds: string[];
  totalActiveDebotCount: number;
  ownedThemeCount: number;
};

function conditionMet(a: AchievementDef, ctx: AchievementEvalContext): boolean {
  const cfg = a.conditionConfig || {};
  switch (a.conditionType) {
    case "total_wins": {
      const need = Number(cfg.count) || 1;
      const wins = ctx.matchHistory.filter((m) => m.result === "win").length;
      return wins >= need;
    }
    case "debot_defeat": {
      if (cfg.debotId == null || cfg.debotId === "") return false;
      return ctx.matchHistory.some((m) => m.result === "win" && String(m.debotId) === String(cfg.debotId));
    }
    case "no_item_win": {
      const debotId = cfg.debotId != null && cfg.debotId !== "" ? cfg.debotId : null;
      return ctx.matchHistory.some(
        (m) => m.result === "win" && !m.usedItem && (debotId == null || String(m.debotId) === String(debotId))
      );
    }
    case "no_item_win_difficulty": {
      const tier = cfg.difficulty;
      if (!tier) return false;
      return ctx.matchHistory.some(
        (m) => m.result === "win" && !m.usedItem && normalizeDifficulty(ctx.debotDifficultyById[String(m.debotId)]) === tier
      );
    }
    case "win_streak": {
      const need = Number(cfg.count) || 2;
      let best = 0, cur = 0;
      for (const m of ctx.matchHistory) {
        if (m.result === "win") { cur += 1; best = Math.max(best, cur); }
        else cur = 0;
      }
      return best >= need;
    }
    case "item_maxed": {
      if (cfg.itemKey === "ace_card") {
        const max = ctx.storeItems.find((i) => i.key === "ace_card")?.maxStock ?? null;
        return max != null && ctx.inventory.aceCards >= max;
      }
      if (cfg.itemKey === "confidence_pill") {
        const max = ctx.storeItems.find((i) => i.key === "confidence_pill")?.maxStock ?? null;
        return max != null && ctx.inventory.confidencePills >= max;
      }
      if (cfg.itemKey === "revival_shot") {
        const max = ctx.storeItems.find((i) => i.key === "revival_shot")?.maxStock ?? null;
        return max != null && ctx.inventory.revivalShots >= max;
      }
      return false;
    }
    case "insight_lens_owned":
      return !!ctx.inventory.insightLens;
    case "total_debucks_earned": {
      const need = Number(cfg.count) || 1;
      return ctx.lifetimeDebucksEarned >= need;
    }
    case "total_debucks_spent": {
      const need = Number(cfg.count) || 1;
      return ctx.lifetimeDebucksSpent >= need;
    }
    case "all_debots_unlocked":
      return ctx.totalActiveDebotCount > 0 && ctx.unlockedDebotIds.length >= ctx.totalActiveDebotCount;
    case "themes_owned": {
      const need = Number(cfg.count) || 1;
      return ctx.ownedThemeCount >= need;
    }
    case "manual":
    default:
      return false; // manual achievements are never auto-unlocked
  }
}

/**
 * Returns the achievements that are active, not yet unlocked, and now
 * satisfied — grouped so that satisfying a higher tier also grants every
 * lower tier in the same group (see file header). Ungrouped achievements
 * are treated as a "group of one."
 */
export function getNewlyUnlocked(
  achievements: AchievementDef[],
  unlockedIds: string[],
  ctx: AchievementEvalContext
): AchievementDef[] {
  const groups = new Map<string, AchievementDef[]>();
  for (const a of achievements) {
    if (!a.active) continue;
    const key = a.groupKey || `__solo_${a.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const newly: AchievementDef[] = [];
  for (const members of groups.values()) {
    const sorted = [...members].sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1));
    let highestSatisfiedIdx = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].conditionType === "manual") continue;
      if (conditionMet(sorted[i], ctx)) highestSatisfiedIdx = i;
    }
    for (let i = 0; i <= highestSatisfiedIdx; i++) {
      if (!unlockedIds.includes(sorted[i].id)) newly.push(sorted[i]);
    }
  }
  return newly;
}
