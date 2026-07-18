'use client';
import React from 'react';

/**
 * Kinematic mark rendered as inline SVG (from public/logo-mark.svg) so the two
 * small circles adapt to the theme automatically: they're filled with
 * `currentColor`, which resolves to `var(--text)` — near-black in light mode
 * and near-white in dark mode. That matches the logo-mark.svg /
 * logo-mark-reverse.svg pair without shipping (or picking between) two raster
 * assets, and stays crisp at any size. The big circle keeps the brand red.
 */
export default function LogoMark({
  size = 28,
  style,
  title = 'Kinematic',
}: {
  size?: number;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 100"
      role="img"
      aria-label={title}
      style={{ height: size, width: 'auto', display: 'block', color: 'var(--text)', flexShrink: 0, ...style }}
    >
      <circle cx="40" cy="50" r="32" fill="#D01E2C" />
      <circle cx="80" cy="32" r="16" fill="currentColor" />
      <circle cx="80" cy="68" r="16" fill="currentColor" />
    </svg>
  );
}
