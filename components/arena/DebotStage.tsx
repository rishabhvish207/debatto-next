import React, { useState } from "react";
import { DebucksIcon } from "../ui/DebucksIcon";

const OPP_HEX: Record<number, string> = {
  1:"#5dbb8a",2:"#2dd4bf",3:"#6b9fff",4:"#a78bfa",5:"#f5a623",6:"#38bdf8",
  7:"#ff7070",8:"#e879f9",9:"#fb923c",10:"#6b6b84",11:"#005dce",12:"#c084fc",
};

// Compute default polygon sides: index 0 = circle, last = triangle
function defaultSides(index: number, total: number): number {
  if (index === 0) return 0; // circle
  if (total <= 2) return 3;
  const step = 9 / (total - 2); // distribute 12→3 over remaining debots
  return Math.max(3, Math.round(12 - (index - 1) * step));
}

// SVG polygon points string
function polygonPts(sides: number, cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i / sides) - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function sideLabel(n: number): string {
  if (n === 0) return "○";
  if (n === 3) return "△";
  if (n === 4) return "◇";
  if (n === 6) return "⬡";
  return `${n}`;
}

export function DebotStage({ opps, selectedOpp, onSelect, onUnlock, profile }: any) {
  const [hoveredId, setHoveredId] = useState<any>(null); // cosmetic hover glow only
  const [viewedId, setViewedId] = useState<any>(null);   // which debot the panel is showing
  const [showShapeSettings, setShowShapeSettings] = useState(false);
  const [polygonSides, setPolygonSides] = useState<number[]>(
    () => opps.map((_: any, i: number) => defaultSides(i, opps.length))
  );

  const focusId = selectedOpp?.id ?? viewedId;
  const focus = opps.find((o: any) => o.id === focusId) || null;
  const focusHex = focus ? OPP_HEX[focus.id] : null;

  function adjustSides(index: number, delta: number) {
    setPolygonSides(prev => {
      const next = [...prev];
      const current = next[index];
      if (current === 0) {
        next[index] = delta > 0 ? 3 : 0;
      } else {
        const newVal = current + delta;
        next[index] = newVal < 3 ? 0 : Math.min(12, newVal);
      }
      return next;
    });
  }

  function resetSides() {
    setPolygonSides(opps.map((_: any, i: number) => defaultSides(i, opps.length)));
  }

  // Clicking a card — locked or unlocked — only brings it into focus in the
  // detail panel below. It never selects and never purchases by itself.
  // Selecting happens only via the panel's "Select this Debot" button;
  // purchasing happens only via the panel's "Unlock Debot" button.
  function handleCardClick(o: any) {
    setViewedId(o.id);
  }

  return (
    <div style={{ marginBottom: 32 }}>

      {/* Section label */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, color: "var(--muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Select Debot
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11 }}
          onClick={() => setShowShapeSettings(s => !s)}
        >
          ◈ Shapes {showShapeSettings ? "▲" : "▼"}
        </button>
      </div>

      {/* Shape settings panel */}
      {showShapeSettings && (
        <div className="card anim-fade-up" style={{ padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Debot Polygon Shapes
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {opps.map((o: any, i: number) => (
              <div key={o.id} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--faint)",
              }}>
                <span style={{ fontSize: 11, color: OPP_HEX[o.id], minWidth: 14, textAlign: "center" }}>{o.sym}</span>
                <button
                  onClick={() => adjustSides(i, -1)}
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                >−</button>
                <span style={{ fontSize: 11, color: "var(--text)", minWidth: 16, textAlign: "center", fontFamily: "monospace" }}>
                  {sideLabel(polygonSides[i])}
                </span>
                <button
                  onClick={() => adjustSides(i, 1)}
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                >+</button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10, fontSize: 11 }}
            onClick={resetSides}
          >↺ Reset to default</button>
        </div>
      )}

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

      {/* Horizontal scroll — align-items: flex-end for flat zigzag baseline */}
      <div style={{
        display: "flex",
        gap: 20,
        overflowX: "auto",
        padding: "8px 2px 20px",
        alignItems: "flex-end",   // all cards share bottom baseline
        scrollbarWidth: "none",
        position: "relative",
        zIndex: 1,
      }}>
        {opps.map((o: any, index: number) => {
          const cardSize = 80 + index * 7;
          const isUp = index % 2 === 1;       // odd = lifted
          const sel = selectedOpp?.id === o.id;
          const hov = hoveredId === o.id;
          const hex = OPP_HEX[o.id];
          const sides = polygonSides[index] ?? 0;
          const r = cardSize / 2 - 4;
          const cx = cardSize / 2;
          const cy = cardSize / 2;

          return (
            <div
              key={o.id}
              style={{
                flexShrink: 0,
                marginBottom: isUp ? 52 : 0,  // lift odd cards up from baseline
                position: "relative",
                cursor: "pointer",
                transition: "transform 0.15s, filter 0.15s",
                transform: sel ? "translateY(-5px)" : hov ? "translateY(-2px)" : "none",
                filter: o.unlocked ? "none" : "grayscale(70%)",
                opacity: o.unlocked ? 1 : 0.55,
              }}
              onClick={() => handleCardClick(o)}
              onMouseEnter={() => setHoveredId(o.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* SVG polygon/circle shape */}
              <svg width={cardSize} height={cardSize} style={{ display: "block" }}>
                {sides === 0 ? (
                  <circle
                    cx={cx} cy={cy} r={r}
                    fill={sel ? `${hex}22` : `${hex}10`}
                    stroke={sel ? hex : hov ? `${hex}80` : `${hex}50`}
                    strokeWidth={sel ? 2 : 1.5}
                  />
                ) : (
                  <polygon
                    points={polygonPts(sides, cx, cy, r)}
                    fill={sel ? `${hex}22` : `${hex}10`}
                    stroke={sel ? hex : hov ? `${hex}80` : `${hex}50`}
                    strokeWidth={sel ? 2 : 1.5}
                  />
                )}
                {/* Glow ring on selected */}
                {sel && (sides === 0 ? (
                  <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke={hex} strokeWidth={0.5} opacity={0.3} />
                ) : (
                  <polygon points={polygonPts(sides, cx, cy, r + 3)} fill="none" stroke={hex} strokeWidth={0.5} opacity={0.3} />
                ))}
              </svg>

              {/* Content overlay */}
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 2, padding: "18%",
              }}>
                <div style={{
                  fontSize: Math.max(14, cardSize * 0.22),
                  color: o.color,
                  textShadow: `0 0 12px ${hex}60`,
                  lineHeight: 1,
                }}>{o.sym}</div>

                <div style={{
                  fontSize: Math.max(9, cardSize * 0.1),
                  fontWeight: 600,
                  color: o.unlocked ? "var(--text)" : "var(--muted)",
                  textAlign: "center", lineHeight: 1.2,
                }}>{o.name}</div>

                {cardSize >= 110 && (
                  <div style={{
                    fontSize: Math.max(7, cardSize * 0.073),
                    color: "var(--muted)",
                    textAlign: "center", lineHeight: 1.2,
                  }}>{o.sub}</div>
                )}

                <span style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "1px 4px", borderRadius: 100,
                  fontSize: Math.max(7, cardSize * 0.068),
                  fontWeight: 600,
                  background: `${o.dc}18`, color: o.dc,
                  marginTop: 2,
                }}>{o.diff}</span>

                {!o.unlocked && (
                  <div
                    style={{ fontSize: Math.max(8, cardSize * 0.078), color: o.dc, marginTop: 2, textAlign: "center", cursor: "pointer" }}
                    onClick={e => { e.stopPropagation(); setViewedId(o.id); }}
                  >🔒 <DebucksIcon style={{ marginLeft: 2, marginRight: 1 }} />{o.cost}</div>
                )}

                {sel && (
                  <div style={{ position: "absolute", top: "10%", right: "12%", fontSize: 10, color: hex, fontWeight: 700 }}>✓</div>
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
            <span style={{ fontSize: 26, color: focus.color, textShadow: `0 0 10px ${focusHex}60` }}>{focus.sym}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{focus.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{focus.sub}</div>
            </div>
            <span className="badge" style={{ marginLeft: "auto", background: `${focus.dc}18`, color: focus.dc, fontSize: 10 }}>
              {focus.diff}
            </span>
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 4 }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>Personality: </span>{focus.personality}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>Depth: </span>{focus.depth}
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
              {selectedOpp?.id === focus.id ? "Debot selected ✓" : "Select this Debot →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
