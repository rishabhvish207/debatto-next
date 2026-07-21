import React, { useState } from "react";
import { DebucksIcon } from "../ui/DebucksIcon";
import { AppIcon } from "../ui/AppIcon";
import { useGame } from "@/contexts/GameContext";

const CARD_SIZE = 92; // uniform for every debot — no more index-based scaling

// SVG polygon points string. sides < 3 is handled by the caller as a circle.
function polygonPts(sides: number, cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i / sides) - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

// Shape + optional sprite image, clipped to the debot's admin-configured
// vertex count (0/1/2 -> circle, 3-20 -> that many-sided polygon).
function DebotShape({ o, size, sel, hov, hex, globalVertices }: { o: any; size: number; sel: boolean; hov: boolean; hex: string; globalVertices?: number | null }) {
  const rawSides = globalVertices ?? o.vertices ?? 0;
  const sides = rawSides < 3 ? 0 : rawSides;
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = sel ? hex : hov ? `${hex}80` : `${hex}50`;
  const fill = sel ? `${hex}22` : `${hex}10`;
  const clipId = `debot-clip-${o.id}-${size}`;

  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <defs>
        <clipPath id={clipId}>
          {sides === 0
            ? <circle cx={cx} cy={cy} r={r} />
            : <polygon points={polygonPts(sides, cx, cy, r)} />}
        </clipPath>
      </defs>

      {sides === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sel ? 2 : 1.5} />
      ) : (
        <polygon points={polygonPts(sides, cx, cy, r)} fill={fill} stroke={stroke} strokeWidth={sel ? 2 : 1.5} />
      )}

      {o.sprite && (
        <foreignObject x="0" y="0" width={size} height={size} clipPath={`url(#${clipId})`}>
          {/* @ts-ignore - xmlns is required inside foreignObject but TS's JSX typing doesn't know it */}
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: size, height: size }}>
            <img
              src={o.sprite}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        </foreignObject>
      )}

      {sel && (sides === 0 ? (
        <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke={hex} strokeWidth={0.5} opacity={0.3} />
      ) : (
        <polygon points={polygonPts(sides, cx, cy, r + 3)} fill="none" stroke={hex} strokeWidth={0.5} opacity={0.3} />
      ))}
    </svg>
  );
}

export function DebotStage({ opps, selectedOpp, onSelect, onUnlock, profile }: any) {
  const { debotVertices, diffBadgeStyle } = useGame();
  const [hoveredId, setHoveredId] = useState<any>(null); // cosmetic hover glow only
  const [viewedId, setViewedId] = useState<any>(null);   // which debot the panel is showing

  const focusId = selectedOpp?.id ?? viewedId;
  const focus = opps.find((o: any) => o.id === focusId) || null;
  const focusHex = focus ? (focus.color || "#6b9fff") : null;

  // Clicking a card — locked or unlocked — only brings it into focus in the
  // detail panel below. It never selects and never purchases by itself.
  function handleCardClick(o: any) {
    setViewedId(o.id);
  }

  return (
    <div style={{ marginBottom: 32 }}>

      {/* Background glow */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: 240,
        background: focusHex
          ? `radial-gradient(ellipse at 50% 60%, ${focusHex}18 0%, transparent 70%)`
          : "transparent",
        filter: "blur(30px)",
        transition: "background 0.5s ease",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Horizontal row — straight baseline, uniform size, no zigzag */}
      <div style={{
        display: "flex",
        gap: 22,
        overflowX: "auto",
        padding: "8px 2px 20px",
        alignItems: "flex-start",
        scrollbarWidth: "none",
        position: "relative",
        zIndex: 1,
      }}>
        {opps.map((o: any) => {
          const sel = selectedOpp?.id === o.id;
          const hov = hoveredId === o.id;
          const hex = o.color || "#6b9fff";

          return (
            <div
              key={o.id}
              style={{
                flexShrink: 0,
                width: CARD_SIZE,
                position: "relative",
                cursor: "pointer",
                transition: "transform 0.15s, filter 0.15s",
                transform: sel ? "translateY(-4px)" : "none",
                filter: o.unlocked ? "none" : "grayscale(70%)",
                opacity: o.unlocked ? 1 : 0.55,
              }}
              onClick={() => handleCardClick(o)}
              onMouseEnter={() => setHoveredId(o.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div style={{ position: "relative" }}>
                <DebotShape o={o} size={CARD_SIZE} sel={sel} hov={hov} hex={hex} globalVertices={debotVertices} />
                {sel && (
                  <div style={{ position: "absolute", top: 2, right: 4, color: hex, display: "flex" }}><AppIcon token="✓" size={13} strokeWidth={3} /></div>
                )}
              </div>

              {/* Details below the shape — name, difficulty, lock/cost */}
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, lineHeight: 1.25,
                  color: o.unlocked ? "var(--text)" : "var(--muted)",
                }}>{o.name}</div>

                <span style={
                  diffBadgeStyle === "plain"
                    ? { display: "inline-block", fontSize: 9, fontWeight: 600, color: o.dc, marginTop: 3 }
                    : { display: "inline-flex", alignItems: "center", padding: "1px 6px", borderRadius: 100, fontSize: 9, fontWeight: 600, background: `${o.dc}18`, color: o.dc, marginTop: 3 }
                }>{o.diff}</span>

                {!o.unlocked && (
                  <div style={{ fontSize: 10, color: o.dc, marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <AppIcon token="🔒" size={11} /> <DebucksIcon style={{ marginLeft: 2, marginRight: 1 }} />{o.cost}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail panel for focused debot */}
      {focus && (
        <div className="card anim-fade-up" style={{
          padding: 16,
          borderColor: `${focusHex}50`,
          background: `${focusHex}08`,
          marginTop: 4,
          position: "relative", zIndex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            {focus.sprite && (
              <div style={{ flexShrink: 0 }}>
                <DebotShape o={focus} size={44} sel={false} hov={false} hex={focusHex || "#6b9fff"} globalVertices={debotVertices} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{focus.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{focus.sub}</div>
            </div>
            <span className={diffBadgeStyle === "plain" ? undefined : "badge"} style={
              diffBadgeStyle === "plain"
                ? { marginLeft: "auto", fontSize: 10, fontWeight: 600, color: focus.dc }
                : { marginLeft: "auto", background: `${focus.dc}18`, color: focus.dc, fontSize: 10 }
            }>
              {focus.diff}
            </span>
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 4 }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>Personality: </span>{focus.personality}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 4 }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>Depth: </span>{focus.depth}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>Story: </span>{focus.story}
          </div>

          {!focus.unlocked ? (
            <button
              className="btn btn-primary"
              style={{
                width: "100%",
                ...(profile.coins < focus.cost
                  ? { background: "transparent", border: "1px solid var(--red)", color: "var(--red)", cursor: "not-allowed" }
                  : {}),
              }}
              disabled={profile.coins < focus.cost}
              onClick={() => onUnlock(focus)}
            >
              {profile.coins < focus.cost
                ? <>Not enough <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />· need {focus.cost}</>
                : <>Unlock Debot · <DebucksIcon style={{ marginLeft: 2, marginRight: 2 }} />{focus.cost}</>}
            </button>
          ) : (
            <button
              className={`btn ${selectedOpp?.id === focus.id ? "btn-ghost" : "btn-primary"}`}
              style={{ width: "100%" }}
              onClick={() => onSelect(selectedOpp?.id === focus.id ? null : focus)}
            >
              selectedOpp?.id === focus.id
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>Debot selected <AppIcon token="✓" size={13} /></span>
                : <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>Select this Debot <AppIcon token="→" size={13} /></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
