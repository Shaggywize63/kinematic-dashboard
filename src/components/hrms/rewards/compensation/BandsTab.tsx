'use client';
// Pay bands: each grade's range, where people sit (compa-ratio, below / in / above), and team-level equity signals that are
// withheld for groups under five. Names appear only in this HR view. Nothing here changes anyone's pay.

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, ConfidenceBadge, DataTable, EmployeeCell, Modal, Note, SearchBox, T, Toolbar, downloadRows, useIsCompact, type Col, type Tone } from '../../ui';
import { Field, FormGrid, Input, Select } from '../../../ui';
import { fullName, inr } from '../../../../lib/hrms/format';
import type { HrmsDb } from '../../../../lib/hrms/types';
import {
  MIN_GROUP, ZONE_LABEL, bandPeople, compaByGender, equityByGrade, median, validateBand, type GroupStat, type Position,
} from '../../../../lib/hrms/rewards/engines';
import { saveBand } from '../../../../lib/hrms/rewards/store';
import type { Band, RewardsState } from '../../../../lib/hrms/rewards/types';
import { AdvisorNote, Muted, report } from '../common';
import RangeChart, { ChartLegend } from './RangeChart';

const POS_TONE: Record<Position, Tone> = { below: 'warn', in: 'ok', above: 'red' };
const POS_LABEL: Record<Position, string> = { below: 'Below band', in: 'In band', above: 'Above band' };

export function Withheld() {
  return <span style={{ color: T.mute, fontSize: 13 }} data-testid="withheld">Not shown: fewer than {MIN_GROUP} people</span>;
}
const showStat = (g: GroupStat, fmt: (n: number) => string) => (g.shown ? <span>{fmt(g.median)} <span style={{ color: T.mute, fontSize: 12 }}>({g.n} people)</span></span> : <Withheld />);

function BandEditor({ band, onClose }: { band: Band; onClose: () => void }) {
  const narrow = useIsCompact(700);
  const [v, setV] = useState({ min: String(band.min), mid: String(band.mid), max: String(band.max), market: String(band.market) });
  const num = { min: Number(v.min), mid: Number(v.mid), max: Number(v.max), market: Number(v.market) };
  const err = validateBand(num);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }));
  return (
    <Modal title={`Edit band ${band.grade}`} onClose={onClose} width={520}
      footer={(
        <>
          {err && <span style={{ flex: 1, minWidth: 160, alignSelf: 'center', fontSize: 12.5, color: T.red }}>{err}</span>}
          <Button style={{ height: 40 }} onClick={onClose}>Cancel</Button>
          <Button variant="primary" style={{ height: 40 }} disabled={!!err} onClick={() => { if (report(saveBand(band.grade, num), `Band ${band.grade} saved.`)) onClose(); }}>Save band</Button>
        </>
      )}>
      <FormGrid narrow={narrow}>
        <Field label="Minimum CTC (₹ a year)" htmlFor="band-min"><Input id="band-min" inputMode="numeric" value={v.min} onChange={set('min')} /></Field>
        <Field label="Midpoint (₹ a year)" htmlFor="band-mid"><Input id="band-mid" inputMode="numeric" value={v.mid} onChange={set('mid')} /></Field>
        <Field label="Maximum CTC (₹ a year)" htmlFor="band-max"><Input id="band-max" inputMode="numeric" value={v.max} onChange={set('max')} /></Field>
        <Field label="Market median (sample)" htmlFor="band-market" hint="A sample figure, tagged as such. Replace it with a survey you trust."><Input id="band-market" inputMode="numeric" value={v.market} onChange={set('market')} /></Field>
      </FormGrid>
      <Muted>Changing a band moves who counts as below or above it. It does not change anyone&apos;s pay.</Muted>
    </Modal>
  );
}

