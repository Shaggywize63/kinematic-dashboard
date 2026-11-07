'use client';
// Tax: each employee's regime and declaration status, and a side-by-side regime comparison for any employee.

import { useMemo, useRef, useState } from 'react';
import type { Employee, HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { TDS } from '../../../lib/hrms/rules';
import { Field, Select } from '../../ui';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, KeyValue, Note, SearchBox, Stat, StatGrid, T, Toolbar, useIsCompact, type Col } from '../ui';
import { PREVIEW_MONTH, regularPayslip, taxFor } from './builders';
import { Muted, PlainTable, Stack } from './parts';

const DECL_LABEL = { not_submitted: 'Not submitted', submitted: 'Submitted', verified: 'Verified' } as const;
const DECL_TONE = { not_submitted: 'warn', submitted: 'info', verified: 'ok' } as const;

export default function TaxTab({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const people = useMemo(() => db.employees.filter((e) => e.status !== 'exited').sort((a, b) => a.code.localeCompare(b.code)), [db.employees]);
  const payable = useMemo(() => people.filter((e) => e.structureId && e.annualCtc), [people]);
  const [empId, setEmpId] = useState(payable[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [regime, setRegime] = useState('all');
  const [decl, setDecl] = useState('all');
  const panelRef = useRef<HTMLDivElement>(null);

  const count = (f: (e: Employee) => boolean) => people.filter(f).length;
  const rows = people.filter((e) => (regime === 'all' || e.taxRegime === regime) && (decl === 'all' || e.declaration.status === decl)
    && (!q.trim() || `${fullName(e)} ${e.code}`.toLowerCase().includes(q.trim().toLowerCase())));

  const cols: Col<Employee>[] = [
    { key: 'name', label: 'Employee', sortValue: (e) => fullName(e), render: (e) => <EmployeeCell e={e} /> },
    { key: 'regime', label: 'Regime', sortValue: (e) => e.taxRegime, render: (e) => <Badge tone={e.taxRegime === 'new' ? 'info' : 'neutral'}>{e.taxRegime === 'new' ? 'New regime' : 'Old regime'}</Badge> },
    { key: 'decl', label: 'Declaration', sortValue: (e) => e.declaration.status, render: (e) => <Badge tone={DECL_TONE[e.declaration.status]} dot>{DECL_LABEL[e.declaration.status]}</Badge> },
    { key: 'on', label: 'Submitted on', sortValue: (e) => e.declaration.submittedOn ?? '', render: (e) => fmtDate(e.declaration.submittedOn) },
    { key: 'c80', label: '80C declared', align: 'right', sortValue: (e) => e.declaration.sec80C, render: (e) => (e.declaration.sec80C ? inr(e.declaration.sec80C) : '—') },
    {
      key: 'cmp', label: '', align: 'right', render: (e) => {
        const ok = !!(e.structureId && e.annualCtc);
        return (
          <Button size="sm" disabled={!ok} aria-label={`Compare regimes for ${fullName(e)}`} onClick={() => { setEmpId(e.id); panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            {ok ? 'Compare' : 'No pay data'}
          </Button>
        );
      },
    },
  ];

  return (
    <Stack>
      <StatGrid min={150}>
        <Stat label="Declarations verified" value={count((e) => e.declaration.status === 'verified')} tone="ok" hint="Checked against proofs" />
        <Stat label="Submitted" value={count((e) => e.declaration.status === 'submitted')} tone="info" hint="Awaiting verification" />
        <Stat label="Not submitted" value={count((e) => e.declaration.status === 'not_submitted')} tone="warn" hint="Old-regime tax counts no deductions" />
        <Stat label="New regime" value={count((e) => e.taxRegime === 'new')} hint={`${count((e) => e.taxRegime === 'old')} on the old regime`} />
      </StatGrid>

      <div ref={panelRef} style={{ scrollMarginTop: 80 }}>
        <Compare db={db} people={payable} empId={empId} onPick={setEmpId} narrow={narrow} />
      </div>

      <Card padding={16}>
        <CardTitle>Regime and declaration status</CardTitle>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Search by name or code" />
          <Select aria-label="Filter by regime" value={regime} onChange={(e) => setRegime(e.target.value)} style={{ width: 160 }}>
            <option value="all">Both regimes</option>
            <option value="new">New regime</option>
            <option value="old">Old regime</option>
          </Select>
          <Select aria-label="Filter by declaration status" value={decl} onChange={(e) => setDecl(e.target.value)} style={{ width: 190 }}>
            <option value="all">Any declaration status</option>
            <option value="verified">Verified</option>
            <option value="submitted">Submitted</option>
            <option value="not_submitted">Not submitted</option>
          </Select>
          <Muted>{rows.length} of {people.length} employees (exited employees are left out)</Muted>
        </Toolbar>
        <div style={{ marginTop: 12 }}>
          <DataTable columns={cols} rows={rows} minWidth={700} empty="No employee matches these filters." />
        </div>
      </Card>
    </Stack>
  );
}

function Compare({ db, people, empId, onPick, narrow }: { db: HrmsDb; people: Employee[]; empId: string; onPick: (id: string) => void; narrow: boolean }) {
  const emp = people.find((e) => e.id === empId) ?? people[0];
  const model = useMemo(() => {
    if (!emp) return null;
    const slip = regularPayslip(db, emp);
    if (!slip) return null;
    const annualGross = slip.wages.taxableMonthly * 12;
    return { slip, annualGross, newR: taxFor(db, emp, slip, 'new', annualGross), oldR: taxFor(db, emp, slip, 'old', annualGross) };
  }, [db, emp]);

  const better = model ? (model.newR.total < model.oldR.total ? 'new' : model.oldR.total < model.newR.total ? 'old' : 'same') : null;
  const saving = model ? Math.abs(model.newR.total - model.oldR.total) : 0;
  const d = emp?.declaration;

  return (
    <Card>
      <CardTitle>Regime comparison</CardTitle>
      <Muted style={{ marginTop: -6, marginBottom: 12 }}>
        Annual tax on a regular month of pay ({fmtMonth(PREVIEW_MONTH)}, no adjustments or loss of pay), worked out by the payroll engine under both regimes. Surcharge is not modelled and the slabs are tagged “{TDS.newRegime.confidence}”.
      </Muted>
      {!emp ? <Muted>No employee with pay data.</Muted> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Employee" style={{ maxWidth: 380 }}>
            <Select aria-label="Employee for regime comparison" value={emp.id} onChange={(e) => onPick(e.target.value)}>
              {people.map((e) => <option key={e.id} value={e.id}>{e.code} · {fullName(e)}</option>)}
            </Select>
          </Field>
          {model && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
                <PlainTable caption="Tax under each regime" minWidth={340}
                  rows={[
                    { id: 'sal', label: 'Salary on the annual basis', n: model.annualGross, o: model.annualGross },
                    { id: 'ded', label: 'Standard deduction and other exemptions', n: -model.newR.exemptions, o: -model.oldR.exemptions },
                    { id: 'tax', label: 'Taxable income', n: model.newR.taxable, o: model.oldR.taxable, b: true },
                    { id: 'after', label: 'Tax after rebate', n: model.newR.tax, o: model.oldR.tax },
                    { id: 'cess', label: `Cess (${TDS.cess}%)`, n: model.newR.cess, o: model.oldR.cess },
                    { id: 'tot', label: 'Total tax for the year', n: model.newR.total, o: model.oldR.total, b: true },
                    { id: 'mon', label: 'Monthly TDS (a twelfth)', n: model.newR.total / 12, o: model.oldR.total / 12 },
                  ]}
                  columns={[
                    { key: 'label', label: 'Line', nowrap: false, render: (r) => (r.b ? <b>{r.label}</b> : r.label) },
                    { key: 'n', label: <>New{emp.taxRegime === 'new' ? ' (on file)' : ''}</>, align: 'right', render: (r) => <span data-testid={`cmp-new-${r.id}`} style={{ fontWeight: r.b ? 700 : 400 }}>{r.n < 0 ? `(${inr(-r.n)})` : inr(r.n)}</span> },
                    { key: 'o', label: <>Old{emp.taxRegime === 'old' ? ' (on file)' : ''}</>, align: 'right', render: (r) => <span data-testid={`cmp-old-${r.id}`} style={{ fontWeight: r.b ? 700 : 400 }}>{r.o < 0 ? `(${inr(-r.o)})` : inr(r.o)}</span> },
                  ]} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div role="status" data-testid="cmp-result" style={{ padding: '12px 14px', borderRadius: T.radius.md, background: better === 'same' ? T.infoWash : T.okWash, color: T.text, fontSize: 14, lineHeight: 1.5 }}>
                    {better === 'same' ? 'Both regimes give the same tax for this employee.'
                      : <>On the declarations on file, the <b>{better === 'new' ? 'new' : 'old'} regime</b> costs <b>{inr(saving)}</b> less a year ({inr(saving / 12)} a month).</>}
                    {better && better !== 'same' && better !== emp.taxRegime && <div style={{ marginTop: 6, color: T.warn }}>The regime on file is the {emp.taxRegime} one, so the employee may be paying more tax than needed.</div>}
                  </div>
                  <KeyValue columns={1} rows={[
                    { label: 'Declaration status', value: <Badge tone={DECL_TONE[d!.status]} dot>{DECL_LABEL[d!.status]}</Badge> },
                    { label: 'Old-regime inputs', value: `80C ${inr(d!.sec80C)} · 80D ${inr(d!.sec80D)} · NPS ${inr(d!.nps80CCD1B)} · home loan interest ${inr(d!.homeLoanInterest)} · rent ${inr(d!.rentPaidAnnual)} a year` },
                  ]} />
                  {d!.status !== 'verified' && <Note tone="warn">The declaration is {DECL_LABEL[d!.status].toLowerCase()}, so the old-regime figures rest on unverified inputs.</Note>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
