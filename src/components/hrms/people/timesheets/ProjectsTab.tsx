'use client';
// Project view: hours by project and person for a period, budget against logged, billable against non-billable (SVG),
// and utilisation per team. Rates are samples. Utilisation of one person is shown to them and their manager, not here.

import { useState } from 'react';
import { Card, CardTitle, ConfidenceBadge, ProgressBar, Stat, StatGrid, T, Toolbar } from '../../ui';
import { Select } from '../../../ui';
import { addDays, fmtDate, fullName, inr } from '../../../../lib/hrms/format';
import { billableSplit, inPeriod, projectRows, sheetTotal, billableHours, teamUtilisation, weekLabel, type Include } from '../../../../lib/hrms/people/timesheetEngine';
import { SEED_WEEKS } from '../../../../lib/hrms/people/seedTimesheets';
import { TEAMS } from '../../../../lib/hrms/people/teams';
import type { TimesheetState } from '../../../../lib/hrms/people/types';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { Muted, SERIES, Stack, ROW_TH } from '../shared';

function SplitChart({ data }: { data: { weekStart: string; billable: number; nonBillable: number }[] }) {
  const W = 520; const H = 250; const m = { l: 40, r: 12, t: 22, b: 34 };
  const max = Math.max(10, ...data.map((d) => d.billable + d.nonBillable));
  const top = Math.ceil(max / 50) * 50;
  const y = (v: number) => m.t + (1 - v / top) * (H - m.t - m.b);
  const bw = Math.min(64, ((W - m.l - m.r) / data.length) * 0.5);
  const cx = (i: number) => m.l + ((i + 0.5) * (W - m.l - m.r)) / data.length;
  const ticks = [0, top / 2, top];
  return (
    <svg role="img" aria-label="Billable and non-billable hours per week" viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map((t) => <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--border)" /><text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--mute)">{t}</text></g>)}
      {data.map((d, i) => {
        const hb = (d.billable / top) * (H - m.t - m.b);
        const hn = (d.nonBillable / top) * (H - m.t - m.b);
        const total = d.billable + d.nonBillable;
        return (
          <g key={d.weekStart}>
            {d.billable > 0 && <rect x={cx(i) - bw / 2} y={y(0) - hb} width={bw} height={Math.max(0, hb - 1)} rx={3} fill={SERIES[0]}><title>{`Week of ${d.weekStart}: ${d.billable} billable hours`}</title></rect>}
            {d.nonBillable > 0 && <rect x={cx(i) - bw / 2} y={y(0) - hb - hn} width={bw} height={Math.max(0, hn - 1)} rx={3} fill="var(--mute)"><title>{`Week of ${d.weekStart}: ${d.nonBillable} non-billable hours`}</title></rect>}
            <text x={cx(i)} y={y(0) - hb - hn - 6} textAnchor="middle" fontSize={11.5} fill="var(--text)" fontWeight={600}>{total}</text>
            <text x={cx(i)} y={H - 12} textAnchor="middle" fontSize={11.5} fill="var(--dim)">{fmtDate(d.weekStart).replace(/ \d{4}$/, '')}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ProjectsTab({ db, ts }: { db: HrmsDb; ts: TimesheetState }) {
  const [period, setPeriod] = useState('all');
  const [include, setInclude] = useState<Include>('all');
  const weeks = period === 'all' ? SEED_WEEKS : [period];
  const rows = projectRows(ts.sheets, ts.projects, weeks, include);
  const used = inPeriod(ts.sheets, weeks, include);
  const hours = used.reduce((t, s) => t + sheetTotal(s), 0);
  const bill = used.reduce((t, s) => t + billableHours(s, ts.projects), 0);
  const split = billableSplit(ts.sheets, ts.projects, SEED_WEEKS, include);
  const util = teamUtilisation(ts.sheets, db.employees, ts.trackedIds, TEAMS, ts.projects, ts.policy, weeks, include);
  const people = db.employees.filter((e) => ts.trackedIds.includes(e.id));
  const th = { textAlign: 'right' as const, padding: '8px 10px', fontSize: 11.5, color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const };

  return (
    <Stack gap={16}>
      <Toolbar>
        <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 300 }}>
          <option value="all">All four weeks ({fmtDate(SEED_WEEKS[0]).replace(/ \d{4}$/, '')} to {fmtDate(addDays(SEED_WEEKS[3]!, 6)).replace(/ \d{4}$/, '')})</option>
          {SEED_WEEKS.map((w) => <option key={w} value={w}>Week: {weekLabel(w)}</option>)}
        </Select>
        <Select aria-label="Hours to include" value={include} onChange={(e) => setInclude(e.target.value as Include)} style={{ width: 210 }}>
          <option value="all">All entered hours</option>
          <option value="approved">Approved weeks only</option>
        </Select>
      </Toolbar>

      <StatGrid min={160}>
        <Stat label="Hours in period" value={hours} hint={`${used.length} timesheets`} />
        <Stat label="Billable" value={`${hours ? Math.round((bill / hours) * 100) : 0}%`} tone="info" hint={`${bill} of ${hours} hours`} />
        <Stat label="Indicative value" value={inr(rows.reduce((t, r) => t + r.value, 0))} hint="Billable hours x sample rates" />
      </StatGrid>

      <Card padding={0}>
        <div style={{ padding: '14px 16px 0' }}><CardTitle right={<ConfidenceBadge level="indicative" />}>Projects: hours, budget and sample rates</CardTitle></div>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="projects-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...th, textAlign: 'left', padding: '8px 16px' }}>Project</th>
                <th scope="col" style={th}>Hours in period</th>
                <th scope="col" style={{ ...th, textAlign: 'left', width: 230 }}>Budget used (to date)</th>
                <th scope="col" style={th}>Rate (sample)</th>
                <th scope="col" style={th}>Indicative value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = r.budgetPct > 100 ? 'red' : r.budgetPct >= 90 ? 'warn' : 'info';
                return (
                  <tr key={r.project.id} data-testid={`proj-${r.project.id}`}>
                    <td style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{r.project.name}</div>
                      <div style={{ fontSize: 12, color: T.mute }}>{r.project.client} · {r.project.billable ? 'Billable' : 'Non-billable'}</div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', borderTop: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums', fontSize: 13.5 }}>{r.period}</td>
                    <td style={{ padding: '10px', borderTop: `1px solid ${T.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.dim, marginBottom: 3 }}><span>{r.toDate} of {r.project.budgetHours} h</span><b style={{ color: tone === 'red' ? T.red : tone === 'warn' ? T.warn : T.text }}>{r.budgetPct}%</b></div>
                      <ProgressBar pct={r.budgetPct} tone={tone} />
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', borderTop: `1px solid ${T.border}`, fontSize: 13.5 }}>{r.project.billable ? `${inr(r.project.sampleRate)}/h` : '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'right', borderTop: `1px solid ${T.border}`, fontSize: 13.5 }}>{r.project.billable ? inr(r.value) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px 14px' }}><Muted>Rates are samples, in rupees per hour, to show how a value would be worked out. They are not a rate card. Budget used includes earlier hours logged before {fmtDate(SEED_WEEKS[0])}.</Muted></div>
      </Card>

      <Card padding={0}>
        <div style={{ padding: '14px 16px 0' }}><CardTitle>Hours by project and person</CardTitle></div>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="person-hours" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...th, textAlign: 'left', padding: '8px 16px' }}>Person</th>
                {ts.projects.map((p) => <th key={p.id} scope="col" style={th} title={p.name}>{p.client === 'Internal' ? p.name.replace('Internal: ', 'Int. ') : p.client}</th>)}
                <th scope="col" style={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {people.map((e) => {
                const tot = rows.reduce((t, r) => t + (r.byPerson[e.id] ?? 0), 0);
                return (
                  <tr key={e.id}>
                    <th scope="row" style={{ ...ROW_TH, textAlign: 'left', padding: '8px 16px', fontSize: 13.5, fontWeight: 500, color: T.text, borderTop: `1px solid ${T.border}` }}>{fullName(e)}</th>
                    {rows.map((r) => <td key={r.project.id} style={{ padding: '8px 10px', textAlign: 'right', borderTop: `1px solid ${T.border}`, fontSize: 13.5, color: r.byPerson[e.id] ? T.text : T.mute, fontVariantNumeric: 'tabular-nums' }}>{r.byPerson[e.id] ?? '–'}</td>)}
                    <td style={{ padding: '8px 10px', textAlign: 'right', borderTop: `1px solid ${T.border}`, fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{tot}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14 }}>
        <Card>
          <CardTitle>Billable and non-billable hours per week</CardTitle>
          <div className="px-viz" data-testid="split-chart" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: T.text, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 12, height: 12, borderRadius: 3, background: SERIES[0] }} />Billable</span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--mute)' }} />Non-billable</span>
            </div>
            <SplitChart data={split} />
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: T.dim }}>Table view</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: T.dim, lineHeight: 1.7 }}>
                {split.map((d) => <li key={d.weekStart}>{weekLabel(d.weekStart)}: {d.billable} billable, {d.nonBillable} non-billable</li>)}
              </ul>
            </details>
          </div>
        </Card>
        <Card>
          <CardTitle>Utilisation by team</CardTitle>
          <div data-testid="team-util" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {util.map((u) => (
              <div key={u.team.id} data-testid={`util-${u.team.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: T.text }}>{u.team.name} <span style={{ color: T.mute, fontWeight: 400 }}>({u.people} people)</span></span>
                  <span style={{ color: T.dim }}><b style={{ color: T.text }}>{u.pct}%</b> · {u.billable} billable of {u.total} h</span>
                </div>
                <ProgressBar pct={u.pct} tone="info" height={8} />
              </div>
            ))}
            {util.length === 0 && <Muted>No timesheets in this period.</Muted>}
          </div>
          <Muted style={{ marginTop: 10 }}>Billable hours divided by a {ts.policy.standardWeek}-hour week per person; leave is not deducted in this sample. These are team figures. A person's own utilisation is visible to them and their manager only, on the weekly timesheet, and is never ranked or compared.</Muted>
        </Card>
      </div>
    </Stack>
  );
}
