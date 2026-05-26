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
  /**
   * Optional title-tooltip on the value — useful when callers pass a
   * compact form (₹2.4L) and want the full Indian-grouped expansion
   * (₹2,40,000) on hover. The dashboard wires this via formatINR().
   */
  valueTitle?: string;
}

/**
 * Dashboard KPI card. The value slot uses font-size: clamp() so a long
 * string ("₹2,40,00,000") still fits inside the box on narrow viewports
 * — the previous fixed 26px overflowed reliably as soon as a value got
 * above ₹100L. Plus a subtle gradient accent rail down the left edge
 * so the cards read as a coherent strip instead of flat panels.
 */
export default function StatCard({
  label, value, delta, deltaTone = 'flat', hint, icon, loading, valueTitle,
}: StatCardProps) {
  const toneColor = deltaTone === 'up' ? 'var(--green)' : deltaTone === 'down' ? 'var(--primary)' : 'var(--text-dim)';
  const accent = deltaTone === 'up' ? 'var(--green, #10b981)' : deltaTone === 'down' ? 'var(--primary, #E01E2C)' : 'var(--primary, #E01E2C)';
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--s2)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 110,
        overflow: 'hidden',
      }}
    >
      {/* Subtle gradient sheen behind the value — keeps the card lit
          even when the bg colour is dark grey. Positioned absolutely so
          it doesn't push content. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(120% 80% at 100% 0%, ${accent}14 0%, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Left accent rail */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0, top: 8, bottom: 8,
          width: 3,
          borderTopRightRadius: 3, borderBottomRightRadius: 3,
          background: `linear-gradient(180deg, ${accent} 0%, ${accent}55 100%)`,
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>
          {label}
        </div>
        {icon && <div style={{ color: 'var(--text-dim)' }}>{icon}</div>}
      </div>
      <div
        title={valueTitle}
        style={{
          // clamp(min, fluid, max) — adapts the size between roughly
          // 18px and 28px based on the card's width, so long numbers
          // shrink instead of overflowing the box.
          fontSize: 'clamp(18px, 4.2vw, 28px)',
          fontWeight: 800,
          color: 'var(--text)',
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          position: 'relative',
        }}
      >
        {loading ? <span style={{ opacity: 0.4 }}>—</span> : value}
      </div>
      {(delta || hint) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, position: 'relative' }}>
          {delta && <span style={{ color: toneColor, fontWeight: 700 }}>{delta}</span>}
          {hint && <span style={{ color: 'var(--text-dim)' }}>{hint}</span>}
        </div>
      )}
    </div>
  );
}
