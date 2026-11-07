'use client';
// Form 130 (the Form 16 successor, as reported): a readable annual statement for one employee, built from the frozen or
// paid pay runs of the financial year. Part A is TDS by month, Part B the salary and the tax computation (annualTax).
// The sheet mimics paper, so it keeps its own white-and-black colours in both themes.

import { CSSProperties, ReactNode, useMemo, useState } from 'react';
import type { HrmsDb } from '../../../lib/hrms/types';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { fmtDate, fmtMonth, fullName, inr, inrWords } from '../../../lib/hrms/format';
import { Field, Select } from '../../ui';
import { Button, Card, CardTitle, EmptyState, Note, T, useIsCompact } from '../ui';
import { buildForm130, form130Employees, form130Years, type Form130Doc } from './builders';
import { Muted } from './parts';

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .hrms-print, .hrms-print * { visibility: visible !important; }
  .hrms-print { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; }
  .hrms-noprint { display: none !important; }
}`;

const ink = '#16181d';
const faint = '#5b616e';
const rule = '#c9ced8';
const cell: CSSProperties = { padding: '6px 8px', fontSize: 12.5, borderBottom: `1px solid ${rule}`, color: ink, verticalAlign: 'top' };
const head: CSSProperties = { ...cell, fontWeight: 700, background: '#eef0f4', textAlign: 'left', fontSize: 11.5, letterSpacing: '0.03em' };
const right: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

function PartTitle({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: '18px 0 6px', fontSize: 13.5, fontWeight: 700, color: ink }}>{children}</h3>;
}

export function Form130Section({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const years = useMemo(() => form130Years(db), [db]);
  const [fy, setFy] = useState(years[0]?.start ?? '');
  const emps = useMemo(() => (fy ? form130Employees(db, fy) : []), [db, fy]);
  const [empId, setEmpId] = useState('');
  const chosen = emps.find((e) => e.id === empId) ?? emps[0];
  const doc = useMemo(() => (chosen && fy ? buildForm130(db, chosen.id, fy) : null), [db, chosen, fy]);

  return (
    <Card>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="hrms-noprint">
        <CardTitle right={<Button onClick={() => window.print()} disabled={!doc} aria-label="Print Form 130" style={{ minHeight: 40 }}>Print</Button>}>
          Form 130 (the Form 16 successor, as reported)
        </CardTitle>
        <Muted style={{ marginTop: -6, marginBottom: 12 }}>
          A yearly statement of salary and tax deducted for each employee, built from the frozen and paid runs of the financial year. The layout is a working draft: the notified form has to be checked before anything is issued.
        </Muted>
        {years.length === 0 ? (
          <EmptyState title="No frozen or paid runs yet" description="Form 130 is built from frozen or paid pay runs. Freeze a run in Payroll and it will appear here." />
        ) : (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            <Field label="Financial year" style={{ width: narrow ? '100%' : 200 }}>
              <Select aria-label="Financial year" value={fy} onChange={(e) => { setFy(e.target.value); setEmpId(''); }}>
                {years.map((y) => <option key={y.start} value={y.start}>{y.label}</option>)}
              </Select>
            </Field>
            <Field label="Employee" style={{ width: narrow ? '100%' : 320 }}>
              <Select aria-label="Employee for Form 130" value={chosen?.id ?? ''} onChange={(e) => setEmpId(e.target.value)}>
                {emps.map((e) => <option key={e.id} value={e.id}>{e.code} · {fullName(e)}</option>)}
              </Select>
            </Field>
          </div>
        )}
      </div>
      {doc && <Form130Paper doc={doc} narrow={narrow} />}
      {years.length > 0 && !doc && <Muted>This employee has no payslip in the selected year.</Muted>}
    </Card>
  );
}

function Form130Paper({ doc, narrow }: { doc: Form130Doc; narrow: boolean }) {
  const e = doc.employee;
  const sig = doc.entity?.signatory;
  const monthsMissing = doc.months.filter((m) => !m.hasRun);
  const taxLines: [string, string, number | null][] = [
    [`Regular taxable pay of ${fmtMonth(doc.basis.latestMonth)}, times 12`, 'The payroll engine annualises the latest regular month', doc.basis.regularAnnual],
    ['One-time taxable pay in the year', 'Arrears, bonus, incentive and overtime paid', doc.basis.oneTime],
    ['Salary on the annual basis', '', doc.basis.annualGross],
    [doc.regime === 'new' ? 'Less: standard deduction' : 'Less: standard deduction, HRA, 80C, 80D, NPS, home loan interest and professional tax', 'As allowed in the regime on file', -doc.tax.exemptions],
    ['Taxable income', '', doc.tax.taxable],
    ['Tax on taxable income', 'After rebate and marginal relief', doc.tax.tax],
    ['Health and education cess', '', doc.tax.cess],
    ['Total tax on the annual basis', '', doc.tax.total],
    ['Less: TDS deducted in Part A', '', -doc.totals.tds],
  ];
  return (
    <div className="hrms-print" data-testid="form130" style={{ background: '#ffffff', color: ink, border: `1px solid ${rule}`, borderRadius: 6, padding: narrow ? 14 : 28, boxShadow: '0 1px 3px rgba(10,14,26,.12)', fontFamily: 'Georgia, "Times New Roman", serif', maxWidth: 860, margin: '0 auto', overflowX: 'auto' }}>
      <div style={{ textAlign: 'center', borderBottom: `2px solid ${ink}`, paddingBottom: 10 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', color: faint }}>PREVIEW ON SAMPLE DATA. NOT FOR ISSUE.</div>
        <h2 style={{ margin: '4px 0 2px', fontSize: 19, color: ink }}>Form 130</h2>
        <div style={{ fontSize: 12.5, color: faint }}>Statement of salary and tax deducted at source, {doc.fyLabel}</div>
        <div style={{ fontSize: 11.5, color: faint }}>Successor to Form 16 under the Income-tax Act 2025 (as reported). Field layout to be confirmed against the notified form.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 16, marginTop: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: faint, letterSpacing: '0.06em' }}>EMPLOYER</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{doc.entity?.name ?? '—'}</div>
          <div style={{ fontSize: 12.5 }}>TAN {doc.entity?.tan ?? '—'} · PAN {doc.entity?.pan ?? '—'}</div>
          <div style={{ fontSize: 12.5, color: faint }}>{[doc.entity?.address.line1, doc.entity?.address.city, doc.entity?.address.state, doc.entity?.address.pincode].filter(Boolean).join(', ')}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: faint, letterSpacing: '0.06em' }}>EMPLOYEE</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{fullName(e)} <span style={{ fontWeight: 400, color: faint }}>({e.code})</span></div>
          <div style={{ fontSize: 12.5 }}>PAN {e.pan ?? 'not on file'} · Tax regime on file: {doc.regime === 'new' ? 'New' : 'Old'}</div>
          <div style={{ fontSize: 12.5, color: faint }}>Joined {fmtDate(e.joinDate)}{e.lastWorkingDate ? `, last working day ${fmtDate(e.lastWorkingDate)}` : ''}</div>
        </div>
      </div>

      <PartTitle>Part A: tax deducted and deposited, by month</PartTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th scope="col" style={head}>Month</th>
            <th scope="col" style={{ ...head, ...right }}>Salary paid</th>
            <th scope="col" style={{ ...head, ...right }}>TDS deducted</th>
            <th scope="col" style={head}>Deposit of tax</th>
          </tr>
        </thead>
        <tbody>
          {doc.months.map((m) => (
            <tr key={m.month} style={m.hasRun ? undefined : { color: faint }}>
              <td style={cell}>{fmtMonth(m.month)}</td>
              <td style={{ ...cell, ...right }}>{m.hasRun ? inr(m.gross) : '—'}</td>
              <td style={{ ...cell, ...right }}>{m.hasRun ? inr(m.tds) : '—'}</td>
              <td style={cell}>
                {!m.hasRun ? 'No pay run in the sample data'
                  : !m.deposit ? 'No challan on record'
                  : m.deposit.status === 'filed' ? `Deposited ${fmtDate(m.deposit.filedOn)}, reference ${m.deposit.reference ?? '—'}`
                  : `Not deposited yet (${m.deposit.status.replace('_', ' ')})`}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>Total</td>
            <td style={{ ...cell, ...right, fontWeight: 700 }}>{inr(doc.totals.gross)}</td>
            <td style={{ ...cell, ...right, fontWeight: 700 }} data-testid="form130-tds">{inr(doc.totals.tds)}</td>
            <td style={cell} />
          </tr>
        </tfoot>
      </table>
      {monthsMissing.length > 0 && (
        <div style={{ fontSize: 12, color: faint, marginTop: 6 }}>
          Only months with a frozen or paid run are included. {monthsMissing.length === 1 ? `${fmtMonth(monthsMissing[0]!.month)} has` : `${monthsMissing.length} months have`} no run in the sample data.
        </div>
      )}

      <PartTitle>Part B: salary paid and tax computation</PartTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr><th scope="col" style={head}>Salary received in the months above</th><th scope="col" style={{ ...head, ...right }}>Amount</th></tr>
        </thead>
        <tbody>
          {doc.earnings.map((l) => (
            <tr key={l.code}><td style={cell}>{l.name}</td><td style={{ ...cell, ...right }}>{inr(l.amount)}</td></tr>
          ))}
          <tr><td style={{ ...cell, fontWeight: 700 }}>Gross salary</td><td style={{ ...cell, ...right, fontWeight: 700 }}>{inr(doc.totals.gross)}</td></tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, minWidth: 520 }}>
        <thead>
          <tr><th scope="col" style={head}>Tax computation on the annual basis</th><th scope="col" style={{ ...head, ...right }}>Amount</th></tr>
        </thead>
        <tbody>
          {taxLines.map(([label, sub, amt], i) => (
            <tr key={i}>
              <td style={cell}>{label}{sub && <div style={{ fontSize: 11.5, color: faint }}>{sub}</div>}</td>
              <td style={{ ...cell, ...right, fontWeight: i === 4 || i === 7 ? 700 : 400 }}>{amt == null ? '' : amt < 0 ? `(${inr(-amt)})` : inr(amt)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>{doc.balance >= 0 ? 'Balance still to be deducted over the remaining months' : 'Deducted in excess of the annual basis'}</td>
            <td style={{ ...cell, ...right, fontWeight: 700 }} data-testid="form130-balance">{inr(Math.abs(doc.balance))}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: faint, marginTop: 6 }}>
        Tax on the annual basis in words: {inrWords(doc.tax.total)} The computation uses the regime and declarations on file and ignores surcharge.
      </div>

      <div style={{ marginTop: 26, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 12, color: faint, maxWidth: 420 }}>
          Prepared on {fmtDate(PREVIEW_TODAY)} from {doc.monthsWithRun} frozen or paid {doc.monthsWithRun === 1 ? 'run' : 'runs'}. This is a working statement on sample data, not a certificate.
        </div>
        <div style={{ textAlign: 'center', minWidth: 200 }}>
          <div style={{ borderTop: `1px solid ${ink}`, paddingTop: 4, fontSize: 12.5 }}>
            {sig ? <>{sig.name}<div style={{ color: faint }}>{sig.designation}, {doc.entity?.name}</div></> : 'Authorised signatory'}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Form130Note() {
  return <Note tone="info">Form 130 here is a readable annual statement for a preview. It is not signed or issued, and the sample data covers only the months that have a run.</Note>;
}
