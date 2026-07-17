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

  damage: {
    playerMultiplier: 0.52,
    opponentMultiplier: 0.38,
  },

  scoring: {
    maxGain: 50,
    maxPenalty: 30,
    maxOppGain: 40,
    maxOppPenalty: 15,
  },

  bonus: {
    noPenalty: 5,
    domination: 8,
  },

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
  },
};

// Fallback item catalog used only when the `store_items` table hasn't been
// migrated yet (or the fetch fails) — GameContext prefers the DB version.
// These three `key`s are load-bearing: the in-match logic in
// app/(app)/offline/page.tsx and the purchase functions in GameContext.tsx
// check inventory.insightLens / inventory.aceCards / inventory.confidencePills
// directly, so an admin-created item only *does* something in a match if its
// key matches one of these three. Everything else about an item (name, icon,
// description, price, category, active/inactive) is fully editable in
// Admin → Store → Items, and deleting + re-adding one of these three keys
// with the values below restores it exactly as it shipped.
export type StoreItemDef = {
  key: string;
  category: "gear" | "consumable";
  name: string;
  icon: string;
  description: string;
  pricingType: "flat" | "scaling";
  baseCost: number;
  priceMultiplier: number;
  maxStock: number | null;
  healAmount: number; // HP restored on use — 0 for items that don't heal
  active: boolean;
  sortOrder: number;
};

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
    active: true,
    sortOrder: 2,
  },
];