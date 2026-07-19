// config/Achievements.ts
//
// Achievements are admin-editable (Admin → Achievements), same pattern as
// store_items/store_themes: a public-read catalog table, with this file
// only used as a fallback if that table is empty/unreachable.
//
// Every achievement has a `conditionType` that lib/achievements.ts knows how
// to auto-evaluate, EXCEPT "manual" — those are never auto-unlocked and only
// granted by an admin by hand (Admin → Achievements → Manual Grants). That's
// the escape hatch for "variety": an admin can create a themed/cosmetic
// achievement for anything without a developer having to hardcode a new
// condition type for it.
//
// TIERED ACHIEVEMENTS: any achievement can optionally belong to a group
// (`groupKey`) with a `tier` (1, 2, 3…) — e.g. four separate rows all with
// groupKey "clean_sweep" and tier 1/2/3/4. lib/achievements.ts evaluates
// every tier in a group and, the moment ANY tier's condition is met, grants
// that tier AND every lower tier in the same group at once (so clearing the
// hardest tier claims the easier ones too, even if their own condition
// technically wasn't separately satisfied — e.g. beating the Master debot
// clean doesn't require ever having beaten a Beginner one). Achievements
// with no groupKey behave exactly as a single, ungrouped achievement always
// did. Display name convention for a tiered achievement is "<name> <ROMAN
// NUMERAL>" (e.g. "Clean Sweep III") — the numeral is derived from `tier`,
// not stored in `name` itself, so admins only ever edit the base name once.

export type AchievementConditionType =
  | "total_wins"            // config: { count }                          — win N matches total, any debot
  | "debot_defeat"           // config: { debotId }                        — beat one specific debot at least once
  | "no_item_win"            // config: { debotId? }                       — win a match without using any item. debotId omitted = any debot
  | "no_item_win_difficulty" // config: { difficulty: "beginner"|"intermediate"|"advanced"|"expert" } — win without an item vs any debot of that difficulty tier
  | "win_streak"             // config: { count }                          — N consecutive wins in a row
  | "item_maxed"             // config: { itemKey: "ace_card"|"confidence_pill"|"revival_shot" } — hold that consumable at its max stock at once
  | "insight_lens_owned"     // config: {}                                 — own the Insight Lens
  | "total_debucks_earned"   // config: { count }                          — lifetime debucks earned (wins + achievement rewards — NOT current balance, and NOT the admin cheat)
  | "total_debucks_spent"    // config: { count }                          — lifetime debucks spent in the Store
  | "all_debots_unlocked"    // config: {}                                 — own every debot in the catalog
  | "themes_owned"           // config: { count }                          — own at least this many themes (count:1 = "buy your first theme")
  | "daily_challenges_completed" // config: { count }                      — total Daily Challenges ever completed (not necessarily consecutive)
  | "manual";                // config: {}                                 — never auto-unlocked; admin grants by hand

export const CONDITION_TYPE_META: Record<AchievementConditionType, { label: string; needsCount?: boolean; needsDebot?: boolean; needsItemKey?: boolean; needsDifficulty?: boolean; hint: string }> = {
  total_wins: { label: "Total wins", needsCount: true, hint: "Unlocks after winning this many matches total, against any debot." },
  debot_defeat: { label: "Defeat a specific debot", needsDebot: true, hint: "Unlocks the first time this debot is beaten." },
  no_item_win: { label: "Win without using an item", needsDebot: true, hint: "Win a match without using Insight, an Ace Card, a Confidence Pill, or a Revival Shot. Leave debot blank for 'any debot'." },
  no_item_win_difficulty: { label: "Win without an item, by difficulty", needsDifficulty: true, hint: "Win without using any item against any debot of this difficulty tier — the usual way to build a tiered family (Beginner/Intermediate/Advanced/Expert)." },
  win_streak: { label: "Win streak", needsCount: true, hint: "Unlocks after this many consecutive wins in a row (any debot)." },
  item_maxed: { label: "Hold an item at max stock", needsItemKey: true, hint: "Unlocks the moment a consumable is bought up to its max stock cap." },
  insight_lens_owned: { label: "Own the Insight Lens", hint: "Unlocks the moment the Insight Lens gear is purchased." },
  total_debucks_earned: { label: "Lifetime debucks earned", needsCount: true, hint: "Unlocks once this many debucks have been earned in total (match wins + achievement rewards). Spending doesn't reduce this — it only ever goes up. The admin debucks cheat does NOT count toward this." },
  total_debucks_spent: { label: "Lifetime debucks spent", needsCount: true, hint: "Unlocks once this many debucks have been spent in the Store in total." },
  all_debots_unlocked: { label: "Own every debot", hint: "Unlocks the moment every debot in the catalog is unlocked." },
  themes_owned: { label: "Own N themes", needsCount: true, hint: "Unlocks once this many themes are owned. Use count: 1 for a 'buy your first theme' achievement." },
  daily_challenges_completed: { label: "Daily Challenges completed", needsCount: true, hint: "Unlocks after completing this many Daily Challenges in total — days don't need to be consecutive." },
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
  groupKey: string | null; // achievements sharing a groupKey form one tiered family
  tier: number | null;     // 1-based position within the group; null/1 for ungrouped achievements
};

// Roman numerals for tier display — "<name> <TIER>", e.g. "Clean Sweep III".
// Only ever needs to cover however many tiers an admin actually creates in
// one group, but the algorithm itself has no upper bound.
const ROMAN_PAIRS: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
export function toRomanNumeral(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "";
  let remaining = Math.floor(n);
  let out = "";
  for (const [value, symbol] of ROMAN_PAIRS) {
    while (remaining >= value) { out += symbol; remaining -= value; }
  }
  return out;
}