export default function BandsTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const people = useMemo(() => bandPeople(db, st.comp.bands), [db, st.comp.bands]);
  const [grade, setGrade] = useState('');
  const [dept, setDept] = useState('');
  const [pos, setPos] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Band | null>(null);

  const equity = useMemo(() => equityByGrade(people, st.comp.bands.map((b) => b.grade)), [people, st.comp.bands]);
  const compaGender = useMemo(() => compaByGender(people), [people]);
  const desigOf = (b: Band) => db.designations.filter((d) => d.grade === b.grade).map((d) => d.name).join(', ');

  const rows = people.filter((p) => (!grade || p.grade === grade) && (!dept || p.employee.departmentId === dept) && (!pos || p.position === pos)
    && (!q.trim() || `${fullName(p.employee)} ${p.employee.code}`.toLowerCase().includes(q.trim().toLowerCase()))).map((p) => ({ ...p, id: p.employee.id }));
  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'emp', label: 'Employee', sortValue: (r) => fullName(r.employee).toLowerCase(), render: (r) => <EmployeeCell e={r.employee} sub={db.designations.find((d) => d.id === r.employee.designationId)?.name} /> },
    { key: 'grade', label: 'Grade', sortValue: (r) => r.grade, render: (r) => r.grade },
    { key: 'ctc', label: 'CTC a year', align: 'right', nowrap: true, sortValue: (r) => r.ctc, render: (r) => inr(r.ctc) },
    { key: 'mid', label: 'Band midpoint', align: 'right', nowrap: true, sortValue: (r) => r.band.mid, render: (r) => inr(r.band.mid) },
    { key: 'compa', label: 'Compa-ratio', align: 'right', sortValue: (r) => r.compa, render: (r) => <b style={{ fontVariantNumeric: 'tabular-nums' }}>{r.compa.toFixed(2)}</b> },
    { key: 'pos', label: 'Position', nowrap: true, sortValue: (r) => r.position, render: (r) => <Badge tone={POS_TONE[r.position]} dot>{POS_LABEL[r.position]}</Badge> },
    { key: 'zone', label: 'Zone', render: (r) => <span style={{ color: T.dim }}>{ZONE_LABEL[r.zone].split(',')[0]}</span> },
  ];

  function exportCsv() {
    downloadRows('pay-bands-and-compa-ratio.csv', ['Code', 'Name', 'Grade', 'CTC (INR)', 'Band min', 'Band mid', 'Band max', 'Compa-ratio', 'Position'],
      rows.map((r) => [r.employee.code, fullName(r.employee), r.grade, r.ctc, r.band.min, r.band.mid, r.band.max, r.compa.toFixed(2), POS_LABEL[r.position]]));
  }

  const below = people.filter((p) => p.position === 'below').length;
  const above = people.filter((p) => p.position === 'above').length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12 }} data-testid="comp-stats">
        {[
          ['People in bands', String(people.length), `${db.employees.filter((e) => (e.status === 'active' || e.status === 'on_notice') && !e.annualCtc).length} without a CTC are left out`],
          ['Median compa-ratio', median(people.map((p) => p.compa)).toFixed(2), '1.00 means paid at the band midpoint'],
          ['Below the band', String(below), 'Paid under the minimum'],
          ['Above the band', String(above), 'Paid over the maximum'],
        ].map(([l, v, h]) => (
          <Card key={l} padding={16}>
            <div style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute }}>{l}</div>
            <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, marginTop: 6, fontVariantNumeric: 'tabular-nums' }} data-testid={`stat-${l!.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{v}</div>
            <div style={{ fontSize: 12.5, color: T.dim, marginTop: 6 }}>{h}</div>
          </Card>
        ))}
      </div>

      <Note tone="info"><b>HR view.</b> Names appear on the chart dots and in the table below, for HR only. The employee view on the Pay transparency tab shows the published ranges and nothing about anyone else.</Note>

      <Card>
        <CardTitle right={<ChartLegend />}>Pay bands by grade</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {st.comp.bands.map((b) => {
            const here = people.filter((p) => p.grade === b.grade);
            return (
              <div key={b.grade} data-testid={`band-${b.grade}`} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontFamily: T.heading, fontSize: 15 }}>{b.grade}</b> <span style={{ color: T.dim, fontSize: 13.5 }}>{desigOf(b)}</span>
                    <div style={{ fontSize: 12.5, color: T.dim }}>
                      {inr(b.min)} to {inr(b.max)}, midpoint {inr(b.mid)}. Market median {inr(b.market)} <ConfidenceBadge level="indicative" /> · {here.length} {here.length === 1 ? 'person' : 'people'}
                    </div>
                  </div>
                  <Button size="sm" aria-label={`Edit band ${b.grade}`} onClick={() => setEditing(b)}>Edit band</Button>
                </div>
                <RangeChart band={b} people={here} showPeople />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle>Equity signals, team level only</CardTitle>
        <AdvisorNote label="Use these as a prompt to look, not as a verdict.">
          A figure is shown only for a group of at least {MIN_GROUP} people. Smaller groups are withheld so that nobody can be read off a median. Nothing on this page corrects anyone&apos;s pay automatically; a person decides, with the evidence, and the employee can reply.
        </AdvisorNote>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table data-testid="equity-grade" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 13.5 }}>
            <thead><tr>{['Grade', 'Median CTC, women', 'Median CTC, men'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {equity.map((r) => (
                <tr key={r.label}>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}`, fontWeight: 600 }}>{r.label}</td>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}` }}>{showStat(r.women, inr)}</td>
                  <td style={{ padding: '9px 10px', borderTop: `1px solid ${T.border}` }}>{showStat(r.men, inr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, fontSize: 13.5 }} data-testid="equity-compa">
          <b>Median compa-ratio, whole company</b> (it already allows for grade, so groups can be compared): women {showStat(compaGender.women, (n) => n.toFixed(2))}; men {showStat(compaGender.men, (n) => n.toFixed(2))}.
        </div>
        <Muted style={{ marginTop: 6 }}>Median CTC compares two groups only inside one grade. A gap overall can come from where people sit in the grades, which is why the compa-ratio line is shown too.</Muted>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15 }}>Everyone against their band</h2>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Search by name or code" width={240} />
          <Select aria-label="Filter by grade" value={grade} style={{ width: 130 }} onChange={(e) => setGrade(e.target.value)}>
            <option value="">All grades</option>{st.comp.bands.map((b) => <option key={b.grade} value={b.grade}>{b.grade}</option>)}
          </Select>
          <Select aria-label="Filter by department" value={dept} style={{ width: 170 }} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select aria-label="Filter by position" value={pos} style={{ width: 150 }} onChange={(e) => setPos(e.target.value)}>
            <option value="">All positions</option><option value="below">Below band</option><option value="in">In band</option><option value="above">Above band</option>
          </Select>
          <div style={{ marginLeft: 'auto' }}><Button style={{ height: 40 }} disabled={!rows.length} onClick={exportCsv}>Download CSV</Button></div>
        </Toolbar>
        <div data-testid="compa-table"><DataTable columns={cols} rows={rows} minWidth={860} empty="Nobody matches these filters." /></div>
        <Muted>Compa-ratio is CTC divided by the band midpoint. Position is below if CTC is under the minimum and above if it is over the maximum. Leavers, joiners without a CTC and ungraded roles are left out.</Muted>
      </div>
      {editing && <BandEditor band={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
