export const GAME_CONFIG = {
  defaultName: "Guest",

  economy: {
    startingCoins: 10,
    winReward: 10,
    showAnswerCost: 3,
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

  showAnswer: {
    baseCost: 3,
    maxUses: 5,
  },
};