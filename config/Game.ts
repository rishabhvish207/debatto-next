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

  hint: {
    perRound: 1,
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
      cost: 50, // permanently unlocks the in-match Hint lifeline
    },
    // Consumables: stack up to maxStock, spent one-at-a-time in battle.
    aceCard: {
      // "Show Answer". Price per purchase doubles each time you buy
      // (2, 4, 8, 16, 32, …) — using them doesn't reduce the price, only
      // buying does, and the count only ever climbs back toward maxStock.
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