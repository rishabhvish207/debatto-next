// components/ui/PlayerSprite.tsx
import React from "react";

export function PlayerSprite({ shake, name, avatarUrl }: { shake: boolean, name: string, avatarUrl?: string | null }) {
  return (
    <div className={shake ? "anim-shake" : ""} style={{
      width: "100%", aspectRatio: "1/1",
      background: "rgba(107,159,255,0.05)", border: "1.5px solid rgba(107,159,255,0.18)",
      borderRadius: 12, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 5, position: "relative",
      transition: "transform 0.4s ease", overflow: "hidden",
    }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ fontSize: "clamp(26px,4.5vw,40px)", color: "var(--blue)", textShadow: "0 0 14px rgba(107,159,255,0.4)" }}>'_'</div>
      )}
      <div style={{
        fontSize: 11, color: avatarUrl ? "#fff" : "rgba(107,159,255,0.55)", letterSpacing: "0.05em", fontWeight: 500,
        maxWidth: "80%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        position: avatarUrl ? "absolute" : "static", bottom: avatarUrl ? 4 : undefined,
        background: avatarUrl ? "rgba(0,0,0,0.45)" : "transparent", padding: avatarUrl ? "2px 6px" : 0,
        borderRadius: avatarUrl ? 6 : 0,
      }}>
        {name}
      </div>
    </div>
  );
}
