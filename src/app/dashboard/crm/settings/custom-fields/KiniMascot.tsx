'use client';
import React from 'react';

/**
 * KINI — the official Kinematic AI mascot, drawn as a self-contained SVG (no
 * image asset) so it stays crisp at any size and can animate. A red robot with
 * a cream face, glossy eyes, pink cheeks, side ear-pods and a "K" antenna
 * badge. Built-in SMIL animation: a gentle bob + an occasional blink.
 * Colours are fixed (brand red) so it looks identical on every surface.
 * Pass `animate={false}` for a static render.
 */
export default function KiniMascot({
  size = 24,
  animate = true,
  style,
}: {
  size?: number;
  animate?: boolean;
  style?: React.CSSProperties;
}) {
  const uid = React.useId().replace(/:/g, '');
  const headG = `k${uid}head`;

  const RED = '#E5202B';
  const RED_DARK = '#D11B24';
  const CREAM = '#F7F2EC';
  const INK = '#17191F';
  const PINK = '#F4A6B4';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={style}
    >
      <defs>
        <linearGradient id={headG} x1="50" y1="35" x2="50" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EC2A33" />
          <stop offset="100%" stopColor={RED} />
        </linearGradient>
      </defs>

      <g>
        {animate && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -1.8; 0 0"
            keyTimes="0; 0.5; 1"
            dur="3s"
            calcMode="spline"
            keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
            repeatCount="indefinite"
          />
        )}

        {/* Antenna stem */}
        <line x1="50" y1="24" x2="50" y2="38" stroke={RED} strokeWidth="3" strokeLinecap="round" />
        {/* Antenna badge — cream disc, red ring + "K" */}
        <circle cx="50" cy="14" r="11" fill={CREAM} stroke={RED} strokeWidth="2.4" />
        <g stroke={RED} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M46 9 L46 19" />
          <path d="M46 14.2 L52 9" />
          <path d="M46 14.2 L52 19" />
        </g>

        {/* Ear pods (behind head) */}
        <rect x="10" y="58" width="9" height="20" rx="4.5" fill={RED_DARK} />
        <rect x="81" y="58" width="9" height="20" rx="4.5" fill={RED_DARK} />

        {/* Head */}
        <rect x="17" y="35" width="66" height="60" rx="20" fill={`url(#${headG})`} />
        {/* Glossy highlight */}
        <ellipse cx="36" cy="50" rx="14" ry="8" fill="#ffffff" opacity="0.22" transform="rotate(-22 36 50)" />

        {/* Face screen */}
        <rect x="28" y="45" width="44" height="38" rx="14" fill={CREAM} />

        {/* Eyes */}
        <ellipse cx="41" cy="62" rx="5.6" ry="6.9" fill={INK}>
          {animate && (
            <animate attributeName="ry" values="6.9; 6.9; 0.6; 6.9" keyTimes="0; 0.9; 0.95; 1" dur="4.2s" repeatCount="indefinite" />
          )}
        </ellipse>
        <ellipse cx="59" cy="62" rx="5.6" ry="6.9" fill={INK}>
          {animate && (
            <animate attributeName="ry" values="6.9; 6.9; 0.6; 6.9" keyTimes="0; 0.9; 0.95; 1" dur="4.2s" repeatCount="indefinite" />
          )}
        </ellipse>
        {/* Eye glints */}
        <circle cx="38.6" cy="59" r="1.9" fill="#ffffff" />
        <circle cx="56.6" cy="59" r="1.9" fill="#ffffff" />

        {/* Cheeks */}
        <circle cx="33.5" cy="69" r="4.2" fill={PINK} opacity="0.9" />
        <circle cx="66.5" cy="69" r="4.2" fill={PINK} opacity="0.9" />

        {/* Smile */}
        <path d="M42 71.5 Q50 80 58 71.5" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />

        {/* Speaker / mouth slot */}
        <rect x="38" y="88" width="24" height="3.6" rx="1.8" fill={RED_DARK} />
      </g>
    </svg>
  );
}
