import Link from "next/link";
import { AppIcon } from "@/components/ui/AppIcon";

const CARDS = [
  { href: "/play", label: "Play", desc: "Debots, online & friend matches", icon: "⚔", style: "hub-card-primary" },
  { href: "/learning", label: "Learn", desc: "Fallacies & technique", icon: "📚", style: "hub-card-primary" },
  { href: "/store", label: "Store", desc: "Themes & customization", icon: "🛍", style: "hub-card-primary" },
  { href: "/achievements", label: "Achievements", desc: "Track your progress", icon: "🏅", style: "hub-card-primary" },
];

export default function HubPage() {
  return (
    <div style={{ padding: "32px 16px", maxWidth: 520, margin: "0 auto" }}>
      <h1 className="heading" style={{ fontSize: 24, marginBottom: 4, textAlign: "center" }}>Where to?</h1>
      <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginBottom: 28 }}>
        Pick a mode to get started.
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
