'use client';
// Trends: the engagement index per team over the last four closed pulses (SVG), and what improved or declined with the
// number of responses behind it. Team and company level only: no names, no per-person results, no manager ranking.

import { Badge, Card, CardTitle, T, useIsCompact } from '../../ui';
import { NOT_ENOUGH, highlights, trendSeries, type Highlight, type TrendSeries } from '../../../../lib/hrms/people/engagementEngine';
import { TEAMS } from '../../../../lib/hrms/people/teams';
import type { EngagementState } from '../../../../lib/hrms/people/types';
import { Muted, SERIES, Stack, ROW_TH } from '../shared';
import type { EngagementView } from './view';

/** A y-range that fits the data with a little room, in steps of 0.5, never beyond the 1 to 5 scale. */
function yRange(series: TrendSeries[]): { lo: number; hi: number } {
  const vals = series.flatMap((s) => s.points.map((p) => p.index)).filter((v): v is number => v != null);
  if (vals.length === 0) return { lo: 1, hi: 5 };
  let lo = Math.max(1, Math.floor((Math.min(...vals) - 0.3) * 2) / 2);
  let hi = Math.min(5, Math.ceil((Math.max(...vals) + 0.3) * 2) / 2);
  if (hi - lo < 1) { hi = Math.min(5, lo + 1); lo = Math.max(1, hi - 1); }
  return { lo, hi };
}

function TrendChart({ series, labels, lo, hi }: { series: TrendSeries[]; labels: string[]; lo: number; hi: number }) {
  const narrow = useIsCompact(640);
  const W = narrow ? 360 : 720;
  const H = narrow ? 240 : 250;
  const m = { l: 38, r: narrow ? 16 : 200, t: 14, b: 34 };
  const x = (i: number) => m.l + (labels.length === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (labels.length - 1));
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.5) ticks.push(t);

  // End-of-line labels, nudged apart so two series that end at the same value do not print on top of each other.
  const ends = series.map((s, si) => {
    const pts = s.points.map((p, i) => ({ p, i })).filter((q) => q.p.index != null);
    const last = pts[pts.length - 1];
    return last ? { si, y: y(last.p.index!), x: x(last.i), text: `${s.name} ${last.p.index!.toFixed(1)}` } : null;
  }).filter((e): e is { si: number; y: number; x: number; text: string } => !!e).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k]!.y - ends[k - 1]!.y < 16) ends[k]!.y = ends[k - 1]!.y + 16;

  return (
    <svg role="img" aria-label="Engagement index per team over the last four pulses" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
          <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--mute)">{t.toFixed(1)}</text>
        </g>
      ))}
      {labels.map((l, i) => <text key={l} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11.5} fill="var(--dim)">{l}</text>)}
      {series.map((s, si) => {
        const color = SERIES[si % SERIES.length]!;
        const segs: string[] = [];
        let cur: string[] = [];
        s.points.forEach((p, i) => {
          if (p.index == null) { if (cur.length > 1) segs.push(cur.join(' ')); cur = []; } else cur.push(`${x(i)},${y(p.index)}`);
        });
        if (cur.length > 1) segs.push(cur.join(' '));
        return (
          <g key={s.id}>
            {segs.map((pts, k) => <polyline key={k} points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
            {s.points.map((p, i) => p.index == null ? null : (
              <circle key={i} cx={x(i)} cy={y(p.index)} r={4.5} fill={color} stroke="var(--card)" strokeWidth={2}>
                <title>{`${s.name}, ${labels[i]}: ${p.index.toFixed(2)} of 5 (${p.n} responses)`}</title>
              </circle>
            ))}
          </g>
        );
      })}
      {!narrow && ends.map((e) => <text key={e.si} x={e.x + 12} y={e.y + 4} fontSize={12} fill="var(--text)">{e.text}</text>)}
    </svg>
  );
}

