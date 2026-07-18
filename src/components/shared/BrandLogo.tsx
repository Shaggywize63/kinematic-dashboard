'use client';
import React from 'react';

interface Props {
  /** Rendered box in px (square). */
  size?: number;
  style?: React.CSSProperties;
  title?: string;
  /**
   * Force the dark-surface mark (red + white circles) regardless of theme —
   * use inside always-dark backdrops such as the loading overlay.
   */
  forceDark?: boolean;
}

/**
 * The official Kinematic brand mark, sourced from the real PNG artwork in
 * /public (NOT hand-rendered). Theme-aware: on a light surface it shows the
 * black-dot mark, on a dark surface the white-dot mark. Both files are
 * transparent so they sit on any surface, and the swap is pure CSS
 * (`.brand-logo-light` / `.brand-logo-dark` keyed off `<html data-theme>` in
 * globals.css) so there's no theme-flash.
 */
export default function BrandLogo({ size = 28, style, title = 'Kinematic', forceDark = false }: Props) {
  // NOTE: do NOT set `display` here. The theme swap hides the inactive variant
  // via the `.brand-logo-light` / `.brand-logo-dark` CSS classes, and an inline
  // `display` would override that class rule — leaving BOTH marks visible.
  const img: React.CSSProperties = {
    width: size,
    height: size,
    objectFit: 'contain',
    userSelect: 'none',
    pointerEvents: 'none',
  };

  if (forceDark) {
    // Single image, no swap — safe to force it block.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/logo-k-dark.png" alt={title} title={title} width={size} height={size} style={{ ...img, display: 'block', ...style }} />;
  }

  return (
    <span style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0, ...style }} aria-label={title} title={title}>
      {/* eslint-disable @next/next/no-img-element */}
      <img src="/logo-k-light.png" alt={title} width={size} height={size} className="brand-logo-light" style={img} />
      <img src="/logo-k-dark.png" alt="" aria-hidden width={size} height={size} className="brand-logo-dark" style={img} />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}
