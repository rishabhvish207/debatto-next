import React from "react";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function HPBar({ current, max, color }: { current: number, max: number, color: string }) {
  const pct = clamp((current / max) * 100, 0, 100);
  const low = pct < 28;
  return (
    <div style={{ height: 6, background: "var(--faint)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 3,
        background: low ? "var(--red)" : color,
        transition: "width 0.75s ease",
      }} />
    </div>
  );
}
