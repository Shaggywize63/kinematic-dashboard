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
export default function NeuronimbusLogo({ height = 22, style, title = 'Neuronimbus' }: Props) {
  const img: React.CSSProperties = {
    height,
    width: 'auto',
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
