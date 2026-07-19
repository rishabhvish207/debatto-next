// config/DailyChallenge.ts
//
// The Daily Challenge is a 10-question MCQ quiz, the same for every player
// on a given UTC calendar day, generated once via AI and cached in the
// `daily_challenges` table (see app/api/daily-challenge/route.ts) — the
// first request of a new day generates it, everyone after that gets the
// cached set. Correct answers never reach the browser until after a
// submission is graded server-side (app/api/daily-challenge/submit/route.ts)
// — see that file for exactly what "can't cheat by looking at the
// documentation" actually means here and its real limits.

export type DailyChallengeQuestion = {
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
};

// Sent to the browser — deliberately missing correctIndex.
export type DailyChallengeQuestionPublic = {
  text: string;
  options: [string, string, string, string];
};

export const QUESTION_GEN_SYSTEM_PROMPT = `You are generating today's daily 10-question multiple-choice quiz for Debatto, a debate-practice app. Questions should test practical debate judgment: identifying the logical fallacy in a short example statement, judging which of several counter-arguments is strongest against a given claim, recognizing weak vs. strong argument structure, spotting the flaw in a piece of reasoning, and similar calls a debater actually has to make mid-match. Mix these types across the 10 questions rather than repeating one type.

Rules:
- Each question and each option should be short — one or two sentences at most.
- Exactly one option is clearly correct; the other three must be plausible but clearly wrong to someone who understands the underlying concept — no ambiguous or debatable "correct" answers.
- Vary which option (0, 1, 2, or 3) is correct across the 10 questions — don't cluster them in the same position.
- Cover a range of difficulty, not all easy or all hard.

Return ONLY a raw JSON array of exactly 10 objects, no markdown fences, no prose before or after, each shaped exactly like:
{"text": "the question text", "options": ["option A", "option B", "option C", "option D"], "correctIndex": 0}`;

// Used only if AI generation fails or returns something unparseable — keeps
// the feature working (with a fixed, non-daily-varying set) rather than
// breaking entirely. Original questions, not sourced from anywhere.
export const FALLBACK_QUESTIONS: DailyChallengeQuestion[] = [
  {
    text: '"You can\'t trust her argument about the budget — she\'s not even an economist." What fallacy is this?',
    options: ["Ad Hominem", "Straw Man", "False Cause", "Bandwagon"],
    correctIndex: 0,
  },
  {
    text: 'Someone claims "if we allow later curfews for teenagers, next they\'ll want no curfew at all, and then total chaos." What fallacy is this?',
    options: ["Circular Reasoning", "Slippery Slope", "Appeal to Authority", "Red Herring"],
    correctIndex: 1,
  },
  {
    text: 'Claim: "Cities should invest more in public parks." Which counter-argument is strongest?',
    options: [
      "\"Parks are nice, but I don't personally go to them very often.\"",
      "\"My cousin thinks parks are a waste of city money.\"",
      "\"Given fixed budgets, every dollar spent on parks is a dollar not spent on housing or transit — a sector with a more measurable return should be shown first.\"",
      "\"Parks have existed for a long time already.\"",
    ],
    correctIndex: 2,
  },
  {
    text: 'A debater says: "Ice cream sales and shark attacks both rise in summer, so ice cream sales cause shark attacks." What fallacy is this?',
    options: ["False Cause", "Equivocation", "Hasty Generalization", "Appeal to Emotion"],
    correctIndex: 0,
  },
  {
    text: '"Either we ban all cars downtown, or the city stays polluted forever." What fallacy is this?',
    options: ["Straw Man", "False Dilemma", "Circular Reasoning", "Bandwagon"],
    correctIndex: 1,
  },
  {
    text: 'Which of these is the strongest rebuttal to "remote work makes employees less productive"?',
    options: [
      "\"I personally like working from home.\"",
      "\"Several controlled studies comparing output before and after a switch to remote work found no significant productivity drop, and some found gains.\"",
      "\"Everyone I know prefers remote work.\"",
      "\"Offices are expensive to maintain.\"",
    ],
    correctIndex: 1,
  },
  {
    text: 'Asked why a policy failed, someone replies: "Well, what about the other party\'s failed policies from ten years ago?" What fallacy is this?',
    options: ["Red Herring", "Slippery Slope", "Appeal to Authority", "Ad Hominem"],
    correctIndex: 0,
  },
  {
    text: 'A one-sentence claim reasons: "Freedom means being able to do what you want, and what you want is what makes you free." What\'s the flaw?',
    options: ["It's a false dilemma", "It's circular — the conclusion just restates the premise", "It's an appeal to emotion", "It's a hasty generalization"],
    correctIndex: 1,
  },
  {
    text: 'Which response actually rebuts the claim "violent video games cause real-world violence," rather than just restating disagreement?',
    options: [
      "\"That's not true at all.\"",
      "\"I don't believe that.\"",
      "\"Large-scale reviews have found no consistent causal link, and video game consumption has risen in many countries while youth violence has fallen over the same period.\"",
      "\"My friend plays video games and he's nice.\"",
    ],
    correctIndex: 2,
  },
  {
    text: '"Ninety percent of people surveyed on this app support the new policy, so it must be a good idea." What fallacy is this?',
    options: ["Bandwagon", "False Cause", "Straw Man", "Equivocation"],
    correctIndex: 0,
  },
];

export const DEFAULT_REWARD_PER_CORRECT = 2;
