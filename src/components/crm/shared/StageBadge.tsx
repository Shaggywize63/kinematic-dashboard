'use client';
import React from 'react';

export default function StageBadge({ name, color, won, lost }: { name?: string | null; color?: string | null; won?: boolean; lost?: boolean }) {
  const bg = won ? 'rgba(40,180,99,0.18)' : lost ? 'rgba(224,30,44,0.18)' : color ? `${color}33` : 'rgba(255,255,255,0.06)';
  const fg = won ? 'var(--green)' : lost ? 'var(--primary)' : color || 'var(--text)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color: fg,
        background: bg,
        border: `1px solid ${color || 'var(--border)'}`,
      }}
    >
      {name || 'Stage'}
    </span>
  );
}
