'use client';
import React from 'react';

/**
 * KINI — the friendly AI mascot. A self-contained SVG (no image asset) with
 * built-in SMIL animation: a gentle bob, occasional blink, and a twinkling
 * antenna sparkle. Reads well on both light surfaces (the white button) and
 * the gradient banner. Pass `animate={false}` for a static render.
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
  // useId → colon-free, so the gradient url(#…) refs stay valid.
  const uid = React.useId().replace(/:/g, '');
  const head = `k${uid}head`;
  const screen = `k${uid}screen`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={style}
    >
      <defs>
        <linearGradient id={head} x1="8" y1="14" x2="40" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B7BFF" />
          <stop offset="100%" stopColor="#3E9EFF" />
        </linearGradient>
        <linearGradient id={screen} x1="24" y1="19" x2="24" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#141737" />
          <stop offset="100%" stopColor="#232a5c" />
        </linearGradient>
      </defs>

      <g>
        {animate && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -1.6; 0 0"
            keyTimes="0; 0.5; 1"
            dur="3s"
            calcMode="spline"
            keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
            repeatCount="indefinite"
          />
        )}

        {/* Antenna */}
        <line x1="24" y1="7" x2="24" y2="16" stroke="#8B7BFF" strokeWidth="2.4" strokeLinecap="round" />
        {/* Sparkle */}
        <path d="M24 1.5 L25.5 5 L29 6.5 L25.5 8 L24 11.5 L22.5 8 L19 6.5 L22.5 5 Z" fill="#FFD84D">
          {animate && <animate attributeName="opacity" values="0.45; 1; 0.45" dur="2s" repeatCount="indefinite" />}
        </path>

        {/* Ear pods */}
        <rect x="3.5" y="24" width="5" height="12" rx="2.5" fill="#6E5EF0" />
        <rect x="39.5" y="24" width="5" height="12" rx="2.5" fill="#6E5EF0" />

        {/* Head */}
        <rect x="8" y="14" width="32" height="32" rx="11" fill={`url(#${head})`} />
        {/* Face screen */}
        <rect x="12" y="19" width="24" height="21" rx="8" fill={`url(#${screen})`} />

        {/* Eyes */}
        <ellipse cx="20" cy="28.5" rx="2.6" ry="3.4" fill="#5FE0FF">
          {animate && (
            <animate attributeName="ry" values="3.4; 3.4; 0.5; 3.4" keyTimes="0; 0.9; 0.95; 1" dur="4.2s" repeatCount="indefinite" />
          )}
        </ellipse>
        <ellipse cx="28" cy="28.5" rx="2.6" ry="3.4" fill="#5FE0FF">
          {animate && (
            <animate attributeName="ry" values="3.4; 3.4; 0.5; 3.4" keyTimes="0; 0.9; 0.95; 1" dur="4.2s" repeatCount="indefinite" />
          )}
        </ellipse>

        {/* Smile */}
        <path d="M20 34.5 Q24 37.5 28 34.5" stroke="#5FE0FF" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}
