// config/LearningDefaults.ts
//
// Documentation and Game Guide are now fully admin-editable markdown
// (Admin → Learning), stored in the `learning_content` table. These two
// constants are what ships until an admin actually edits them — same
// fallback pattern as everything else admin-editable in this app.

export const DEFAULT_DOCUMENTATION_MD = `# Documentation

Argument structure, logical fallacies, and debate technique — everything here is editable from Admin → Learning.

## Argument Structure

### Claim, Warrant, Impact

A strong argument has three parts working together: a **claim** (the point you're making), a **warrant** (the reasoning or evidence behind it), and an **impact** (why it actually matters — who's affected, and how much). A claim alone is just an assertion. A warrant without a clear claim is reasoning in search of a point. A claim with a warrant but no impact can be technically correct while still not mattering — the judge, or your opponent, is always implicitly asking "so what?"

### Working Backward From Impact

When building a response mid-match, it helps to start from the end: decide what you want to prove matters, find the warrant that gets you there, then state the claim plainly enough that it's obvious what you're arguing.

### Types of Warrants

Not all reasoning carries the same weight. An **evidentiary** warrant cites data, studies, or documented cases. A **logical** warrant derives a conclusion from premises the opponent already accepts. An **authority** warrant leans on expert consensus — a starting point, not a finishing one.

### Burden of Proof

Whoever makes a claim owns the burden of proving it. If your opponent makes a claim without backing it, pointing out the missing warrant is itself a valid response.

### Framing the Resolution

If a resolution can reasonably be read multiple ways, the side that establishes a sensible framing first — and keeps returning to it — tends to control the exchange.

### Uniqueness, Link, and Impact

For arguments about a proposed change, three questions matter: is the current situation actually different from the proposed one (**uniqueness**)? Does the change actually cause the claimed effect (**link**)? Does that effect actually matter (**impact**)? Attacking any one is enough to weaken the chain.

## Argument Types

### Deductive Reasoning

A deductive argument's conclusion follows *necessarily* from its premises. "All mammals are warm-blooded; whales are mammals; therefore whales are warm-blooded" can't be false without a premise being false — strong when accepted, but easy to fully collapse by attacking one premise.

### Inductive Reasoning

An inductive argument's conclusion is *probable*, not guaranteed, based on patterns or examples. Only as strong as its sample size and representativeness.

### Causal Arguments

Claims that one thing brings about another. The strongest version rules out reverse causation and confounding factors.

### Analogical Arguments

Reasons that because two things are alike in some way, they're alike in the relevant way too. These live or die on how relevant the similarity actually is.

## Logical Fallacies

- **Ad Hominem** — attacking the person instead of the argument. *"You can't trust her on the budget — she's not even an economist."*
- **Straw Man** — misrepresenting a position as weaker than it is, then attacking that.
- **False Dilemma** — presenting only two options when more exist.
- **Slippery Slope** — claiming one step inevitably leads to an extreme outcome without showing why.
- **Appeal to Authority** — treating a claim as true mainly because an authority said it.
- **Appeal to Emotion** — using fear, pity, or outrage in place of an actual warrant.
- **Circular Reasoning** — using the conclusion as one of the premises.
- **Hasty Generalization** — drawing a broad conclusion from too small a sample.
- **Red Herring** — introducing an irrelevant point to divert attention.
- **Bandwagon** — arguing something is right because it's popular.
- **False Cause** — assuming that because one thing followed another, it caused it.
- **Equivocation** — shifting a key word's meaning partway through an argument.
- **Tu Quoque** — deflecting criticism by accusing the critic of the same flaw.
- **No True Scotsman** — redefining a category to dodge a counterexample after the fact.
- **Genetic Fallacy** — judging an idea by where it came from rather than its content.
- **Appeal to Ignorance** — claiming something is true because it hasn't been proven false.
- **Composition / Division** — assuming what's true of the parts is true of the whole, or vice versa.
- **Anecdotal Evidence** — using one story in place of representative data.
- **Loaded Question** — asking a question with a built-in unagreed assumption.
- **False Balance** — assuming the truth must sit exactly between two extremes.

## Weighing & Comparison

- **Magnitude** — how many people are affected, and how severely.
- **Probability** — a guaranteed smaller impact can outweigh a huge unlikely one.
- **Reversibility & Timeframe** — an undoable outcome matters less than a permanent one; sooner harms are more urgent.
- **Scope: Breadth vs. Depth** — a little harm to many vs. a lot of harm to few.
- **Framework-Level Weighing** — sometimes the real disagreement is about *what standard* should decide the debate at all.

## Debate Technique

1. **Rebut, don't restate** — engage the opponent's warrant directly, don't just repeat your claim louder.
2. **Weigh, don't just list** — explain why your point matters more, don't just add another to the pile.
3. **Concede strategically** — give up what you can't win, then pivot to why it doesn't change the conclusion.
4. **Preempt the obvious response** — address a counter before it's raised.
5. **Stay on the actual topic** — a confident tangent still scores worse than a relevant answer.
6. **Track the round as it develops** — know what's been answered, what's dropped, what's still live.
7. **Specificity beats volume** — one well-explained example beats five vague assertions.
8. **Tone under pressure** — calm pushback reads as more credible than matched aggression.
9. **Efficiency under a limit** — spend the least words on points already won or lost.
`;

export const DEFAULT_GAME_GUIDE_MD = `# Game Guide

## The Basics

Pick a debot, a topic, and a side, then argue back and forth for a set number of rounds. Each round, an AI judge scores your argument (a **gain** for what worked, a **penalty** for what didn't — the difference is your **net** for the round) and the debot fires back in character, with its own net damage against you.

Both sides have HP. A round's net score becomes damage to the opponent's HP. The match ends when someone's HP hits 0, or after the last round — whoever has more total points wins. A tie is a draw.

## Debots

Each debot has its own personality, argument style, and a **difficulty** label (Beginner through Expert) that changes how it argues and how strictly it grades you. Debots with a cost need to be unlocked with debucks first.

## Items

- **🔍 Insight Lens** — one-time permanent purchase. Highlights the opponent's fallacies and weak points, unlimited uses.
- **🂡 Ace Card** — consumable. Reveals 3 AI-suggested responses to the opponent's last argument.
- **💊 Confidence Pill** — consumable. Heals HP instantly, no AI call needed.
- **⚡ Revival Shot** — consumable. Heals to *full* HP, not just a fixed amount — save it for a close match.

## Debucks, Store & Themes

Debucks are earned by winning matches, from achievement rewards, and from the Daily Challenge. Spend them in the Store on items, or on Themes — full color/font reskins of the app, equipped instantly.

## Daily Challenge

A 10-question multiple-choice quiz on fallacies, counter-arguments, and debate judgment — the same questions for everyone, refreshed once a day. One attempt per day; debucks scale with how many you get right. Once started, leaving forfeits that day's attempt.

## Achievements

Achievements track things like total wins, win streaks, beating a specific debot, winning without using any item, lifetime debucks earned/spent, and Daily Challenge consistency. Some come in tiers (shown as roman numerals, e.g. *"Clean Sweep III"*) — clearing a harder tier claims the easier ones too.

## Online

Random matchmaking pairs you against another player on an AI-generated topic; Friends lets you challenge someone directly and configure the rules yourself. Winning online matches raises your Prestige — an Elo-style rating separate from your offline debucks/wins.
`;
