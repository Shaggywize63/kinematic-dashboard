'use client';
import React, { useState } from 'react';

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
 * Prefers the OFFICIAL full logo at `/public/neuronimbus.png`. Drop that file
 * in (a transparent PNG of the whole mark + wordmark, with a light/white
 * wordmark so it reads on the dark sidebar) and it takes over automatically —
 * no code change. Until it exists, an onError handler falls back to a lockup of
 * the real node-mark (`/public/neuronimbus-mark.png`) + a rendered
 * "neuronimbus" wordmark coloured `var(--text)` (white on dark, dark on light).
 */
export default function NeuronimbusLogo({ height = 22, style, title = 'Neuronimbus' }: Props) {
  const [officialFailed, setOfficialFailed] = useState(false);
  const wrap: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height,
    flexShrink: 0,
    ...style,
  };

  // Preferred: the official full-logo PNG the client uploads.
  if (!officialFailed) {
    return (
      <span style={wrap} aria-label={title} title={title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/neuronimbus.png"
          alt={title}
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
          onError={() => setOfficialFailed(true)}
        />
      </span>
    );
  }

  // Fallback: real node-mark + rendered wordmark lockup.
  return (
    <span style={{ ...wrap, gap: Math.round(height * 0.3) }} aria-label={title} title={title}>
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
