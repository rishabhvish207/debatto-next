// components/game/WeakText.tsx
import React from "react";

export function WeakText({ text, weakPoints, fallacies }: { text: string, weakPoints: string[], fallacies: any[] }) {
  if (!text) return null;
  const markers = [
    ...(weakPoints || []).map((t: string) => ({ text: t, kind: "weak" })),
    ...(fallacies || []).map((f: any) => ({ text: f.text, kind: "fallacy", label: f.type })),
  ].filter(m => m.text?.trim());
  
  if (!markers.length) return <span>{text}</span>;
  
  const regex = new RegExp(`(${markers.map(m => m.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  
  return (
    <>
      {text.split(regex).map((p, i) => {
        const m = markers.find(x => x.text.toLowerCase() === p.toLowerCase());
        if (!m) return <span key={i}>{p}</span>;
        const isF = m.kind === "fallacy";
        return (
          <span key={i} title={isF ? `Fallacy: ${m.label}` : "Weak point — attack this"}
            style={{
              background: isF ? "rgba(255,112,112,0.18)" : "rgba(245,166,35,0.18)",
              color: isF ? "var(--red)" : "var(--amber)",
              borderRadius: 3, padding: "1px 3px",
              borderBottom: isF ? "1.5px solid var(--red)" : "1.5px solid var(--amber)",
              cursor: "help",
            }}>{p}</span>
        );
      })}
    </>
  );
}
