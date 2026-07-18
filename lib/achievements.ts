// lib/achievements.ts
//
// Pure, dependency-free evaluator: given the achievement catalog, which ones
// a user already has, and a snapshot of their match history + inventory, it
// returns whichever *new* achievements just became satisfied. GameContext
// calls this after a match ends or an item is purchased and handles the
// actual persistence/reward-granting side effects — kept separate so the
// condition logic itself stays easy to test and reason about.

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

export type AchievementEvalContext = {
  matchHistory: MatchRecord[]; // chronological ascending order
  inventory: { insightLens: boolean; aceCards: number; confidencePills: number };
  storeItems: { key: string; maxStock: number | null }[];
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
      return false;
    }
    case "insight_lens_owned":
      return !!ctx.inventory.insightLens;
    case "manual":
    default:
      return false; // manual achievements are never auto-unlocked
  }
}

/** Returns the subset of `achievements` that are active, not yet unlocked, and now satisfied. */
export function getNewlyUnlocked(
  achievements: AchievementDef[],
  unlockedIds: string[],
  ctx: AchievementEvalContext
): AchievementDef[] {
  return achievements.filter(
    (a) => a.active && a.conditionType !== "manual" && !unlockedIds.includes(a.id) && conditionMet(a, ctx)
  );
}
