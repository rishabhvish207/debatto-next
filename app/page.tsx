import Link from "next/link";
import { getLandingBg } from "@/lib/landingBg";
import { LandingThemeBg } from "@/components/shell/LandingThemeBg";

// The pure landing screen — deliberately outside the (app) route group, so
// it gets none of the TopBar/RightDrawer chrome. The three-dot menu only
// starts existing once you're past this screen, inside /hub and beyond.
export default async function LandingPage() {
  const { url: bgUrl, opacity: bgOpacity, subtext } = await getLandingBg();

  // Preserve the original design's "last word bolded" emphasis for
  // whatever the admin types, not just the hardcoded default — split into
  // lines, and on the final line, break off its last word to render bold.
  const lines = subtext.split("\n").filter((l) => l.length > 0);
  const lastLine = lines[lines.length - 1] || "";
  const lastLineWords = lastLine.split(" ");
  const lastWord = lastLineWords.pop() || "";
  const lastLineLead = lastLineWords.join(" ");

  // A soft dark shadow behind light text holds up against any background
  // image brightness/color without needing per-image tuning.
  const textShadow = "0 2px 10px rgba(0,0,0,0.65), 0 1px 3px rgba(0,0,0,0.8)";

  return (
    <div className="root" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", overflow: "hidden" }}>
      {bgUrl && (
        <div
          id="landing-admin-bg"
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: bgOpacity,
            pointerEvents: "none",
          }}
        />
      )}
      <LandingThemeBg />
      <div style={{ position: "relative", maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.22em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 12, textShadow }}>
          AI Debate System
        </div>
        <h1 className="heading" style={{ fontSize: "clamp(56px,13vw,104px)", marginBottom: 6, textShadow }}>
          <span style={{ color: "var(--blue)" }}>Deb</span>atto
        </h1>
        <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, marginBottom: 36, textShadow }}>
          {lines.slice(0, -1).map((line, i) => (
            <span key={i}>{line}<br /></span>
          ))}
          {lastLineLead ? `${lastLineLead} ` : ""}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{lastWord}</span>
        </p>

        <Link href="/hub" className="btn btn-primary btn-lg" style={{ width: "100%" }}>
          Enter →
        </Link>
      </div>
    </div>
  );
}