// A visual "upgrade" ramp for tier badges/borders — bronze -> silver -> gold
// -> diamond -> amethyst, repeating the last color for any tier beyond this.
export const TIER_COLORS = ["#b08d57", "#c0c0c0", "#f5c518", "#7dd3fc", "#c084fc"];
export function tierColor(tier: number | null | undefined): string {
  if (!tier || tier < 1) return "var(--amber)";
  return TIER_COLORS[Math.min(tier, TIER_COLORS.length) - 1];
}

// The display name a tiered achievement should show — base name + roman
// numeral for tier >= 1 in a group, or just the base name if ungrouped.
export function displayName(a: Pick<AchievementDef, "name" | "groupKey" | "tier">): string {
  if (!a.groupKey || !a.tier) return a.name;
  return `${a.name} ${toRomanNumeral(a.tier)}`;
}

const DIFFICULTY_TIERS: { key: string; label: string; icon: string }[] = [
  { key: "beginner", label: "Beginner", icon: "🧠" },
  { key: "intermediate", label: "Intermediate", icon: "🧠" },
  { key: "advanced", label: "Advanced", icon: "🧠" },
  { key: "expert", label: "Master", icon: "🧠" }, // "expert" is the condition value (matches debot difficulty matching elsewhere); "Master" is just the flavor name for the top tier
];

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
    groupKey: null,
    tier: null,
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
    groupKey: null,
    tier: null,
  },
  // Clean Sweep is now a 4-tier family, one tier per debot difficulty —
  // beating a harder debot clean also claims every easier tier at once.
  ...DIFFICULTY_TIERS.map((d, i) => ({
    id: `default-clean-sweep-${d.key}`,
    key: `clean_sweep_${d.key}`,
    name: "Clean Sweep",
    description: `Win a match against a ${d.label} debot without using any item.`,
    icon: d.icon,
    conditionType: "no_item_win_difficulty" as const,
    conditionConfig: { difficulty: d.key },
    rewardDebucks: 15 + i * 15,
    rewardThemeId: null,
    active: true,
    sortOrder: 2 + i,
    groupKey: "clean_sweep",
    tier: i + 1,
  })),
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
    sortOrder: 10,
    groupKey: null,
    tier: null,
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
    sortOrder: 11,
    groupKey: null,
    tier: null,
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
    sortOrder: 12,
    groupKey: null,
    tier: null,
  },
  // Debucks Earned — tiered, lifetime-earned thresholds.
  ...[
    { count: 100, reward: 10 },
    { count: 500, reward: 25 },
    { count: 2000, reward: 60 },
    { count: 10000, reward: 150 },
  ].map((t, i) => ({
    id: `default-debucks-earned-${i + 1}`,
    key: `debucks_earned_${i + 1}`,
    name: "Debucks Earned",
    description: `Earn ${t.count} debucks in total.`,
    icon: "💰",
    conditionType: "total_debucks_earned" as const,
    conditionConfig: { count: t.count },
    rewardDebucks: t.reward,
    rewardThemeId: null,
    active: true,
    sortOrder: 20 + i,
    groupKey: "debucks_earned",
    tier: i + 1,
  })),
  // Big Spender — tiered, lifetime-spent thresholds.
  ...[
    { count: 100, reward: 5 },
    { count: 500, reward: 15 },
    { count: 2000, reward: 40 },
  ].map((t, i) => ({
    id: `default-big-spender-${i + 1}`,
    key: `big_spender_${i + 1}`,
    name: "Big Spender",
    description: `Spend ${t.count} debucks in the Store in total.`,
    icon: "🛍",
    conditionType: "total_debucks_spent" as const,
    conditionConfig: { count: t.count },
    rewardDebucks: t.reward,
    rewardThemeId: null,
    active: true,
    sortOrder: 30 + i,
    groupKey: "big_spender",
    tier: i + 1,
  })),
  {
    id: "default-collector",
    key: "collector",
    name: "Collector",
    description: "Unlock every debot in the roster.",
    icon: "🗂",
    conditionType: "all_debots_unlocked",
    conditionConfig: {},
    rewardDebucks: 75,
    rewardThemeId: null,
    active: true,
    sortOrder: 40,
    groupKey: null,
    tier: null,
  },
  {
    id: "default-first-theme",
    key: "first_theme",
    name: "New Look",
    description: "Buy your first theme.",
    icon: "🎨",
    conditionType: "themes_owned",
    conditionConfig: { count: 1 },
    rewardDebucks: 10,
    rewardThemeId: null,
    active: true,
    sortOrder: 41,
    groupKey: null,
    tier: null,
  },
  // Daily Devotee — tiered, total Daily Challenges completed (not streak).
  ...[
    { count: 10, reward: 15 },
    { count: 30, reward: 40 },
    { count: 50, reward: 75 },
    { count: 100, reward: 150 },
  ].map((t, i) => ({
    id: `default-daily-devotee-${i + 1}`,
    key: `daily_devotee_${i + 1}`,
    name: "Daily Devotee",
    description: `Complete ${t.count} Daily Challenges in total.`,
    icon: "📅",
    conditionType: "daily_challenges_completed" as const,
    conditionConfig: { count: t.count },
    rewardDebucks: t.reward,
    rewardThemeId: null,
    active: true,
    sortOrder: 50 + i,
    groupKey: "daily_devotee",
    tier: i + 1,
  })),
];
