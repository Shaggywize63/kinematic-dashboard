'use client';
// One pay band drawn as a range: minimum to maximum, the midpoint, a sample market marker, and (in the HR view only) a dot per
// person with their name on hover. Plain SVG; colours come from CSS variables so it reads in light and dark.

import { useMemo } from 'react';
import { T } from '../../ui';
import { fullName, inr, inrShort } from '../../../../lib/hrms/format';
import type { BandPerson } from '../../../../lib/hrms/rewards/engines';
import type { Band } from '../../../../lib/hrms/rewards/types';

const W = 640;
const PAD = 28;
const POS_COLOR = { below: 'var(--warn)', in: 'var(--info)', above: 'var(--red)' } as const;
const POS_LABEL = { below: 'below the band', in: 'inside the band', above: 'above the band' } as const;

export default function RangeChart({ band, people, showPeople, showMarket = true, showMid = true }: { band: Band; people: BandPerson[]; showPeople: boolean; showMarket?: boolean; showMid?: boolean }) {
  const { x, dots } = useMemo(() => {
    const values = [band.min, band.max, ...(showMarket ? [band.market] : []), ...people.map((p) => p.ctc)];
    const low = Math.min(...values) * 0.96;
    const high = Math.max(...values) * 1.04;
    const sx = (v: number) => PAD + ((v - low) / (high - low)) * (W - PAD * 2);
    // Lanes: dots closer than 14px share the x range, so push them into the next lane to keep every dot visible.
    const lanes: number[][] = [];
    const placed = [...people].sort((a, b) => a.ctc - b.ctc).map((p) => {
      const px = sx(p.ctc);
      let lane = lanes.findIndex((l) => l.every((o) => Math.abs(o - px) >= 14));
      if (lane < 0) { lanes.push([]); lane = lanes.length - 1; }
      lanes[lane]!.push(px);
      return { p, px, lane };
    });
    return { x: sx, dots: placed };
  }, [band, people, showMarket]);

  const lanesUsed = Math.max(1, ...dots.map((d) => d.lane + 1));
  const trackY = 34;
  const dotsTop = trackY + 26;
  const H = showPeople ? dotsTop + lanesUsed * 16 + 8 : 86;
  const counts = { below: people.filter((p) => p.position === 'below').length, in: people.filter((p) => p.position === 'in').length, above: people.filter((p) => p.position === 'above').length };
  const label = `Pay band ${band.grade}: ${inr(band.min)} to ${inr(band.max)}${showMid ? `, midpoint ${inr(band.mid)}` : ''}.${showPeople ? ` ${people.length} people: ${counts.below} below, ${counts.in} inside, ${counts.above} above.` : ''}`;
  const text = { fontSize: 11.5, fill: T.dim } as const;

  return (
    <svg data-testid={`range-${band.grade}`} role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 760, height: 'auto', display: 'block', overflow: 'visible' }}>
      <title>{label}</title>
      <rect x={PAD} y={trackY - 8} width={W - PAD * 2} height={16} rx={8} style={{ fill: T.raised }} />
      <rect x={x(band.min)} y={trackY - 8} width={x(band.max) - x(band.min)} height={16} rx={8} style={{ fill: 'var(--info-w)', stroke: 'var(--info)', strokeWidth: 1.2 }} />
      {showMid && <line x1={x(band.mid)} x2={x(band.mid)} y1={trackY - 13} y2={trackY + 13} style={{ stroke: 'var(--info)', strokeWidth: 2 }} />}
      <text x={x(band.min)} y={trackY - 16} textAnchor="middle" style={text}>{inrShort(band.min)}</text>
      {showMid && <text x={x(band.mid)} y={trackY - 16} textAnchor="middle" style={{ ...text, fill: T.text, fontWeight: 600 }}>Mid {inrShort(band.mid)}</text>}
      <text x={x(band.max)} y={trackY - 16} textAnchor="middle" style={text}>{inrShort(band.max)}</text>
      {showMarket && (
        <g>
          <path d={`M ${x(band.market)} ${trackY + 12} l 5 6 l -5 6 l -5 -6 z`} style={{ fill: 'var(--card)', stroke: 'var(--warn)', strokeWidth: 1.6 }}>
            <title>{`Market median ${inr(band.market)} (sample, not verified)`}</title>
          </path>
        </g>
      )}
      {showPeople && dots.map(({ p, px, lane }) => (
        <circle key={p.employee.id} data-testid={`dot-${p.employee.id}`} data-position={p.position} cx={px} cy={dotsTop + lane * 16} r={6}
          style={{ fill: POS_COLOR[p.position], stroke: 'var(--card)', strokeWidth: 1.5 }}>
          <title>{`${fullName(p.employee)}, ${inr(p.ctc)}, compa-ratio ${p.compa.toFixed(2)}, ${POS_LABEL[p.position]}`}</title>
        </circle>
      ))}
      {!showPeople && <text x={PAD} y={H - 6} style={text}>Names and individual pay are not shown in this view.</text>}
    </svg>
  );
}

export function ChartLegend({ showMarket = true }: { showMarket?: boolean }) {
  const item = (c: string, l: string, diamond?: boolean) => (
    <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.dim }}>
      {diamond ? <span style={{ width: 9, height: 9, transform: 'rotate(45deg)', border: `1.6px solid ${c}`, background: 'var(--card)' }} /> : <span style={{ width: 10, height: 10, borderRadius: 99, background: c }} />}
      {l}
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {item(POS_COLOR.in, 'Inside the band')}{item(POS_COLOR.below, 'Below the minimum')}{item(POS_COLOR.above, 'Above the maximum')}
      {showMarket && item('var(--warn)', 'Market median (sample)', true)}
    </div>
  );
}
