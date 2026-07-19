"use client";

import { useMemo, useState } from "react";

type DocEntry = { id: string; category: string; title: string; body: string };

const DOC_ENTRIES: DocEntry[] = [
  // ── ARGUMENT STRUCTURE ──
  {
    id: "struct-claim-warrant-impact",
    category: "Argument Structure",
    title: "Claim, Warrant, Impact",
    body: "A strong argument has three parts working together: a claim (the point you're making), a warrant (the reasoning or evidence behind it), and an impact (why it actually matters — who's affected, and how much). A claim alone is just an assertion. A warrant without a clear claim is reasoning in search of a point. A claim with a warrant but no impact can be technically correct while still not mattering — the judge, or your opponent, is always implicitly asking \"so what?\"",
  },
  {
    id: "struct-work-backward",
    category: "Argument Structure",
    title: "Working Backward From Impact",
    body: "When building a response mid-match, it helps to start from the end: decide what you want to prove matters, find the warrant that gets you there, then state the claim plainly enough that it's obvious what you're arguing. Debaters who start from the claim and hope the impact follows often end up with technically-true points that don't move anything.",
  },
  {
    id: "struct-warrant-types",
    category: "Argument Structure",
    title: "Types of Warrants",
    body: "Not all reasoning carries the same weight. An evidentiary warrant cites data, studies, or documented cases. A logical warrant derives a conclusion from premises the opponent already accepts. An authority warrant leans on expert consensus. Evidentiary and logical warrants tend to survive scrutiny better than authority alone — \"an expert said so\" is a starting point, not a finishing one.",
  },
  {
    id: "struct-burden-of-proof",
    category: "Argument Structure",
    title: "Burden of Proof",
    body: "Whoever makes a claim owns the burden of proving it — simply asserting something and waiting for it to be disproven isn't a complete argument. If your opponent makes a claim without backing it, you don't need a counter-claim of equal weight to beat it; pointing out the missing warrant is itself a valid, often underused response.",
  },
  {
    id: "struct-framing",
    category: "Argument Structure",
    title: "Framing the Resolution",
    body: "How a topic gets framed early in a debate often decides who has the easier path for the rest of it. If a resolution can reasonably be read multiple ways, the side that establishes a sensible, defensible framing first — and keeps returning to it — tends to control the exchange, since the opponent is now arguing against your version of the topic.",
  },
  {
    id: "struct-uniqueness-link-impact",
    category: "Argument Structure",
    title: "Uniqueness, Link, and Impact",
    body: "For arguments about a proposed change (a policy, a decision, an action), three questions matter: is the current situation actually different from the proposed one (uniqueness)? Does the proposed change actually cause the effect being claimed (link)? And does that effect actually matter (impact)? Attacking any one of the three is enough to weaken the whole chain — you don't need to contest all three.",
  },

  // ── ARGUMENT TYPES ──
  {
    id: "types-deductive",
    category: "Argument Types",
    title: "Deductive Reasoning",
    body: "A deductive argument's conclusion follows necessarily from its premises — if the premises are true, the conclusion must be true. \"All mammals are warm-blooded; whales are mammals; therefore whales are warm-blooded\" can't be false without one of the premises being false. Deductive arguments are strong when accepted, but easy to fully collapse by attacking a single premise.",
  },
  {
    id: "types-inductive",
    category: "Argument Types",
    title: "Inductive Reasoning",
    body: "An inductive argument's conclusion is probable, not guaranteed, based on patterns or examples — \"every observed swan has been white, so the next one probably will be too.\" Inductive arguments are only as strong as their sample: a handful of matching examples proves far less than a large, representative one, which is exactly what a Hasty Generalization exploits.",
  },
  {
    id: "types-causal",
    category: "Argument Types",
    title: "Causal Arguments",
    body: "A causal argument claims one thing brings about another. The strongest version rules out reverse causation (does B actually cause A instead?) and confounding factors (is something else causing both?) — most weak causal arguments in a live debate fall apart the moment either question gets asked directly.",
  },
  {
    id: "types-analogical",
    category: "Argument Types",
    title: "Analogical Arguments",
    body: "An analogical argument reasons that because two things are alike in some ways, they're alike in the relevant way too — \"this policy failed in City A, so it will fail in City B.\" These live or die on how relevant the similarity actually is; pointing out a meaningful difference between the two cases usually does more damage than denying the analogy outright.",
  },

  // ── LOGICAL FALLACIES ──
  { id: "fallacy-ad-hominem", category: "Logical Fallacies", title: "Ad Hominem", body: "Attacking the person making the argument instead of the argument itself. Example: \"You can't trust her stance on the budget — she's not even an economist.\"" },
  { id: "fallacy-straw-man", category: "Logical Fallacies", title: "Straw Man", body: "Misrepresenting an opponent's position as something weaker or more extreme, then attacking that instead. Example: responding to \"we should regulate this industry more\" with \"so you want to shut down the entire industry?\"" },
  { id: "fallacy-false-dilemma", category: "Logical Fallacies", title: "False Dilemma", body: "Presenting only two options when more actually exist. Example: \"either we ban cars downtown, or the city stays polluted forever\" ignores every option in between." },
  { id: "fallacy-slippery-slope", category: "Logical Fallacies", title: "Slippery Slope", body: "Claiming one step will inevitably lead to an extreme outcome, without showing why each step actually follows from the last. Example: \"if we allow later curfews, next it'll be no curfew at all, then total chaos.\"" },
  { id: "fallacy-appeal-authority", category: "Logical Fallacies", title: "Appeal to Authority", body: "Treating a claim as true mainly because an authority figure said it, rather than on its own merits — especially weak when the authority isn't actually an expert in the relevant field." },
  { id: "fallacy-appeal-emotion", category: "Logical Fallacies", title: "Appeal to Emotion", body: "Using fear, pity, or outrage to win agreement instead of evidence or reasoning. Emotional framing isn't automatically fallacious, but it becomes one when it's substituted for an actual warrant." },
  { id: "fallacy-circular", category: "Logical Fallacies", title: "Circular Reasoning", body: "Using the conclusion as one of the premises, so the argument just restates itself. Example: \"freedom means doing what you want, and what you want is what makes you free.\"" },
  { id: "fallacy-hasty-generalization", category: "Logical Fallacies", title: "Hasty Generalization", body: "Drawing a broad conclusion from too small or unrepresentative a sample. Example: \"I know two people who tried this diet and it worked, so it works.\"" },
  { id: "fallacy-red-herring", category: "Logical Fallacies", title: "Red Herring", body: "Introducing an irrelevant point to divert attention from the actual issue. Example: asked why a policy failed, replying \"well, what about the other side's failed policies ten years ago?\"" },
  { id: "fallacy-bandwagon", category: "Logical Fallacies", title: "Bandwagon", body: "Arguing something is true or right because it's popular or widely believed. Popularity can be relevant context, but it isn't evidence of correctness on its own." },
  { id: "fallacy-false-cause", category: "Logical Fallacies", title: "False Cause", body: "Assuming that because one thing followed another, the first caused the second. Example: \"ice cream sales and shark attacks both rise in summer, so ice cream sales cause shark attacks\" — both are actually caused by a third factor, warm weather." },
  { id: "fallacy-equivocation", category: "Logical Fallacies", title: "Equivocation", body: "Shifting the meaning of a key word partway through an argument to make it seem to hold together, relying on the word's two different senses without acknowledging the switch." },
  { id: "fallacy-tu-quoque", category: "Logical Fallacies", title: "Tu Quoque", body: "Deflecting criticism by accusing the critic of the same or a similar flaw — \"you're one to talk.\" Even if true, it doesn't actually address whether the original criticism was valid." },
  { id: "fallacy-no-true-scotsman", category: "Logical Fallacies", title: "No True Scotsman", body: "Redefining a category to exclude an inconvenient counterexample after the fact. Example: \"no true fan would say that\" — quietly moving the goalposts so the claim can't be disproven." },
  { id: "fallacy-genetic", category: "Logical Fallacies", title: "Genetic Fallacy", body: "Judging an idea as true or false based on where it came from rather than its actual content. An argument's origin might be worth noting, but it doesn't settle whether the argument itself is sound." },
  { id: "fallacy-appeal-ignorance", category: "Logical Fallacies", title: "Appeal to Ignorance", body: "Claiming something is true because it hasn't been proven false (or vice versa). Absence of evidence against a claim isn't the same as evidence for it." },
  { id: "fallacy-composition-division", category: "Logical Fallacies", title: "Composition / Division", body: "Composition assumes what's true of the parts must be true of the whole (\"every player on the team is great, so the team must be great\"). Division is the reverse — assuming what's true of the whole applies to every part." },
  { id: "fallacy-anecdotal", category: "Logical Fallacies", title: "Anecdotal Evidence", body: "Using a single personal story or isolated example in place of a representative sample or actual data. A vivid anecdote is persuasive, but persuasive isn't the same as statistically meaningful." },
  { id: "fallacy-loaded-question", category: "Logical Fallacies", title: "Loaded Question", body: "Asking a question that contains a built-in assumption the other side hasn't agreed to — \"why does your policy keep failing people?\" presupposes the failure before it's been established." },
  { id: "fallacy-false-balance", category: "Logical Fallacies", title: "False Balance / Middle Ground", body: "Assuming the correct position must lie exactly between two extremes, or that both sides of any dispute deserve equal weight regardless of the actual strength of the evidence behind each." },

  // ── WEIGHING & COMPARISON ──
  {
    id: "weigh-magnitude",
    category: "Weighing & Comparison",
    title: "Magnitude",
    body: "When two impacts are both true, ask how big each one actually is — how many people are affected, and how severely. A large-scale, moderate harm can outweigh a severe but narrow one, and vice versa; naming the actual scale of an impact is more persuasive than just asserting it's \"important.\"",
  },
  {
    id: "weigh-probability",
    category: "Weighing & Comparison",
    title: "Probability",
    body: "A guaranteed but smaller impact can outweigh a huge but unlikely one. If your opponent's impact depends on a long chain of things all going a certain way, naming that chain and questioning its weakest link is often stronger than trying to out-impact it directly.",
  },
  {
    id: "weigh-reversibility",
    category: "Weighing & Comparison",
    title: "Reversibility and Timeframe",
    body: "An outcome that can be undone matters less, all else equal, than one that can't — and a harm that happens immediately is generally more urgent than one that might happen eventually. Naming which side of a debate has the reversible risk is a genuinely persuasive weighing move, not just a rhetorical flourish.",
  },
  {
    id: "weigh-scope",
    category: "Weighing & Comparison",
    title: "Scope: Breadth vs. Depth",
    body: "A broad impact touches many people a little; a deep impact touches few people a lot. Neither automatically wins — which one should matter more usually depends on the specific stakes of the topic, so naming which kind of impact you're claiming (and why that kind should matter here) is stronger than leaving it implicit.",
  },
  {
    id: "weigh-framework",
    category: "Weighing & Comparison",
    title: "Framework-Level Weighing",
    body: "Sometimes the real disagreement isn't about the facts but about what standard should decide the debate at all (e.g. \"which policy does more good overall\" vs. \"which policy respects individual rights better\"). Winning that underlying framework question first often makes the rest of the debate resolve in your favor almost automatically.",
  },

  // ── DEBATE TECHNIQUE ──
  { id: "tech-rebut", category: "Debate Technique", title: "Rebut, Don't Restate", body: "Answering an opponent's point means directly engaging with their warrant — explaining why their reasoning doesn't hold, or why it doesn't lead where they claim — not just repeating your own original claim louder." },
  { id: "tech-weigh", category: "Debate Technique", title: "Weigh, Don't Just List", body: "When both sides have valid points, explain why yours matters more — in scale, probability, or reversibility (see Weighing & Comparison above) — rather than just adding another point to the pile and hoping quantity wins." },
  { id: "tech-concede", category: "Debate Technique", title: "Concede Strategically", body: "Conceding a minor point you can't win, then pivoting to why it doesn't change the overall conclusion, usually reads stronger than stretching to deny something obviously true — and it buys credibility for the points where you do push back hard." },
  { id: "tech-preempt", category: "Debate Technique", title: "Preempt the Obvious Response", body: "If you can see the counter coming, address it before your opponent raises it. It reads as more in-control and takes the point off the table before it can land, rather than looking like you were caught off guard by it." },
  { id: "tech-on-topic", category: "Debate Technique", title: "Stay on the Actual Topic", body: "It's tempting to chase a tangent you're confident on, but points that don't connect back to the resolution tend to score worse than a tighter, more directly relevant answer — confidence on an irrelevant point doesn't make it relevant." },
  { id: "tech-flow", category: "Debate Technique", title: "Track the Round as It Develops", body: "Keep a mental (or literal) running list of which of your points the opponent has actually answered, which they've dropped, and which are still live. A dropped point you can point back to later (\"you never responded to X\") is often more persuasive than raising a brand new one." },
  { id: "tech-specificity", category: "Debate Technique", title: "Specificity Beats Volume", body: "One concrete, well-explained example usually beats five vague assertions. Specificity signals you actually understand the mechanism you're describing, not just the conclusion you want to reach." },
  { id: "tech-tone", category: "Debate Technique", title: "Tone Under Pressure", body: "Getting visibly rattled or hostile tends to read as losing, even when the underlying argument is fine. Calm, direct pushback — acknowledging a strong point exists, then explaining why it doesn't decide the debate — reads as more credible than matching aggression with aggression." },
  { id: "tech-efficiency", category: "Debate Technique", title: "Efficiency Under a Word/Time Limit", body: "When rounds are short, spend the least words on points that are already won or already lost, and the most on the ones actually in contention — restating an unchallenged point wastes space that a live disagreement needs." },
];