function HighlightList({ title, items, empty }: { title: string; items: Highlight[]; empty: string }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14, fontFamily: T.heading, color: T.text }}>{title}</h3>
      {items.length === 0 ? <Muted>{empty}</Muted> : (
        <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>
          {items.map((h, i) => (
            <li key={i}>
              <b>{h.scope}</b>: “{h.question}” moved from {h.from.toFixed(1)} to {h.to.toFixed(1)} ({h.delta > 0 ? '+' : ''}{h.delta.toFixed(1)}).
              <span style={{ color: T.mute }}> Based on {h.nNow} responses, {h.nBefore} in the pulse before.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TrendsTab({ st }: { st: EngagementState; ev?: EngagementView }) {
  const closed = st.surveys.filter((s) => s.status === 'closed');
  const all = trendSeries(closed, st.responses, TEAMS, 4);
  const shown = all.filter((s) => s.points.some((p) => p.index != null));
  const hidden = all.filter((s) => !s.points.some((p) => p.index != null));
  const labels = all[0]?.points.map((p) => p.label) ?? [];
  const range = yRange(shown);
  const hl = highlights(closed, st.responses, TEAMS);
  const better = hl.filter((h) => h.direction === 'improved').slice(0, 4);
  const worse = hl.filter((h) => h.direction === 'declined').slice(0, 4);

  if (closed.length === 0) return <Card><Muted>No closed pulses yet. Trends appear after the first pulse closes.</Muted></Card>;

  return (
    <Stack gap={16}>
      <Card>
        <CardTitle>Engagement index by team, last {labels.length} closed pulses</CardTitle>
        <div className="px-viz" data-testid="trend-chart" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div role="list" aria-label="Legend" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {shown.map((s, i) => (
              <span key={s.id} role="listitem" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: T.text }}>
                <svg width={22} height={10} aria-hidden><line x1={1} x2={21} y1={5} y2={5} stroke={SERIES[i % SERIES.length]} strokeWidth={2} strokeLinecap="round" /><circle cx={11} cy={5} r={4} fill={SERIES[i % SERIES.length]} stroke="var(--card)" strokeWidth={1.5} /></svg>
                {s.name}
              </span>
            ))}
          </div>
          <TrendChart series={shown} labels={labels} lo={range.lo} hi={range.hi} />
        </div>
        <Muted style={{ marginTop: 8 }}>Average of the rating questions, 1 to 5. The axis runs from {range.lo.toFixed(1)} to {range.hi.toFixed(1)} so small moves are visible. A team appears only for pulses where at least 5 people answered.</Muted>
        {hidden.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {hidden.map((s) => <Badge key={s.id} tone="neutral">{s.name}: {NOT_ENOUGH}</Badge>)}
          </div>
        )}
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: T.dim }}>Table view</summary>
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table data-testid="trend-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead><tr><th scope="col" style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, color: T.mute }}>Pulse</th>{all.map((s) => <th key={s.id} scope="col" style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, color: T.mute }}>{s.name}</th>)}</tr></thead>
              <tbody>
                {labels.map((l, i) => (
                  <tr key={l}>
                    <th scope="row" style={{ ...ROW_TH, textAlign: 'left', padding: '6px 10px', fontSize: 13, color: T.text, borderTop: `1px solid ${T.border}`, fontWeight: 600 }}>{l}</th>
                    {all.map((s) => <td key={s.id} style={{ padding: '6px 10px', fontSize: 13, color: T.text, borderTop: `1px solid ${T.border}` }}>{s.points[i]!.index != null ? `${s.points[i]!.index!.toFixed(2)} (${s.points[i]!.n})` : <span style={{ color: T.mute }}>{NOT_ENOUGH}</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <Card>
        <CardTitle>What changed in the latest pulse</CardTitle>
        <div data-testid="highlights" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: 20 }}>
          <HighlightList title="Improved" items={better} empty="Nothing moved up by 0.2 or more." />
          <HighlightList title="Declined" items={worse} empty="Nothing moved down by 0.2 or more." />
        </div>
        <Muted style={{ marginTop: 12 }}>A move of 0.2 or more between the last two closed pulses, for groups with at least 5 responses in both. Small samples move around: treat these as questions to ask the team, not as findings. Questions are shown for a team as a whole. There is no ranking of managers or teams.</Muted>
      </Card>
    </Stack>
  );
}
