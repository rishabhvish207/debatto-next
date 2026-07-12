import React from "react";

// A coin outline (currency) with a bold serif "D" (Debucks) and a small
// curling stroke evoking a quotation mark (debate). Inherits color via
// currentColor so it always matches whatever amber/text color wraps it.
export function DebucksIcon({
  size = 14,
  style,
}: {
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "inline-block", verticalAlign: "-2px", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10.5" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <text
        x="12"
        y="16.3"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif"
        fill="currentColor"
      >
        D
      </text>
      {/* small curl nodding to a quotation mark — the "debate" half of Debucks */}
      <path
        d="M6.3 8.1c-.9.35-1.35 1.25-1 2.15"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}
