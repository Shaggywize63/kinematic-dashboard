'use client';
// Run step 3, Compute: build the payslips, read the totals, and review each payslip against last month.
// Sample data: the engine runs in the browser. Live data: the server computes (and says when the inputs have changed since).

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardTitle, EmptyState, Note, SearchBox, Stat, StatGrid, Toolbar, T } from '../ui';
import { Select } from '../../ui';
import type { Employee, HrmsDb, PayRun, Payslip, PayslipLine } from '../../../lib/hrms/types';
import { employeesForRun, runTotals } from '../../../lib/hrms/engine';
import { computeRun } from '../../../lib/hrms/actions';
import { usePreRunChecks } from '../../../lib/hrms/live/payrollCommands';
import { fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { CHANGE_THRESHOLD_PCT, acknowledgedBlockers, comparePayslips, employeeBreakup, isLocked, lawBasis, runIsStale, type PayslipChange } from './logic';
import { LawBasisTable, bigBtn, report } from './shared';
import type { Step } from './RunStepper';

type SortKey = 'name' | 'gross' | 'net' | 'cost' | 'change' | 'warn';

const th = { padding: '10px 10px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const, background: T.panel, textAlign: 'left' as const };
const td = { padding: '10px 10px', fontSize: 13.5, borderTop: `1px solid ${T.border}`, color: T.text, verticalAlign: 'middle' as const, fontVariantNumeric: 'tabular-nums' as const };

export default function RunCompute({ db, run, go }: { db: HrmsDb; run: PayRun; go: (s: Step) => void }) {
  const locked = isLocked(run);
  const { checks, loading: checking, error: checksError } = usePreRunChecks(db, run);
  const blockers = (checks ?? []).filter((c) => c.severity === 'blocker').length;
  const gated = blockers > 0 && acknowledgedBlockers(run) < blockers;
  const [computing, setComputing] = useState(false);
  const stale = runIsStale(db, run);
  const totals = runTotals(run);
  const { prevRun, changes } = useMemo(() => comparePayslips(db, run), [db, run]);
  const prevTotals = prevRun ? runTotals(prevRun) : null;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [open, setOpen] = useState<string | null>(null);
  const [showLaw, setShowLaw] = useState(false);
  // The open payslip's detail sticks to the left edge of the scrolling table at the table's visible width, so it never needs a sideways scroll.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  const hasSlips = run.payslips.length > 0;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWrapW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasSlips]);

  const emps = useMemo(() => new Map(db.employees.map((e) => [e.id, e])), [db.employees]);
  const flagged = Array.from(changes.values()).filter((c) => c.flagged).length;
  const inScope = employeesForRun(db, run.month, run.entityId);
  const missing = inScope.filter((e) => !run.payslips.some((s) => s.employeeId === e.id));

  const rows = useMemo(() => {
    const name = (s: Payslip) => { const e = emps.get(s.employeeId); return e ? fullName(e) : ''; };
    const list = run.payslips.filter((s) => {
      const e = emps.get(s.employeeId);
      if (q.trim() && !`${e ? fullName(e) : ''} ${e?.code ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
      if (filter === 'changed') return changes.get(s.employeeId)?.flagged;
      if (filter === 'warnings') return s.warnings.length > 0;
      return true;
    });
    const val = (s: Payslip): number | string => {
      switch (sort.key) {
        case 'gross': return s.gross; case 'net': return s.net; case 'cost': return s.employerCost; case 'warn': return s.warnings.length;
        case 'change': return Math.abs(changes.get(s.employeeId)?.pct ?? 0); default: return name(s);
      }
    };
    return [...list].sort((a, b) => { const x = val(a); const y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [run.payslips, emps, q, filter, sort, changes]);

  // On live data the server computes and answers; the button waits for it and shows its reason if it refuses.
  const doCompute = async () => {
    setComputing(true);
    try {
      const res = await computeRun(run.id);
      report(res, `Computed ${employeesForRun(db, run.month, run.entityId).length} employees`);
    } finally { setComputing(false); }
  };

  if (!run.payslips.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Card>
          <EmptyState title="No payslips yet" description={`Computing builds one payslip for each of the ${inScope.length} employees in scope for ${fmtMonth(run.month)}, from their salary structure, attendance, adjustments and loans.`}
            action={<Button variant="primary" style={bigBtn} disabled={locked || gated || checking || computing} onClick={() => void doCompute()}>{computing ? 'Computing…' : 'Compute payslips'}</Button>} />
          {checksError && <div style={{ textAlign: 'center' }} data-testid="checks-error"><Note tone="warn">The pre-run checks could not be loaded ({checksError}), so blockers cannot be shown here. Open Checks to try again.</Note></div>}
          {gated && <div style={{ textAlign: 'center' }}><Note tone="red">{blockers} blocker{blockers === 1 ? '' : 's'} from the checks have not been confirmed. <button type="button" onClick={() => go('checks')} style={{ border: 0, background: 'transparent', color: T.red, textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>Open Checks</button> to fix or confirm them first.</Note></div>}
        </Card>
      </div>
    );
  }

  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '');
  const head = (key: SortKey, label: string, right?: boolean) => (
    <th scope="col" style={{ ...th, textAlign: right ? 'right' : 'left' }} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => sortBy(key)} style={{ all: 'unset', cursor: 'pointer', textTransform: 'inherit', letterSpacing: 'inherit' }}>{label}{arrow(key)}</button>
    </th>
  );
  const edliAdmin = run.payslips.reduce((s, p) => s + p.employer.filter((l) => l.code === 'EDLI' || l.code === 'PF_ADM').reduce((t, l) => t + l.amount, 0), 0);
  const pfPayable = totals.pfEmployee + totals.pfEmployer;
  const delta = prevTotals ? totals.net - prevTotals.net : 0;
  const deltaPct = prevTotals && prevTotals.net ? (delta / prevTotals.net) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {stale && !locked && (
        <Note tone="warn">
          <b>Inputs changed after the last compute.</b> The payslips below do not match the current attendance, adjustments, loans or salary data, and the run cannot be frozen until you recompute.{' '}
          <button type="button" onClick={() => void doCompute()} disabled={computing} style={{ border: 0, background: 'transparent', color: T.warn, textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0, fontWeight: 700 }}>Recompute now</button>
        </Note>
      )}
      {run.status === 'computed' && !stale && <Note tone="ok">Payslips match the current inputs.</Note>}

      <StatGrid min={170}>
        <Stat label="Payslips" value={totals.headcount} hint={totals.warnings ? `${totals.warnings} warning${totals.warnings === 1 ? '' : 's'}` : 'No warnings'} tone={totals.warnings ? 'warn' : undefined} />
        <Stat label="Gross pay" value={inr(totals.gross)} />
        <Stat label="Deductions" value={inr(totals.deductions)} />
        <Stat label="Net pay" value={inr(totals.net)} tone="ok" />
        <Stat label="Employer cost" value={inr(totals.employerCost)} hint="Gross, reimbursements and employer contributions" />
      </StatGrid>
      <StatGrid min={170}>
        <Stat label="PF payable" value={inr(pfPayable)} hint={`Employee ${inr(totals.pfEmployee)} + employer ${inr(totals.pfEmployer)}; EDLI and admin add ${inr(edliAdmin)}`} />
        <Stat label="ESI payable" value={inr(totals.esi)} hint="Employee and employer share" />
        <Stat label="Professional tax" value={inr(totals.pt)} />
        <Stat label="TDS payable" value={inr(totals.tds)} hint="Section 392 salary TDS" />
      </StatGrid>

      <Card>
        <CardTitle right={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => setShowLaw((v) => !v)} aria-expanded={showLaw}>{showLaw ? 'Hide' : 'Show'} statutory parameters</Button>
            {!locked && <Button size="sm" disabled={computing} onClick={() => void doCompute()}>Recompute</Button>}
          </div>
        }>Compared with last month</CardTitle>
        {prevRun && prevTotals ? (
          <div style={{ fontSize: 14, color: T.dim, lineHeight: 1.6 }} data-testid="run-compare">
            Net pay is <b style={{ color: T.text }}>{inr(totals.net)}</b> against <b style={{ color: T.text }}>{inr(prevTotals.net)}</b> in the {fmtMonth(prevRun.month)} run
            ({delta >= 0 ? '+' : ''}{inr(delta)}, {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%). {flagged} payslip{flagged === 1 ? '' : 's'} moved by more than {CHANGE_THRESHOLD_PCT}% and {flagged === 1 ? 'is' : 'are'} flagged below with the reason.
          </div>
        ) : <div style={{ fontSize: 14, color: T.mute }}>There is no earlier run for this entity to compare with.</div>}
        {showLaw && <div style={{ marginTop: 14 }}><LawBasisTable rows={lawBasis(db, run.month, run.entityId)} /></div>}
      </Card>

      {missing.length > 0 && (
        <Note tone="warn">{missing.length} employee{missing.length === 1 ? ' is' : 's are'} in scope but got no payslip because they have no salary structure or CTC: {missing.map((e) => fullName(e)).join(', ')}.</Note>
      )}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search payslips" />
        <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 230 }}>
          <option value="all">All payslips</option><option value="changed">Changed over {CHANGE_THRESHOLD_PCT}%</option><option value="warnings">With warnings</option>
        </Select>
        <span style={{ fontSize: 13, color: T.mute }}>{rows.length} of {run.payslips.length}</span>
      </Toolbar>

      <div ref={wrapRef} style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }} data-testid="payslip-table">
          <thead>
            <tr>
              {head('name', 'Employee')}
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Paid days</th>
              {head('gross', 'Gross', true)}
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Deductions</th>
              {head('net', 'Net pay', true)}
              {head('cost', 'Employer cost', true)}
              {head('change', 'Vs last month', true)}
              {head('warn', 'Warnings', true)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: T.mute, padding: 36 }}>No payslip matches this filter.</td></tr>}
            {rows.map((s) => {
              const e = emps.get(s.employeeId);
              const ch = changes.get(s.employeeId);
              const isOpen = open === s.id;
              return (
                <Fragment key={s.id}>
                  <tr data-testid="payslip-row" style={{ background: isOpen ? T.raised : undefined }}>
                    <td style={td}>
                      <button type="button" aria-expanded={isOpen} aria-controls={`detail-${s.id}`} onClick={() => setOpen(isOpen ? null : s.id)} aria-label={`${isOpen ? 'Hide' : 'Show'} the lines of ${e ? fullName(e) : 'employee'}`}
                        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, minHeight: 36 }}>
                        <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .12s', color: T.mute }}><path d="M9 6l6 6-6 6" /></svg>
                        <span><span style={{ fontWeight: 600, display: 'block' }}>{e ? fullName(e) : '—'}</span><span style={{ fontSize: 12, color: T.mute, fontFamily: T.mono }}>{e?.code}</span></span>
                      </button>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{s.paidDays}<span style={{ color: T.mute }}> / {s.daysInMonth}</span></td>
                    <td style={{ ...td, textAlign: 'right' }}>{inr(s.gross)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{inr(s.totalDeductions)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{inr(s.net)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{inr(s.employerCost)}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!ch ? <span style={{ color: T.mute }}>—</span> : ch.pct == null ? <Badge tone="warn">New</Badge>
                        : ch.flagged ? <Badge tone="warn" dot>{ch.pct >= 0 ? '+' : ''}{ch.pct.toFixed(1)}%</Badge>
                          : <span style={{ color: T.dim }}>{ch.pct >= 0 ? '+' : ''}{ch.pct.toFixed(1)}%</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{s.warnings.length ? <Badge tone="warn">{s.warnings.length}</Badge> : <span style={{ color: T.mute }}>0</span>}</td>
                  </tr>
                  {isOpen && (
                    <tr id={`detail-${s.id}`}>
                      <td colSpan={8} style={{ ...td, background: T.panel, padding: 0 }}>
                        <div style={{ position: 'sticky', left: 0, width: wrapW ? wrapW - 2 : undefined, boxSizing: 'border-box', padding: 16 }}><SlipDetail db={db} run={run} s={s} e={e} change={ch} /></div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="primary" style={bigBtn} onClick={() => go('review')} disabled={stale && !locked}>Continue to review</Button>
      </div>
    </div>
  );
}

function Lines({ title, lines, total, tone }: { title: string; lines: PayslipLine[]; total?: number; tone?: 'neg' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, marginBottom: 6 }}>{title}</div>
      {lines.length === 0 ? <div style={{ fontSize: 13, color: T.mute }}>None</div> : lines.map((l, i) => (
        <div key={`${l.code}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '3px 0' }}>
          <span style={{ color: T.dim, minWidth: 0 }}><span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute }}>{l.code}</span> {l.name}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: tone === 'neg' ? T.text : T.text }}>{inr(l.amount)}</span>
        </div>
      ))}
      {total != null && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, paddingTop: 6, marginTop: 4, borderTop: `1px solid ${T.border}` }}><span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(total)}</span></div>}
    </div>
  );
}

