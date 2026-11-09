'use client';
// A small bar chart in plain SVG: one bar per week, one hue, values labelled, a part-week drawn lighter.
// Used for team-level signals only, so there is never a person in it.

import { T } from '../ui';

export function WeekBars({ title, values, labels, partial, fmt, floor, fixedMax, refLine, testId }: {
  title: string; values: (number | null)[]; labels: string[]; partial: boolean[]; fmt: (n: number) => string;
  /** The axis never tops out below this, so tiny numbers do not look big. */
  floor: number; fixedMax?: number; refLine?: { value: number; label: string }; testId?: string;
}) {
  const W = 360, H = 150, padL = 8, padR = 8, top = 22, bottom = 34;
  const max = fixedMax ?? Math.max(floor, ...values.filter((v): v is number => v != null)) * 1.15;
  const plotH = H - top - bottom;
  const slot = (W - padL - padR) / values.length;
  const bw = Math.min(34, slot * 0.6);
  const y = (v: number) => top + plotH - (Math.min(v, max) / max) * plotH;
  const desc = `${title}: ` + values.map((v, i) => `${labels[i]}${partial[i] ? ' (part week)' : ''} ${v == null ? 'not available' : fmt(v)}`).join('; ') + '.';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc} data-testid={testId} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <line x1={padL} x2={W - padR} y1={top + plotH} y2={top + plotH} stroke={T.border} strokeWidth={1} />
      {refLine && refLine.value <= max && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(refLine.value)} y2={y(refLine.value)} stroke={T.mute} strokeWidth={1} strokeDasharray="4 3" />
          <text x={W - padR} y={y(refLine.value) - 4} textAnchor="end" fontSize={10.5} fill={T.dim}>{refLine.label}</text>
        </g>
      )}
      {values.map((v, i) => {
        const cx = padL + slot * i + slot / 2;
        const label = labels[i]! + (partial[i] ? '*' : '');
        return (
          <g key={i}>
            {v == null ? (
              <text x={cx} y={top + plotH - 6} textAnchor="middle" fontSize={11} fill={T.mute}>n/a</text>
            ) : (
              <>
                <rect x={cx - bw / 2} y={y(v)} width={bw} height={Math.max(1.5, top + plotH - y(v))} rx={3} fill={T.info} fillOpacity={partial[i] ? 0.45 : 0.9} />
                <text x={cx} y={Math.max(11, y(v) - 5)} textAnchor="middle" fontSize={11} fontWeight={600} fill={T.text}>{fmt(v)}</text>
              </>
            )}
            <text x={cx} y={H - 14} textAnchor="middle" fontSize={10.5} fill={T.dim}>{label}</text>
          </g>
        );
      })}
    </svg>
  );
}
