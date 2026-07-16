import Link from "next/link";
import { getLandingBgUrl } from "@/lib/landingBg";

// The pure landing screen — deliberately outside the (app) route group, so
// it gets none of the TopBar/RightDrawer chrome. The three-dot menu only
// starts existing once you're past this screen, inside /hub and beyond.
export default async function LandingPage() {
  const bgUrl = await getLandingBgUrl();

  return (
    <div className="root" style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", overflow: "hidden" }}>
      {bgUrl && (
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.16,
            pointerEvents: "none",
          }}
        />
      )}
      <div style={{ position: "relative", maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.22em", color: "var(--muted)", textTransform: "uppercase", marginBottom: 12 }}>
          AI Debate System
        </div>
        <h1 className="heading" style={{ fontSize: "clamp(56px,13vw,104px)", marginBottom: 6 }}>
          <span style={{ color: "var(--blue)" }}>Deb</span>atto
        </h1>
        <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7, marginBottom: 36 }}>
          It's not about being right.<br />
          It's about being <span style={{ color: "var(--text)", fontWeight: 600 }}>logical.</span>
        </p>

        <Link href="/hub" className="btn btn-primary btn-lg" style={{ width: "100%" }}>
          Enter →
        </Link>
      </div>
    </div>
  );
}
