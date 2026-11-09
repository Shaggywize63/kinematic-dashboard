'use client';
// The result half of the simulator: headline numbers, what they mean, before and after, the people most affected, and the rules used.

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Field, Input } from '../../ui';
import { Badge, Button, Card, CardTitle, DataTable, Note, Stat, StatGrid, T, downloadText, type Col } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtMonth, inr, inrShort } from '../../../lib/hrms/format';
import { summaryText, type SimPerson, type SimResult as Result } from '../../../lib/hrms/control/simulate';
import { Conf, BarCompare, Muted, Row, SimulationBadge, Stack, signedInr } from './parts';

const signed = (n: number) => signedInr(n, inr);
const signedShort = (n: number) => signedInr(n, inrShort);

export function slugOf(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scenario'; }

export default function SimResultView({ db, result, onSave }: { db: HrmsDb; result: Result; onSave: (name: string) => void }) {
  const [name, setName] = useState(result.title);
  const [error, setError] = useState('');
  const dCost = result.after.employerCost - result.before.employerCost;
  const pctCost = result.before.employerCost ? (dCost / result.before.employerCost) * 100 : 0;
  const w = result.wageRule;

  const rows = [
    { id: 'gross', label: 'Gross pay', before: result.before.gross, after: result.after.gross },
    { id: 'cost', label: 'Employer cost', before: result.before.employerCost, after: result.after.employerCost },
    { id: 'pf', label: 'PF, employee and employer', before: result.before.pf, after: result.after.pf },
    { id: 'esi', label: 'ESI, employee and employer', before: result.before.esi, after: result.after.esi },
    { id: 'pt', label: 'Professional tax', before: result.before.pt, after: result.after.pt },
    { id: 'tds', label: 'Income tax (TDS)', before: result.before.tds, after: result.after.tds },
    { id: 'net', label: 'Net pay to staff', before: result.before.net, after: result.after.net },
  ];

  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'label', label: 'Per month', render: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
    { key: 'before', label: 'Before', align: 'right', render: (r) => inr(r.before), nowrap: true },
    { key: 'after', label: 'After', align: 'right', render: (r) => inr(r.after), nowrap: true },
    { key: 'change', label: 'Change', align: 'right', nowrap: true, render: (r) => <span style={{ fontWeight: 600, color: r.after === r.before ? T.mute : T.text }}>{r.after === r.before ? 'No change' : signed(r.after - r.before)}</span> },
  ];

  const personCols: Col<SimPerson & { id: string }>[] = [
    {
      key: 'name', label: 'Person', render: (p) => {
        const real = db.employees.some((e) => e.id === p.employeeId);
        return real
          ? <Link href={`/dashboard/hrms/employees/${p.employeeId}`} style={{ color: T.text, textDecoration: 'none' }}><span style={{ fontWeight: 600 }}>{p.name}</span> <span style={{ fontSize: 12, color: T.mute, fontFamily: T.mono }}>{p.code}</span></Link>
          : <span><span style={{ fontWeight: 600 }}>{p.name}</span> <span style={{ fontSize: 12, color: T.mute }}>(planned)</span></span>;
      },
    },
    { key: 'before', label: 'Net before', align: 'right', nowrap: true, render: (p) => (p.beforeNet == null ? '—' : inr(p.beforeNet)) },
    { key: 'after', label: 'Net after', align: 'right', nowrap: true, render: (p) => (p.afterNet == null ? '—' : inr(p.afterNet)) },
    { key: 'delta', label: 'Change', align: 'right', nowrap: true, render: (p) => <span style={{ fontWeight: 600 }}>{p.beforeNet == null ? inr(p.afterNet) : p.delta === 0 ? 'No change' : signed(p.delta)}</span> },
    { key: 'flags', label: 'Why', render: (p) => <Row gap={6}>{p.flags.map((f) => <Badge key={f} tone={f.startsWith('Structure') ? 'warn' : f.includes('ESI') ? 'info' : 'neutral'}>{f}</Badge>)}</Row> },
  ];

  function save() {
    const n = name.trim();
    if (n.length < 3) { setError('Give the scenario a name of at least 3 characters.'); return; }
    setError('');
    onSave(n);
    toast.success('Scenario saved. Find it under Saved scenarios.');
  }

  return (
    <Stack>
      <div data-testid="sim-result"><Card>
        <CardTitle right={<Row gap={8}><SimulationBadge /><Badge tone="warn">Planning only, not for filing</Badge></Row>}>
          <span data-testid="result-title">{result.title}</span>
        </CardTitle>
        <Muted style={{ marginBottom: 14 }}>
          Worked out on a copy of the sample data for {fmtMonth(result.month)}, a standard month with full attendance. Your real payroll is not touched.
        </Muted>
        <StatGrid min={176}>
          <div data-testid="stat-cost"><Stat label="Employer cost a month" value={dCost === 0 ? 'No change' : signedShort(dCost)} hint={`${inrShort(result.before.employerCost)} to ${inrShort(result.after.employerCost)}${dCost ? ` (${pctCost > 0 ? '+' : ''}${pctCost.toFixed(1)}%)` : ''}`} /></div>
          <div data-testid="stat-twelve"><Stat label="12-month cost impact" value={result.twelveDelta === 0 ? 'No change' : signedShort(result.twelveDelta)} hint={<>Employer cost from {fmtMonth(result.month)}. Staff net pay: <span style={{ whiteSpace: 'nowrap' }}>{result.twelveNetDelta === 0 ? 'no change' : signedShort(result.twelveNetDelta)}</span></>} /></div>
          <div data-testid="stat-takehome"><Stat label="Average take-home change" value={result.affected ? `${signed(Math.round(result.avgTakeHomeChange))}` : result.newPeople ? 'No one existing' : 'No change'} hint={result.affected ? `a month, across ${result.affected} ${result.affected === 1 ? 'person' : 'people'} (${result.avgTakeHomeChangePct > 0 ? '+' : ''}${result.avgTakeHomeChangePct.toFixed(1)}%)` : result.newPeople ? `${result.newPeople} planned ${result.newPeople === 1 ? 'hire' : 'hires'} are new` : 'Nobody’s net pay moves'} /></div>
          <div data-testid="stat-esi"><Stat label="Cross the ESI ceiling" value={`${result.esiMovedOut.length} out, ${result.esiMovedIn.length} in`} hint="People leaving or joining ESI cover" tone={result.esiMovedOut.length || result.esiMovedIn.length ? 'info' : undefined} /></div>
          <div data-testid="stat-wages"><Stat label="Fail the 50% wages rule" value={w.failBefore === w.failAfter ? `${w.failAfter}` : `${w.failBefore} to ${w.failAfter}`} hint={w.addBackBefore === w.addBackAfter ? `People. Add-back unchanged at ${inrShort(w.addBackAfter)} a month` : `People. Add-back ${inrShort(w.addBackBefore)} to ${inrShort(w.addBackAfter)} a month`} tone={w.failAfter > w.failBefore ? 'warn' : w.failAfter < w.failBefore ? 'ok' : undefined} /></div>
        </StatGrid>
      </Card></div>

      {result.insights.length > 0 && (
        <Card>
          <CardTitle>What it means</CardTitle>
          <Stack gap={8}>
            {result.insights.map((t, i) => <Note key={i} tone={t.includes('not meaningful') ? 'warn' : 'info'}>{t}</Note>)}
          </Stack>
        </Card>
      )}

      <Card>
        <CardTitle>Before and after, for {fmtMonth(result.month)}</CardTitle>
        <DataTable columns={cols} rows={rows} minWidth={520} />
        <div style={{ marginTop: 18 }}>
          <BarCompare testId="sim-chart" caption={`Before and after for ${fmtMonth(result.month)}`} aLabel="Before" bLabel="After" format={inr}
            rows={rows.map((r) => ({ key: r.id, label: r.label, a: r.before, b: r.after, note: r.after === r.before ? 'no change' : signed(r.after - r.before) }))} />
          <Muted style={{ marginTop: 10 }}>Each pair of bars starts at zero and has its own scale, so compare the two bars in a pair, not bars in different rows.</Muted>
        </div>
      </Card>

      <Card>
        <CardTitle right={<Muted>{result.peopleTotal > result.people.length ? `Showing ${result.people.length} of ${result.peopleTotal}` : `${result.peopleTotal} ${result.peopleTotal === 1 ? 'person' : 'people'}`}</Muted>}>Most affected people</CardTitle>
        <div data-testid="people-table">
          <DataTable columns={personCols} rows={result.people.map((p) => ({ ...p, id: p.employeeId }))} minWidth={620} empty="Nobody’s pay changes in this scenario." />
        </div>
        <Muted style={{ marginTop: 10 }}>Net pay is what reaches the bank account in a standard month. Names are shown so HR can check the cases; this is a plan, not a decision about any person.</Muted>
      </Card>

      <Card>
        <CardTitle>Rules this relies on</CardTitle>
        <Stack gap={0}>
          {result.rules.map((r) => (
            <div key={r.key} data-testid={`rule-${r.key}`} style={{ display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', padding: '9px 0', borderTop: `1px solid ${T.border}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{r.label}{r.hypothetical ? <span style={{ color: T.warn }}> (hypothetical)</span> : null}</div>
                {r.note && <Muted>{r.note}</Muted>}
              </div>
              <Row gap={8}><span style={{ fontSize: 13.5, color: T.text }}>{r.value}</span><Conf level={r.confidence} /></Row>
            </div>
          ))}
        </Stack>
        <Muted style={{ marginTop: 10 }}>Confirm every statutory figure with your advisor before you act on a result. The simulator is for planning, not for filing.</Muted>
      </Card>

      <Card>
        <CardTitle>Assumptions</CardTitle>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: T.dim, lineHeight: 1.55 }}>
          {result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </Card>

      <Card>
        <CardTitle>Keep this scenario</CardTitle>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <Field label="Name" htmlFor="scenario-name" error={error} hint="Saved scenarios keep your inputs. The numbers are worked out again from the current sample data whenever you open them.">
              <Input id="scenario-name" value={name} invalid={!!error} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
          </div>
          <Row gap={8} style={{ paddingTop: 22 }}>
            <Button variant="primary" onClick={save} data-testid="save-scenario">Save scenario</Button>
            <Button onClick={() => downloadText(`${slugOf(name || result.title)}.txt`, summaryText(result, name))} data-testid="download-summary">Download summary</Button>
          </Row>
        </Row>
      </Card>
    </Stack>
  );
}
