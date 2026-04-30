'use client';
import React from 'react';

/**
 * Low-battery surfacing for the Live Tracking page.
 *
 * The page already renders `battery_percentage` next to each FE marker.
 * These two small components make low-battery situations *prominent* so a
 * supervisor can call the FE before they drop offline:
 *
 *   - <LowBatteryAlert ...>  → dismissible banner shown when one or more
 *                              checked-in FEs have battery < CRITICAL_PCT.
 *   - <LowBatteryFilter ...> → toggle chip that filters the FE list down to
 *                              FEs whose battery is < WARNING_PCT.
 *
 * Both helpers are stateless presentational components — the page owns the
 * "filter on/off" state and the FE list.
 */

const CRITICAL_PCT = 10;
const WARNING_PCT  = 20;

const COLORS = {
  red:    'var(--primary)',
  redD:   'rgba(224,30,44,0.10)',
  redB:   'rgba(224,30,44,0.30)',
  yellow: '#FFB800',
  yellowD:'rgba(255,184,0,0.10)',
  text:   'var(--text)',
  dim:    'var(--text-dim)',
  s2:     'var(--s2)',
  s3:     'var(--s3)',
  border: 'var(--border)',
};

export interface FELowBatteryShape {
  id: string;
  name: string;
  status: 'active' | 'on_break' | 'checked_out' | 'absent';
  battery_percentage?: number | null;
}

export const LOW_BATTERY = {
  CRITICAL_PCT,
  WARNING_PCT,
  /** Critical = checked-in FE under 10% — they will likely vanish soon. */
  isCritical: (fe: FELowBatteryShape) =>
    (fe.status === 'active' || fe.status === 'on_break') &&
    typeof fe.battery_percentage === 'number' &&
    fe.battery_percentage < CRITICAL_PCT,
  /** Warning = any FE under 20% — suitable for the filter chip. */
  isWarning: (fe: FELowBatteryShape) =>
    typeof fe.battery_percentage === 'number' &&
    fe.battery_percentage < WARNING_PCT,
};

/* ── KPI tile (drop into the existing KPI strip) ───────────────── */
export function LowBatteryKpi({ fes }: { fes: FELowBatteryShape[] }) {
  const count = fes.filter(LOW_BATTERY.isWarning).length;
  return (
    <div style={{
      background: COLORS.s2, border: `1px solid ${COLORS.border}`,
      borderRadius: 12, padding: '10px 16px', textAlign: 'center', flex: 1,
    }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800,
                    color: count > 0 ? COLORS.red : COLORS.dim }}>
        {count}
      </div>
      <div style={{ fontSize: 10, color: COLORS.dim, marginTop: 2 }}>
        Low Battery
      </div>
    </div>
  );
}

/* ── Banner shown above the map when a critical FE is detected ─── */
export function LowBatteryAlert({
  fes,
  dismissed,
  onDismiss,
}: {
  fes: FELowBatteryShape[];
  dismissed: boolean;
  onDismiss: () => void;
}) {
  if (dismissed) return null;
  const critical = fes.filter(LOW_BATTERY.isCritical);
  if (critical.length === 0) return null;

  const names = critical.slice(0, 3).map(f => f.name).join(', ');
  const more  = critical.length > 3 ? ` and ${critical.length - 3} more` : '';

  return (
    <div role="alert" style={{
      padding: '10px 14px', background: COLORS.redD,
      border: `1px solid ${COLORS.redB}`, borderRadius: 10,
      fontSize: 12, color: COLORS.red, display: 'flex',
      alignItems: 'center', gap: 8, flexShrink: 0,
    }}>
      <span aria-hidden="true">🔋</span>
      <strong>Critical battery:</strong>
      <span style={{ color: COLORS.text }}>
        {names}{more} under {CRITICAL_PCT}% — call before they drop offline.
      </span>
      <button onClick={onDismiss} aria-label="Dismiss low battery alert"
        style={{
          marginLeft: 'auto', background: 'transparent',
          border: `1px solid ${COLORS.redB}`, borderRadius: 6,
          color: COLORS.red, cursor: 'pointer', fontSize: 11,
          padding: '2px 8px',
        }}>
        ✕
      </button>
    </div>
  );
}

/* ── Filter chip (drop into the existing filter row) ─────────── */
export function LowBatteryFilter({
  active,
  onToggle,
  count,
}: {
  active: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <button onClick={onToggle}
      style={{
        padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
        border: `1.5px solid ${active ? COLORS.red : COLORS.border}`,
        background: active ? COLORS.redD : COLORS.s3,
        color: active ? COLORS.red : COLORS.dim,
        fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
        display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s',
      }}
      aria-pressed={active}>
      <span aria-hidden="true">🔋</span>
      <span>Low battery only{count > 0 ? ` (${count})` : ''}</span>
    </button>
  );
}