function SlipDetail({ db, run, s, e, change }: { db: HrmsDb; run: PayRun; s: Payslip; e?: Employee; change?: PayslipChange }) {
  const structure = db.structures.find((x) => x.id === e?.structureId);
  const b = e && structure ? employeeBreakup(db, e, structure, run.month) : null;
  const reimb = s.reimbursements.reduce((t, l) => t + l.amount, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
        <div>
          <Lines title="Earnings" lines={s.earnings} total={s.gross} />
          {s.reimbursements.length > 0 && <div style={{ marginTop: 12 }}><Lines title="Reimbursements (not in gross)" lines={s.reimbursements} total={reimb} /></div>}
        </div>
        <Lines title="Deductions" lines={s.deductions} total={s.totalDeductions} />
        <Lines title="Employer contributions" lines={s.employer} total={s.employer.reduce((t, l) => t + l.amount, 0)} />
      </div>
      <div style={{ fontSize: 13, color: T.dim }}>
        Net pay {inr(s.net)} = gross {inr(s.gross)}{reimb ? ` + reimbursements ${inr(reimb)}` : ''} - deductions {inr(s.totalDeductions)}. Employer cost {inr(s.employerCost)}.
      </div>
      {b && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, background: T.card }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <b style={{ fontSize: 13 }}>Wage test (50% rule)</b>
            <Badge tone={b.wageTest.passes ? 'ok' : 'warn'} dot>{b.wageTest.passes ? 'Pass' : 'Add-back applied'}</Badge>
            <Badge tone="warn">Reported, confirm</Badge>
          </div>
          <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.6 }}>
            Wages {inr(b.wageTest.wages)} a month are {b.wageTest.wagePct.toFixed(1)}% of the monthly CTC of {inr(b.wageTest.remuneration)}.
            {b.wageTest.passes ? ' That clears the 50% line, so wages are used as they are.' : ` ${inr(b.wageTest.addBack)} is added back, making code wages ${inr(b.wageTest.codeWages)}.`}
            {' '}This payslip uses PF wage {inr(s.wages.pfWage)}, ESI wage {inr(s.wages.esiWage)} and monthly taxable pay {inr(s.wages.taxableMonthly)}.
          </div>
        </div>
      )}
      {change?.flagged && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, background: T.warnWash }}>
          <b style={{ fontSize: 13, color: T.warn }}>Why net pay moved{change.pct != null ? ` ${change.pct >= 0 ? '+' : ''}${change.pct.toFixed(1)}%` : ''} ({change.delta >= 0 ? '+' : ''}{inr(change.delta)})</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: T.text, lineHeight: 1.55 }}>{change.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      {s.warnings.length > 0 && (
        <div>
          <b style={{ fontSize: 13 }}>Warnings</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, color: T.warn, lineHeight: 1.55 }}>{s.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      <div><Link href={`/dashboard/hrms/payslips/${s.id}`} style={{ color: T.info, fontWeight: 600, fontSize: 13.5 }}>Open the payslip</Link></div>
    </div>
  );
}
