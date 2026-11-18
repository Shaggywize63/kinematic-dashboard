'use client';
import React from 'react';
import { Sparkles } from 'lucide-react';

export default function AiBadge({ label = 'AI', tone = 'blue' }: { label?: string; tone?: 'blue' | 'green' | 'red' }) {
  const colorMap: Record<string, string> = {
    blue: 'var(--accent)',
    green: 'var(--green)',
    red: 'var(--primary)',
  };
  const color = colorMap[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color,
        background: `${color}1A`,
        border: `1px solid ${color}33`,
      }}
    >
      <Sparkles aria-hidden size={11} strokeWidth={2.2} style={{ flexShrink: 0 }} />{label}
    </span>
  );
}
