import React from "react";

export function DebotSprite({ opp, emotion, shake, hexColor }: {
  opp: any, emotion: string, shake: boolean, hexColor?: string
}) {
  const hex = hexColor || "#6b9fff";
  const em: Record<string, string> = {
    neutral: "", confident: "◉", angry: "⚡", shocked: "!", defeated: "×", desperate: "⚠"
  };
  const ec: Record<string, string> = {
    confident: hex, angry: "var(--red)", shocked: "#ffd700",
    defeated: "var(--muted)", desperate: "var(--amber)", neutral: "transparent"
  };

  // Sprite resolution: emotion-specific image -> base/default sprite -> plain
  // colored placeholder (first letter of the name) if no sprite exists at all.
  const spriteSrc = opp?.spriteEmotions?.[emotion] || opp?.sprite || null;

  return (
    <div className={shake ? "anim-shake" : ""} style={{
      width: "100%", aspectRatio: "1/1",
      background: `linear-gradient(145deg, ${hex}18, ${hex}08)`,
      border: `1.5px solid ${hex}55`,
      borderRadius: 12,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 5, position: "relative", overflow: "hidden",
      transition: "transform 0.4s ease",
      boxShadow: `0 0 18px ${hex}20`,
    }}>

      {/* Corner brackets */}
      {([[0,0],[0,1],[1,0],[1,1]] as [number,number][]).map(([t,r], i) => (
        <div key={i} style={{
          position: "absolute",
          top: t ? undefined : 7, bottom: t ? 7 : undefined,
          left: r ? undefined : 7, right: r ? 7 : undefined,
          width: 9, height: 9,
          borderTop:    !t ? `1.5px solid ${hex}60` : undefined,
          borderBottom:  t ? `1.5px solid ${hex}60` : undefined,
          borderLeft:   !r ? `1.5px solid ${hex}60` : undefined,
          borderRight:   r ? `1.5px solid ${hex}60` : undefined,
          zIndex: 2,
        }} />
      ))}

      {/* Emotion indicator */}
      {emotion !== "neutral" && (
        <div style={{
          position: "absolute", top: 9, right: 11, zIndex: 2,
          fontSize: 12, color: ec[emotion] || "transparent",
          fontWeight: "bold", animation: "fadeIn 0.2s"
        }}>
          {em[emotion]}
        </div>
      )}

      {/* Sprite image, or a plain colored initial as the last-resort fallback */}
      {spriteSrc ? (
        <img
          src={spriteSrc}
          alt={opp?.name || "Debot"}
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            position: "absolute", inset: 0,
            transition: "transform 0.2s",
            transform: emotion === "shocked" ? "scale(1.06)" : emotion === "defeated" ? "scale(0.94)" : "scale(1)",
          }}
        />
      ) : (
        <div style={{
          fontSize: "clamp(26px,4.5vw,40px)",
          fontWeight: 700,
          color: opp?.color || hex,
          textShadow: `0 0 14px ${hex}70`,
          transition: "transform 0.2s",
          transform: emotion === "shocked" ? "scale(1.1)" : emotion === "defeated" ? "scale(0.88)" : "scale(1)",
        }}>
          {opp?.name?.[0]?.toUpperCase() || "?"}
        </div>
      )}

      {/* Name — sits above the sprite image via the gradient scrim below */}
      {spriteSrc && (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent 40%)", zIndex: 1 }} />
      )}
      <div style={{ fontSize: 11, color: spriteSrc ? "#fff" : `${hex}90`, letterSpacing: "0.05em", fontWeight: 500, position: "relative", zIndex: 2, marginTop: spriteSrc ? "auto" : 0, paddingBottom: spriteSrc ? 6 : 0 }}>
        {opp?.name}
      </div>
    </div>
  );
}
