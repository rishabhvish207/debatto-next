"use client";

export function GameGuide() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <DocCard title="The Basics" icon="⚔">
        <p style={pStyle}>
          Pick a debot, a topic, and a side, then argue back and forth for a set number of rounds. Each round, an AI
          judge scores your argument (a <b>gain</b> for what worked, a <b>penalty</b> for what didn't — the
          difference is your <b>net</b> for the round) and the debot fires back in character, with its own net
          damage against you.
        </p>
        <p style={pStyle}>
          Both sides have HP. A round's net score becomes damage to the opponent's HP. The match ends when someone's
          HP hits 0, or after the last round — whoever has more total points at that point wins. A tie is a draw.
        </p>
      </DocCard>

      <DocCard title="Debots" icon="🤖">
        <p style={pStyle}>
          Each debot has its own personality, argument style, and a <b>difficulty</b> label (Beginner through
          Expert) that actually changes how it argues and how strictly it grades you — a Beginner debot makes
          exploitable mistakes and grades generously; an Expert one argues tightly and grades hard. Debots with a
          cost need to be unlocked with debucks first.
        </p>
      </DocCard>

      <DocCard title="Items" icon="🎒">
        <TechniquePoint title="🔍 Insight Lens">
          A one-time permanent purchase. Once owned, tap Insight any time during your turn to see the opponent's
          fallacies and weak points highlighted — unlimited uses.
        </TechniquePoint>
        <TechniquePoint title="🂡 Ace Card">
          A consumable. Reveals 3 AI-suggested responses to the opponent's last argument — use one as-is or as a
          starting point. Gets pricier the more you're holding, following whichever pricing formula an admin's set.
        </TechniquePoint>
        <TechniquePoint title="💊 Confidence Pill">
          A consumable that heals HP instantly, no AI call needed.
        </TechniquePoint>
        <TechniquePoint title="⚡ Revival Shot">
          A consumable that instantly heals to full HP, not just a fixed amount — save it for when a match is close.
        </TechniquePoint>
      </DocCard>

      <DocCard title="Debucks, Store & Themes" icon="❋">
        <p style={pStyle}>
          Debucks are earned by winning matches (scaled by how many rounds you played), from achievement rewards, and
          from the Daily Challenge. Spend them in the Store on items, or on Themes — full color/font reskins of the
          whole app, equipped instantly.
        </p>
      </DocCard>

      <DocCard title="Daily Challenge" icon="🧩">
        <p style={pStyle}>
          A 10-question multiple-choice quiz on fallacies, counter-arguments, and debate judgment — the same
          questions for everyone, refreshed once a day. One attempt per day; debucks scale with how many you get
          right. Once started, leaving forfeits that day's attempt.
        </p>
      </DocCard>

      <DocCard title="Achievements" icon="🏅">
        <p style={pStyle}>
          Achievements track things like total wins, win streaks, beating a specific debot, winning without using
          any item, lifetime debucks earned/spent, and Daily Challenge consistency. Some come in tiers (shown as
          roman numerals, e.g. "Clean Sweep III") — clearing a harder tier claims the easier ones too. Check your
          progress any time on the Achievements tab; some pay out debucks, and a few unlock exclusive themes.
        </p>
      </DocCard>

      <DocCard title="Online" icon="🌐">
        <p style={pStyle}>
          Random matchmaking pairs you against another player on an AI-generated topic; Friends lets you challenge
          someone directly and configure the rules yourself. Winning online matches (and not leaving mid-match)
          raises your Prestige — an Elo-style rating separate from your offline debucks/wins.
        </p>
      </DocCard>
    </div>
  );
}

function DocCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function TechniquePoint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

const pStyle: React.CSSProperties = { fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 10 };
