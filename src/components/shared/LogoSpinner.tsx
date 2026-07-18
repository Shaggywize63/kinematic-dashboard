'use client';
import React from 'react';
import LogoMark from './LogoMark';

interface Props {
  size?: number;
  label?: string;
  /** Solid backdrop behind the spinner (use inside an absolute overlay). */
  overlay?: boolean;
}

/**
 * Kinematic-branded loading spinner. Renders the theme-aware LogoMark (so the
 * small circles are dark in light mode / white in dark mode) with a soft pulse.
 * Drop it anywhere a network round-trip is waiting on a response.
 *
 * Pass `overlay` to render a semi-transparent backdrop — useful when placing it
 * absolutely on top of a section that's about to update.
 */
export default function LogoSpinner({ size = 48, label, overlay = false }: Props) {
  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {/* Keyframe injected inline so the pulse works wherever the spinner is
          used. Without this the logo sat static. */}
      <style>{`@keyframes logoPulse{0%,100%{transform:scale(1);opacity:.82}50%{transform:scale(1.14);opacity:1}}`}</style>
      <LogoMark
        size={size}
        title="Loading"
        style={{
          animation: 'logoPulse 1.2s ease-in-out infinite',
          filter: 'drop-shadow(0 4px 12px rgba(208,30,44,0.35))',
          // The overlay backdrop is always dark, so keep the small circles
          // white there regardless of theme; inline usage follows the theme.
          ...(overlay ? { color: '#fff' } : {}),
        }}
      />
      {label && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 0.4 }}>
          {label}
        </div>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(10,14,30,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, borderRadius: 'inherit',
      }}>
        {inner}
      </div>
    );
  }
  return inner;
}
