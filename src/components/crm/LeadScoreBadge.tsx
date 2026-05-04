'use client';
import React from 'react';

const GRADE_COLORS: Record<string, string> = {
  A: '#28B463',
  B: '#7B61FF',
  C: '#F7B538',
  D: '#E01E2C',
};

export default function LeadScoreBadge({ score, grade }: { score?: number | null; grade?: 'A' | 'B' | 'C' | 'D' | null }) {
  const inferred = grade || (score == null ? null : score >= 75 ? 'A' : score >= 50 ? 'B' : score >= 25 ? 'C' : 'D');
  const color = inferred ? GRADE_COLORS[inferred] : 'var(--text-dim)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background: `${color}1A`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {inferred && <span>{inferred}</span>}
      <span style={{ fontWeight: 700 }}>{score == null ? '—' : Math.round(score)}</span>
    </span>
  );
}
