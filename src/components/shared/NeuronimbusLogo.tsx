'use client';
/* eslint-disable @next/next/no-img-element */
import React, { useState } from 'react';

interface Props {
  /** Rendered height in px; width scales by the artwork's aspect ratio. */
  height?: number;
  style?: React.CSSProperties;
  title?: string;
}

// Aspect ratio of the fallback artwork (viewBox 226×44). Used to give the
// <img> an EXPLICIT width box so it can never collapse to 0px — some browsers
// (Firefox/Safari) render an SVG-in-<img> at 0 width when it has no intrinsic
// size and CSS only sets the height. object-fit:contain means a real logo of a
// slightly different ratio letterboxes instead of distorting.
const LOGO_ASPECT = 226 / 44;

/**
 * Neuronimbus partner logo — surfaced only on the demo account's dashboard
 * sidebar footer.
 *
 * Prefers the OFFICIAL artwork at `/public/neuronimbus.png`. Just drop that
 * file into `public/` (transparent PNG, wordmark light enough to read on the
 * dark sidebar) and it takes over automatically — no code change. Until the
 * PNG exists, it falls back to a theme-aware SVG recreation (white wordmark on
 * the dark theme, navy on the light one) so the slot is never empty.
 */
export default function NeuronimbusLogo({ height = 22, style, title = 'Neuronimbus' }: Props) {
  const [pngFailed, setPngFailed] = useState(false);
  const width = Math.round(height * LOGO_ASPECT);
  const box: React.CSSProperties = {
    height,
    // Fixed, non-zero box so the image can never collapse to 0px width, and a
    // global/responsive `img { max-width: 100% }` clamp can't squish it.
    maxWidth: 'none',
    flexShrink: 0,
    objectFit: 'contain',
    userSelect: 'none',
    pointerEvents: 'none',
  };
  const wrap: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height,
    flexShrink: 0,
    ...style,
  };

  if (!pngFailed) {
    // The official PNG is a full-colour logo on a WHITE background (blue mark +
    // navy wordmark), so it's rendered on a small white rounded "chip" — that
    // makes it read as an intentional partner badge on the dark sidebar instead
    // of a stray white bar. Width auto-scales from the fixed height.
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: '#ffffff',
          borderRadius: 6,
          padding: '3px 8px',
          flexShrink: 0,
          ...style,
        }}
        aria-label={title}
        title={title}
      >
        <img
          src="/neuronimbus.png"
          alt={title}
          style={{ ...box, width: 'auto', display: 'block' }}
          onError={() => setPngFailed(true)}
        />
      </span>
    );
  }

  // Fallback: theme-aware SVG recreation (swapped by the same
  // `.brand-logo-light` / `.brand-logo-dark` CSS the Kinematic BrandLogo uses).
  return (
    <span style={wrap} aria-label={title} title={title}>
      <img src="/neuronimbus-light.svg" alt={title} className="brand-logo-light" style={{ ...box, width }} />
      <img src="/neuronimbus-dark.svg" alt="" aria-hidden className="brand-logo-dark" style={{ ...box, width }} />
    </span>
  );
}
