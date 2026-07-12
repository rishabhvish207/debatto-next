// components/ui/AdvBar.tsx
import React from "react";

export function AdvBar({ pPts, oPts, pLabel, oLabel }: { pPts: number, oPts: number, pLabel: string, oLabel: string }) {
  const total = (pPts + oPts) || 1, pPct = (pPts / total) * 100;
  const ahead = pPts > oPts ? "You lead" : pPts < oPts ? "Behind" : "Tied";
  const ac = pPts > oPts ? "var(--green)" : pPts < oPts ? "var(--red)" : "var(--muted)";
  
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>
        <span>{pLabel} <b style={{ color: "var(--text)" }}>{pPts}</b></span>
        <span style={{ color: ac, fontWeight: 600 }}>{ahead}</span>
        <span>{oLabel} <b style={{ color: "var(--text)" }}>{oPts}</b></span>
      </div>
      <div style={{ height: 7, background: "var(--faint)", borderRadius: 4, display: "flex", overflow: "hidden" }}>
        <div style={{ width: `${pPct}%`, background: "var(--blue)", transition: "width 0.75s ease", borderRadius: "4px 0 0 4px" }} />
        <div style={{ flex: 1, background: "var(--red)", borderRadius: "0 4px 4px 0" }} />
      </div>
    </div>
  );
}
