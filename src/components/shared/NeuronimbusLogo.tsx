'use client';
import React, { useState } from 'react';

interface Props {
  /** Rendered height in px (logo/mark height). */
  height?: number;
  style?: React.CSSProperties;
  title?: string;
}

/**
 * Neuronimbus partner logo — surfaced only on the demo account's dashboard
 * sidebar footer.
 *
 * Prefers the OFFICIAL vector logo at `/public/neuronimbus.svg` (a transparent
 * SVG of the whole mark + wordmark, with a light/white wordmark so it reads on
 * the dark sidebar). Drop that file in and it takes over automatically — no
 * code change. Until it exists, an onError handler falls back to a lockup of
 * the real transparent node-mark (`/public/neuronimbus.png`) + a rendered
 * "neuronimbus" wordmark coloured `var(--text)` (white on dark, dark on light).
 */
export default function NeuronimbusLogo({ height = 22, style, title = 'Neuronimbus' }: Props) {
  const [svgFailed, setSvgFailed] = useState(false);
  const wrap: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height,
    flexShrink: 0,
    ...style,
  };
  const imgBase: React.CSSProperties = {
    height,
    width: 'auto',
    maxWidth: 'none',
    flexShrink: 0,
    display: 'block',
    objectFit: 'contain',
    userSelect: 'none',
    pointerEvents: 'none',
  };

  // Preferred: the official full-logo SVG the client uploads.
  if (!svgFailed) {
    return (
      <span style={wrap} aria-label={title} title={title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/neuronimbus.svg" alt={title} style={imgBase} onError={() => setSvgFailed(true)} />
      </span>
    );
  }

  // Fallback: real transparent node-mark + rendered wordmark lockup.
  return (
    <span style={{ ...wrap, gap: Math.round(height * 0.3) }} aria-label={title} title={title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/neuronimbus.png" alt="" aria-hidden style={imgBase} />
      <span
        style={{
          color: 'var(--text)',
          fontWeight: 600,
          fontSize: Math.round(height * 0.72),
          letterSpacing: '-0.3px',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          fontFamily: "'Poppins','Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif",
        }}
      >
        neuronimbus
      </span>
    </span>
  );
}
