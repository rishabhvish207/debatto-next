// components/ui/PlayerSprite.tsx
import React from "react";

export function PlayerSprite({ shake, name }: { shake: boolean, name: string }) {
  return (
    <div className={shake ? "anim-shake" : ""} style={{
      width: "100%", aspectRatio: "1/1",
      background: "rgba(107,159,255,0.05)", border: "1.5px solid rgba(107,159,255,0.18)",
      borderRadius: 12, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 5, position: "relative",
      transition: "transform 0.4s ease",
    }}>
      <div style={{ fontSize: "clamp(26px,4.5vw,40px)", color: "var(--blue)", textShadow: "0 0 14px rgba(107,159,255,0.4)" }}>'_'</div>
      <div style={{ fontSize: 11, color: "rgba(107,159,255,0.55)", letterSpacing: "0.05em", fontWeight: 500, maxWidth: "80%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </div>
    </div>
  );
}
