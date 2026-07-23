import Link from "next/link";
import { AppIcon } from "@/components/ui/AppIcon";

const CARDS = [
  { href: "/offline", label: "Debots", desc: "Debate an AI opponent", icon: "⚔", style: "hub-card-primary" },
  { href: "/online/random", label: "Online", desc: "Random matchmaking", icon: "🌐", style: "hub-card-primary" },
  { href: "/online/friends", label: "Friend Match", desc: "Challenge a friend directly", icon: "🤝", style: "hub-card-primary" },
];

export default function PlayPage() {
  return (
    <div style={{ padding: "32px 16px", maxWidth: 520, margin: "0 auto" }}>
      <h1 className="heading" style={{ fontSize: 24, marginBottom: 4, textAlign: "center" }}>Play</h1>
      <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginBottom: 28 }}>
        Pick who you want to debate.
      </p>

      <div className="hub-grid">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className={`hub-card ${c.style}`}>
            <AppIcon token={c.icon} size={28} strokeWidth={1.6} style={{ color: "var(--blue)" }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{c.label}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
