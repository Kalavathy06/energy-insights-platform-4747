import React from "react";

/**
 * Simple sparkline line chart using SVG polyline.
 * No external charting dependencies.
 */

// PUBLIC_INTERFACE
export function Sparkline({ data, width = 520, height = 120, stroke = "var(--primary)", fill = "none" }) {
  /** Render a minimal sparkline from [{x, y}] or number[] data. */
  const values = Array.isArray(data)
    ? data.map((d) => (typeof d === "number" ? d : d?.y ?? 0))
    : [];

  if (values.length < 2) {
    return (
      <div className="sparkline-empty" style={{ width, height }}>
        No data
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, idx) => {
      const x = (idx / (values.length - 1)) * (width - 8) + 4;
      const y = height - 6 - ((v - min) / range) * (height - 12);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="sparkline" role="img" aria-label="Energy usage sparkline">
      <polyline points={points} fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
