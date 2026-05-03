'use client';
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
  hint?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

export default function StatCard({ label, value, delta, deltaTone = 'flat', hint, icon, loading }: StatCardProps) {
  const toneColor = deltaTone === 'up' ? 'var(--green)' : deltaTone === 'down' ? 'var(--primary)' : 'var(--text-dim)';
  return (
    <div
      style={{
        background: 'var(--s2)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 110,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>
          {label}
        </div>
        {icon && <div style={{ color: 'var(--text-dim)' }}>{icon}</div>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>
        {loading ? <span style={{ opacity: 0.4 }}>—</span> : value}
      </div>
      {(delta || hint) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          {delta && <span style={{ color: toneColor, fontWeight: 700 }}>{delta}</span>}
          {hint && <span style={{ color: 'var(--text-dim)' }}>{hint}</span>}
        </div>
      )}
    </div>
  );
}
