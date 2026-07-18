// config/Achievements.ts
//
// Achievements are admin-editable (Admin → Achievements), same pattern as
// store_items/store_themes: a public-read catalog table, with this file
// only used as a fallback if that table is empty/unreachable.
//
// Every achievement has a `conditionType` that lib/achievements.ts knows how
// to auto-evaluate against match history + inventory, EXCEPT "manual" —
// those are never auto-unlocked and only granted by an admin by hand (Admin
// → Achievements → Manual Grants). That's the escape hatch for "variety":
// an admin can create a themed/cosmetic achievement for anything without a
// developer having to hardcode a new condition type for it.

export type AchievementConditionType =
  | "total_wins"        // config: { count }                          — win N matches total, any debot
  | "debot_defeat"       // config: { debotId }                        — beat one specific debot at least once
  | "no_item_win"        // config: { debotId? }                       — win a match without using any item (Insight, Ace Card, Confidence Pill). debotId omitted = any debot
  | "win_streak"         // config: { count }                          — N consecutive wins in a row
  | "item_maxed"         // config: { itemKey: "ace_card"|"confidence_pill" } — hold that consumable at its max stock at once
  | "insight_lens_owned" // config: {}                                 — own the Insight Lens
  | "manual";            // config: {}                                 — never auto-unlocked; admin grants by hand

export const CONDITION_TYPE_META: Record<AchievementConditionType, { label: string; needsCount?: boolean; needsDebot?: boolean; needsItemKey?: boolean; hint: string }> = {
  total_wins: { label: "Total wins", needsCount: true, hint: "Unlocks after winning this many matches total, against any debot." },
  debot_defeat: { label: "Defeat a specific debot", needsDebot: true, hint: "Unlocks the first time this debot is beaten." },
  no_item_win: { label: "Win without using an item", needsDebot: true, hint: "Win a match without using Insight, an Ace Card, or a Confidence Pill. Leave debot blank for 'any debot'." },
  win_streak: { label: "Win streak", needsCount: true, hint: "Unlocks after this many consecutive wins in a row (any debot)." },
  item_maxed: { label: "Hold an item at max stock", needsItemKey: true, hint: "Unlocks the moment a consumable is bought up to its max stock cap." },
  insight_lens_owned: { label: "Own the Insight Lens", hint: "Unlocks the moment the Insight Lens gear is purchased." },
  manual: { label: "Manual (admin-granted only)", hint: "Never unlocks automatically — grant it to a specific player from Admin → Achievements → Manual Grants." },
};

export type AchievementDef = {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  conditionType: AchievementConditionType;
  conditionConfig: Record<string, any>;
  rewardDebucks: number;
  rewardThemeId: string | null;
  active: boolean;
  sortOrder: number;
};

// Used only if the `achievements` table hasn't been migrated yet, or the
// fetch fails — keeps the Achievements page from showing nothing at all.
export const DEFAULT_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "default-first-blood",
    key: "first_blood",
    name: "First Blood",
    description: "Win your first debate.",
    icon: "🏆",
    conditionType: "total_wins",
    conditionConfig: { count: 1 },
    rewardDebucks: 10,
    rewardThemeId: null,
    active: true,
    sortOrder: 0,
  },
  {
    id: "default-on-a-roll",
    key: "on_a_roll",
    name: "On a Roll",
    description: "Win 3 matches in a row.",
    icon: "🔥",
    conditionType: "win_streak",
    conditionConfig: { count: 3 },
    rewardDebucks: 20,
    rewardThemeId: null,
    active: true,
    sortOrder: 1,
  },
  {
    id: "default-clean-sweep",
    key: "clean_sweep",
    name: "Clean Sweep",
    description: "Win a match without using any item.",
    icon: "🧠",
    conditionType: "no_item_win",
    conditionConfig: {},
    rewardDebucks: 25,
    rewardThemeId: null,
    active: true,
    sortOrder: 2,
  },
  {
    id: "default-ace-hoarder",
    key: "ace_hoarder",
    name: "Ace Hoarder",
    description: "Buy Ace Cards up to the max stock at once.",
    icon: "🂡",
    conditionType: "item_maxed",
    conditionConfig: { itemKey: "ace_card" },
    rewardDebucks: 15,
    rewardThemeId: null,
    active: true,
    sortOrder: 3,
  },
  {
    id: "default-third-eye",
    key: "third_eye",
    name: "Third Eye",
    description: "Unlock the Insight Lens.",
    icon: "🔍",
    conditionType: "insight_lens_owned",
    conditionConfig: {},
    rewardDebucks: 10,
    rewardThemeId: null,
    active: true,
    sortOrder: 4,
  },
  {
    id: "default-veteran",
    key: "veteran",
    name: "Veteran Debater",
    description: "Win 25 matches total.",
    icon: "🎖",
    conditionType: "total_wins",
    conditionConfig: { count: 25 },
    rewardDebucks: 100,
    rewardThemeId: null,
    active: true,
    sortOrder: 5,
  },
];
