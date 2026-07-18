export const GAME_CONFIG = {
  defaultName: "Guest",

  economy: {
    startingCoins: 10,
    winReward: 10,
  },

  rounds: {
    options: [2,10, 20, 30],
    default: 10,
  },

  // Judge scoring, HP-damage multipliers, impact thresholds, and win
  // bonuses used to live here as fixed constants — they're now fully
  // admin-editable (Admin → AI → Judge & Scoring) and live in
  // config/Judge.ts instead, which is what GameContext actually reads.

  // Store — items are bought here with debucks, then *used for free* out of
  // inventory during a match. No more per-use coin spending mid-battle.
  store: {
    // Gear: one-time, permanent purchases.
    insightLens: {
      cost: 50, // permanently unlocks the in-match Insight lifeline (unlimited uses once owned)
    },
    // Consumables: stack up to maxStock, spent one-at-a-time in battle.
    aceCard: {
      // "Show Answer". Price = baseCost * 2^(cards currently held), so with
      // baseCost 2 that's 2, 4, 8, 16, 32… as you hold more. It's tied to
      // what you're holding right now, not a running purchase count — spend
      // them down to 0 and the next one is back to base price.
      baseCost: 2,
      maxStock: 10,
    },
    confidencePill: {
      // Flat price every time, unlike Ace Cards. Heals HP on use.
      cost: 5,
      maxStock: 5,
      healAmount: 10,
    },
    revivalShot: {
      // Flat price. Heals to *full* HP on use, not a fixed amount — see
      // healFull on StoreItemDef.
      cost: 40,
      maxStock: 1,
    },
  },
};

// Fallback item catalog used only when the `store_items` table hasn't been
// migrated yet (or the fetch fails) — GameContext prefers the DB version.
// These four `key`s are load-bearing: the in-match logic in
// app/(app)/offline/page.tsx and the purchase functions in GameContext.tsx
// check inventory.insightLens / inventory.aceCards / inventory.confidencePills /
// inventory.revivalShots directly, so an admin-created item only *does*
// something in a match if its key matches one of these four. Everything
// else about an item (name, icon, description, price, max stock, active) is
// editable in Admin → Store → Items; the catalog itself is fixed to these
// four rows — there's no add/delete, only tweak, since a fifth key with no
// matching in-match code would just be inert.
// Four pricing formulas, all keyed off `baseCost` (x) and `priceMultiplier`
// (a), evaluated against however many of that item are *currently held*
// (n) — not a running lifetime purchase count, so spending items back down
// brings the price back down too:
//   flat      price = x                          (constant, ignores n)
//   scaling   price = x * a^n                     (exponential — Ace Cards)
//   linear    price = a * (n+1) * x                (grows by a flat multiple of x each purchase)
//   additive  price = x + a*n                     (grows by a flat amount `a` each purchase)
export type PricingType = "flat" | "scaling" | "linear" | "additive";

export type StoreItemDef = {
  key: string;
  category: "gear" | "consumable";
  name: string;
  icon: string;
  description: string;
  pricingType: PricingType;
  baseCost: number;
  priceMultiplier: number;
  maxStock: number | null;
  healAmount: number; // HP restored on use — 0 for items that don't heal. Ignored if healFull is true.
  healFull: boolean;  // true = restore to max HP on use, ignoring healAmount entirely (e.g. Revival Shot)
  active: boolean;
  sortOrder: number;
};

// Pure pricing calculator shared by every consumable's "price of the next
// one" display + purchase check, regardless of which formula an admin has
// picked for it (Admin -> Store -> Items).
export function computeItemPrice(item: Pick<StoreItemDef, "pricingType" | "baseCost" | "priceMultiplier">, held: number): number {
  const x = item.baseCost;
  const a = item.priceMultiplier ?? 1;
  switch (item.pricingType) {
    case "scaling": return Math.round(x * Math.pow(a, held));
    case "linear": return Math.round(a * (held + 1) * x);
    case "additive": return Math.round(x + a * held);
    case "flat":
    default: return Math.round(x);
  }
}

export const DEFAULT_STORE_ITEMS: StoreItemDef[] = [
  {
    key: "insight_lens",
    category: "gear",
    name: "Insight Lens",
    icon: "🔍",
    description: "Permanently unlocks the Insight lifeline in every match — see the opponent's weak points and fallacies as you debate, as many times as you want. Buy it once; it's yours for good.",
    pricingType: "flat",
    baseCost: GAME_CONFIG.store.insightLens.cost,
    priceMultiplier: 1,
    maxStock: null,
    healAmount: 0,
    healFull: false,
    active: true,
    sortOrder: 0,
  },
  {
    key: "ace_card",
    category: "consumable",
    name: "Ace Card",
    icon: "🂡",
    description: "Reveals 3 AI-suggested responses to the opponent's argument — pick one and use it as-is, or as a starting point. Consumed on use.",
    pricingType: "scaling",
    baseCost: GAME_CONFIG.store.aceCard.baseCost,
    priceMultiplier: 2,
    maxStock: GAME_CONFIG.store.aceCard.maxStock,
    healAmount: 0,
    healFull: false,
    active: true,
    sortOrder: 1,
  },
  {
    key: "confidence_pill",
    category: "consumable",
    name: "Confidence Pill",
    icon: "💊",
    description: "Restores +10 HP the moment you take it. Consumed on use.",
    pricingType: "flat",
    baseCost: GAME_CONFIG.store.confidencePill.cost,
    priceMultiplier: 1,
    maxStock: GAME_CONFIG.store.confidencePill.maxStock,
    healAmount: GAME_CONFIG.store.confidencePill.healAmount,
    healFull: false,
    active: true,
    sortOrder: 2,
  },
  {
    key: "revival_shot",
    category: "consumable",
    name: "Revival Shot",
    icon: "⚡",
    description: "A concentrated energy shot that instantly restores HP to its maximum. Best saved for when the debate is on the line.",
    pricingType: "flat",
    baseCost: GAME_CONFIG.store.revivalShot.cost,
    priceMultiplier: 1,
    maxStock: GAME_CONFIG.store.revivalShot.maxStock,
    healAmount: 0,
    healFull: true,
    active: true,
    sortOrder: 3,
  },
];