const CATEGORY_ORDER = ["Argument Structure", "Argument Types", "Logical Fallacies", "Weighing & Comparison", "Debate Technique"];

export function Documentation() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const trimmedQuery = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!trimmedQuery) return null;
    return new Set(
      DOC_ENTRIES.filter((e) => e.title.toLowerCase().includes(trimmedQuery) || e.body.toLowerCase().includes(trimmedQuery)).map((e) => e.id)
    );
  }, [trimmedQuery]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    entries: DOC_ENTRIES.filter((e) => e.category === cat && (!matchIds || matchIds.has(e.id))),
  })).filter((g) => g.entries.length > 0);

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 18 }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 14 }}>🔍</span>
        <input
          className="input-field"
          placeholder="Search fallacies, technique, weighing…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", paddingLeft: 34 }}
        />
      </div>

      {matchIds && matchIds.size === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>No matches for "{query}".</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {byCategory.map((g) => (
          <div key={g.category}>
            <div style={{ fontSize: 11, color: "var(--amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              {g.category}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {g.entries.map((e) => {
                const isOpen = matchIds ? true : expanded.has(e.id);
                return (
                  <div key={e.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <button
                      onClick={() => toggle(e.id)}
                      style={{
                        width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer",
                        padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{e.title}</span>
                      <span style={{ color: "var(--muted)", fontSize: 12, flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 14px 14px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
                        {e.body}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
