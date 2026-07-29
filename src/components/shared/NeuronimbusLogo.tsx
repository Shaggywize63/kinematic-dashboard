'use client';
import React from 'react';

interface Props {
  /** Rendered height in px; width scales by the artwork's aspect ratio. */
  height?: number;
  style?: React.CSSProperties;
  title?: string;
}

/**
 * Neuronimbus partner logo — surfaced only on the demo account's dashboard
 * header (top-right). Rendered from the SVG artwork in /public (NOT hand-drawn
 * inline), theme-aware via the same `.brand-logo-light` / `.brand-logo-dark`
 * CSS swap the Kinematic BrandLogo uses: the white-wordmark variant shows on
 * the dark header (default theme), the navy-wordmark variant on the light one.
 *
 * The two SVGs are a faithful recreation of the Neuronimbus mark; to use the
 * official artwork just replace /public/neuronimbus-dark.svg and
 * /public/neuronimbus-light.svg — no code change required.
 */
// Aspect ratio of the shipped artwork (viewBox 226×44). Used to give the
// <img> an EXPLICIT width box so it can never collapse to 0px — some browsers
// (Firefox/Safari) render an SVG-in-<img> at 0 width when it has no intrinsic
// size and CSS only sets height:auto width. object-fit:contain means a swapped
// file of a slightly different ratio letterboxes instead of distorting.
const LOGO_ASPECT = 226 / 44;

export default function NeuronimbusLogo({ height = 22, style, title = 'Neuronimbus' }: Props) {
  const width = Math.round(height * LOGO_ASPECT);
  const img: React.CSSProperties = {
    height,
    width,
    // Defeat any global/responsive `img { max-width: 100% }` clamp, which would
    // otherwise shrink the width while the height stays fixed and squish the
    // artwork. Keep a fixed, non-zero box at the artwork's true aspect ratio.
    maxWidth: 'none',
    flexShrink: 0,
    objectFit: 'contain',
    userSelect: 'none',
    pointerEvents: 'none',
  };
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', height, flexShrink: 0, ...style }}
      aria-label={title}
      title={title}
    >
      {/* eslint-disable @next/next/no-img-element */}
      <img src="/neuronimbus-light.svg" alt={title} className="brand-logo-light" style={img} />
      <img src="/neuronimbus-dark.svg" alt="" aria-hidden className="brand-logo-dark" style={img} />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}
