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

  return (
    <div className={shake ? "anim-shake" : ""} style={{
      width: "100%", aspectRatio: "1/1",
      background: `linear-gradient(145deg, ${hex}18, ${hex}08)`,
      border: `1.5px solid ${hex}55`,
      borderRadius: 12,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 5, position: "relative",
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
        }} />
      ))}

      {/* Emotion indicator */}
      {emotion !== "neutral" && (
        <div style={{
          position: "absolute", top: 9, right: 11,
          fontSize: 12, color: ec[emotion] || "transparent",
          fontWeight: "bold", animation: "fadeIn 0.2s"
        }}>
          {em[emotion]}
        </div>
      )}

      {/* Symbol */}
      <div style={{
        fontSize: "clamp(26px,4.5vw,40px)",
        color: opp?.color,
        textShadow: `0 0 14px ${hex}70`,
        transition: "transform 0.2s",
        transform: emotion === "shocked" ? "scale(1.1)" : emotion === "defeated" ? "scale(0.88)" : "scale(1)",
      }}>
        {opp?.sym}
      </div>

      {/* Name */}
      <div style={{ fontSize: 11, color: `${hex}90`, letterSpacing: "0.05em", fontWeight: 500 }}>
        {opp?.name}
      </div>
    </div>
  );
}
