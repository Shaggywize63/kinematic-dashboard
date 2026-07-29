'use client';
import React from 'react';

interface Props {
  /** Rendered height in px (mark height); wordmark scales from it. */
  height?: number;
  style?: React.CSSProperties;
  title?: string;
}

/**
 * Neuronimbus partner logo — surfaced only on the demo account's dashboard
 * sidebar footer.
 *
 * A lockup of the official node-mark (`/public/neuronimbus-mark.png`, the real
 * artwork with its white background made transparent) + the "neuronimbus"
 * wordmark. The wordmark colour is `var(--text)`, so it's white on the dark
 * sidebar and dark on the light theme; the light-blue mark reads on both.
 *
 * To use a fully official lockup instead, drop a transparent PNG of the whole
 * mark + wordmark in as `/public/neuronimbus.png` and swap the two nodes below
 * for a single <img src="/neuronimbus.png">.
 */
export default function NeuronimbusLogo({ height = 22, style, title = 'Neuronimbus' }: Props) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(height * 0.3),
        height,
        flexShrink: 0,
        ...style,
      }}
      aria-label={title}
      title={title}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/neuronimbus-mark.png"
        alt=""
        aria-hidden
        style={{
          height,
          width: 'auto',
          maxWidth: 'none',
          flexShrink: 0,
          display: 'block',
          objectFit: 'contain',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
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
