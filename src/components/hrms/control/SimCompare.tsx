'use client';
// Compare two saved scenarios side by side.

import { useMemo, useState } from 'react';
import { Field, Select } from '../../ui';
import { Card, CardTitle, DataTable, EmptyState, Note, T, type Col } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtMonth, inr, inrShort } from '../../../lib/hrms/format';
import { describeInput } from '../../../lib/hrms/control/simulate';
import type { SavedScenario } from '../../../lib/hrms/control/types';
import { BarCompare, Muted, Row, Stack, signedInr } from './parts';
import { safeRun } from './SimSaved';

export default function SimCompare({ db, scenarios }: { db: HrmsDb; scenarios: SavedScenario[] }) {
  const [aId, setA] = useState(scenarios[0]?.id ?? '');
  const [bId, setB] = useState(scenarios[1]?.id ?? '');
  const a = scenarios.find((s) => s.id === aId) ?? scenarios[0];
  const b = scenarios.find((s) => s.id === bId) ?? scenarios[1] ?? scenarios[0];
  const ra = useMemo(() => (a ? safeRun(db, a) : null), [db, a]);
  const rb = useMemo(() => (b ? safeRun(db, b) : null), [db, b]);

  if (scenarios.length < 2) {
    return (
      <Card>
        <CardTitle>Compare two scenarios</CardTitle>
        <EmptyState title="Save at least two scenarios to compare them" description={`You have ${scenarios.length}. Run a simulation, save it, then come back here.`} />
      </Card>
    );
  }

  const metric = (label: string, get: (r: NonNullable<typeof ra>) => number, fmt: (n: number) => string, key: string) => ({ id: key, label, a: ra ? get(ra) : NaN, b: rb ? get(rb) : NaN, fmt });
  const lines = [
    metric('Employer cost a month', (r) => r.after.employerCost - r.before.employerCost, (n) => signedInr(n, inr), 'cost'),
    metric('Employer cost over 12 months', (r) => r.twelveDelta, (n) => signedInr(n, inr), 'twelve'),
    metric('Staff net pay over 12 months', (r) => r.twelveNetDelta, (n) => signedInr(n, inr), 'net12'),
    metric('Average take-home change a month', (r) => Math.round(r.avgTakeHomeChange), (n) => signedInr(n, inr), 'avg'),
    metric('People whose pay changes', (r) => r.affected + r.newPeople, (n) => String(n), 'people'),
    metric('People leaving ESI', (r) => r.esiMovedOut.length, (n) => String(n), 'esiout'),
    metric('People joining ESI', (r) => r.esiMovedIn.length, (n) => String(n), 'esiin'),
    metric('Failing the 50% wages rule after', (r) => r.wageRule.failAfter, (n) => String(n), 'fail'),
    metric('Wages added back a month, after', (r) => r.wageRule.addBackAfter, (n) => inr(n), 'addback'),
  ];
  type L = (typeof lines)[number];
  const cols: Col<L>[] = [
    { key: 'label', label: 'Measure', render: (l) => <span style={{ fontWeight: 600 }}>{l.label}</span> },
    { key: 'a', label: 'Scenario A', align: 'right', nowrap: true, render: (l) => (Number.isNaN(l.a) ? '—' : l.fmt(l.a)) },
    { key: 'b', label: 'Scenario B', align: 'right', nowrap: true, render: (l) => (Number.isNaN(l.b) ? '—' : l.fmt(l.b)) },
    { key: 'd', label: 'B minus A', align: 'right', nowrap: true, render: (l) => (Number.isNaN(l.a) || Number.isNaN(l.b) ? '—' : l.b === l.a ? 'Same' : <span style={{ fontWeight: 600 }}>{l.fmt(l.b - l.a)}</span>) },
  ];
  const diff12 = ra && rb ? rb.twelveDelta - ra.twelveDelta : 0;

  return (
    <Stack>
      <Card>
        <CardTitle>Compare two scenarios</CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 16 }}>
          <Field label="Scenario A" htmlFor="cmp-a">
            <Select id="cmp-a" value={a?.id ?? ''} onChange={(e) => setA(e.target.value)}>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          </Field>
          <Field label="Scenario B" htmlFor="cmp-b">
            <Select id="cmp-b" value={b?.id ?? ''} onChange={(e) => setB(e.target.value)}>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          </Field>
        </div>
        <Row gap={24} style={{ marginTop: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 240px', fontSize: 13, color: T.dim }}><b style={{ color: T.text }}>A:</b> {a ? describeInput(db, a.input) : ''}</div>
          <div style={{ flex: '1 1 240px', fontSize: 13, color: T.dim }}><b style={{ color: T.text }}>B:</b> {b ? describeInput(db, b.input) : ''}</div>
        </Row>
      </Card>

      {a && b && a.id === b.id && <Note tone="warn">You picked the same scenario twice. Choose a different one for B.</Note>}
      {ra && rb && a?.id !== b?.id && (
        <Note tone="info"><span data-testid="compare-verdict">Over 12 months from {fmtMonth(ra.month)}, “{b!.name}” costs {inr(Math.abs(diff12))} {diff12 >= 0 ? 'more' : 'less'} in employer cost than “{a!.name}”.</span></Note>
      )}

      <Card>
        <CardTitle>Side by side</CardTitle>
        <div data-testid="compare-table"><DataTable columns={cols} rows={lines} minWidth={560} /></div>
        {ra && rb && (
          <div style={{ marginTop: 18 }}>
            <BarCompare testId="compare-chart" caption="Bars comparing the two chosen scenarios" aLabel="Scenario A" bLabel="Scenario B" format={inrShort}
              rows={[
                { key: 'cost', label: 'Employer cost a month', a: ra.after.employerCost - ra.before.employerCost, b: rb.after.employerCost - rb.before.employerCost },
                { key: 'twelve', label: 'Employer cost over 12 months', a: ra.twelveDelta, b: rb.twelveDelta },
                { key: 'avg', label: 'Average take-home change a month', a: Math.round(ra.avgTakeHomeChange), b: Math.round(rb.avgTakeHomeChange) },
              ]} />
            <Muted style={{ marginTop: 10 }}>Each pair of bars has its own scale, starting at zero. Bars to the left of the line are decreases.</Muted>
          </div>
        )}
      </Card>
    </Stack>
  );
}
