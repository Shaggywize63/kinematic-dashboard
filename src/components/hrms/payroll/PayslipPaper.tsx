'use client';
// The payslip as a sheet of paper. Always black on white, whatever the dashboard theme, so what prints is what you see.

import type { CSSProperties } from 'react';
import type { Employee, HrmsDb, PayRun, Payslip, PayslipLine } from '../../../lib/hrms/types';
import { fmtDate, fmtMonthLong, fullName, inr, inrWords } from '../../../lib/hrms/format';
import { maskAccount, maskPan } from '../../../lib/hrms/validators';
import { maskUan } from './logic';
import { PrintStyle } from './shared';

const INK = '#1f2328', DIM = '#6b7280', LINE = '#d1d5db', SHADE = '#f3f4f6';
const head: CSSProperties = { padding: '6px 8px', fontSize: 11, fontWeight: 700, background: SHADE, borderBottom: `1px solid ${LINE}`, textAlign: 'left' };
const cell: CSSProperties = { padding: '5px 8px', fontSize: 12, borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' };
const amt: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

/** Codes of the payslip lines that are wage components in the employee's structure. */
export function wageCodes(db: HrmsDb, e: Employee | undefined): Set<string> {
  const s = db.structures.find((x) => x.id === e?.structureId);
  return new Set((s?.components ?? []).filter((c) => c.isWage).map((c) => c.code));
}

function Lines({ lines, wages, empty }: { lines: PayslipLine[]; wages?: Set<string>; empty: string }) {
  if (!lines.length) return <tr><td style={{ ...cell, color: DIM }} colSpan={2}>{empty}</td></tr>;
  return <>{lines.map((l, i) => (
    <tr key={`${l.code}-${i}`}>
      <td style={cell}>{l.name}{wages?.has(l.code) ? ' †' : ''}</td>
      <td style={{ ...cell, ...amt }}>{inr(l.amount)}</td>
    </tr>
  ))}</>;
}

export default function PayslipPaper({ db, run, slip }: { db: HrmsDb; run: PayRun; slip: Payslip }) {
  const e = db.employees.find((x) => x.id === slip.employeeId);
  const entity = db.entities.find((x) => x.id === run.entityId);
  const loc = db.locations.find((l) => l.id === e?.locationId);
  const desig = db.designations.find((d) => d.id === e?.designationId)?.name;
  const dept = db.departments.find((d) => d.id === e?.departmentId)?.name;
  const wages = wageCodes(db, e);
  const pf = entity?.registrations.find((r) => r.type === 'pf');
  const reimb = slip.reimbursements.reduce((t, l) => t + l.amount, 0);
  const employerTotal = slip.employer.reduce((t, l) => t + l.amount, 0);
  const hasWageMark = slip.earnings.some((l) => wages.has(l.code));
  const address = [entity?.address.line1, entity?.address.city, entity?.address.state, entity?.address.pincode].filter(Boolean).join(', ');

  const meta: [string, string][] = [
    ['Employee', e ? fullName(e) : '—'], ['Employee code', e?.code ?? '—'],
    ['Designation', desig ?? '—'], ['Department', dept ?? '—'],
    ['Location', loc?.name ?? '—'], ['Date of joining', fmtDate(e?.joinDate)],
    ['PAN', maskPan(e?.pan)], ['UAN', maskUan(e?.uan)],
    ['Bank account', e?.bank ? `${e.bank.bankName}, ${maskAccount(e.bank.accountNumber)}` : e?.payMode === 'bank' ? 'Not on file' : `Paid by ${e?.payMode ?? '—'}`], ['IFSC', e?.bank?.ifsc ?? '—'],
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <PrintStyle rootClass="payslip-paper" />
      <div className="payslip-paper" data-testid="payslip-paper" style={{ background: '#fff', color: INK, width: '100%', maxWidth: 794, minWidth: 640, margin: '0 auto', padding: '32px 36px', boxSizing: 'border-box', borderRadius: 6, boxShadow: '0 1px 8px rgba(0,0,0,.18)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{entity?.name ?? db.company.name}</div>
            <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.55, marginTop: 4 }}>
              {address}<br />
              {entity ? `PAN ${entity.pan}  ·  TAN ${entity.tan}` : ''}{pf ? `  ·  PF ${pf.number}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.02em' }}>PAYSLIP</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{fmtMonthLong(slip.month)}</div>
          </div>
        </div>

        <hr style={{ border: 0, borderTop: `1px solid ${LINE}`, margin: '16px 0 12px' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 28px' }}>
          {meta.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', fontSize: 12, lineHeight: '20px' }}>
              <span style={{ width: 108, color: DIM, flexShrink: 0 }}>{k}</span><b style={{ overflowWrap: 'anywhere' }}>{v}</b>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14 }}>
          {([['Days in month', slip.daysInMonth], ['Paid days', slip.paidDays], ['Loss of pay days', slip.lopDays], ['Overtime hours', slip.overtimeHours]] as const).map(([k, v]) => (
            <div key={k} style={{ background: SHADE, padding: '8px 10px', borderRadius: 4 }}>
              <div style={{ fontSize: 10.5, color: DIM }}>{k}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><td role="columnheader" style={head}>Earnings</td><td role="columnheader" style={{ ...head, ...amt }}>Amount</td></tr></thead>
            <tbody>
              <Lines lines={slip.earnings} wages={wages} empty="No earnings" />
              <tr><td style={{ ...cell, fontWeight: 700, background: SHADE }}>Gross earnings</td><td style={{ ...cell, ...amt, fontWeight: 700, background: SHADE }}>{inr(slip.gross)}</td></tr>
              {slip.reimbursements.length > 0 && <>
                <tr><td colSpan={2} style={{ ...head, borderTop: `1px solid ${LINE}` }}>Reimbursements (not part of gross)</td></tr>
                <Lines lines={slip.reimbursements} empty="" />
                <tr><td style={{ ...cell, fontWeight: 700 }}>Total reimbursements</td><td style={{ ...cell, ...amt, fontWeight: 700 }}>{inr(reimb)}</td></tr>
              </>}
            </tbody>
          </table>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><td role="columnheader" style={head}>Deductions</td><td role="columnheader" style={{ ...head, ...amt }}>Amount</td></tr></thead>
            <tbody>
              <Lines lines={slip.deductions} empty="No deductions" />
              <tr><td style={{ ...cell, fontWeight: 700, background: SHADE }}>Total deductions</td><td style={{ ...cell, ...amt, fontWeight: 700, background: SHADE }}>{inr(slip.totalDeductions)}</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, border: `1px solid ${INK}`, borderRadius: 4, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: DIM }}>Net pay = gross {inr(slip.gross)}{reimb ? ` + reimbursements ${inr(reimb)}` : ''} - deductions {inr(slip.totalDeductions)}</div>
            <div style={{ fontSize: 12, fontStyle: 'italic', fontWeight: 700, marginTop: 3 }} data-testid="net-words">{inrWords(slip.net)}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800 }} data-testid="net-pay">{inr(slip.net)}</div>
        </div>

        <div style={{ marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><td role="columnheader" style={head}>Employer contributions (paid by the company, not deducted from you)</td><td role="columnheader" style={{ ...head, ...amt }}>Amount</td></tr></thead>
            <tbody>
              <Lines lines={slip.employer} empty="None" />
              <tr><td style={{ ...cell, fontWeight: 700, background: SHADE }}>Total employer contributions</td><td style={{ ...cell, ...amt, fontWeight: 700, background: SHADE }}>{inr(employerTotal)}</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, fontSize: 10.5, color: DIM, lineHeight: 1.6 }}>
          {hasWageMark && <div>† Counted as wages under the Labour Codes (basic, dearness allowance and similar). Wages feed the 50% test, PF and gratuity.</div>}
          <div>Computed under {run.lawVersion}. Sample data for a preview; statutory rates are not confirmed for live use.</div>
          <div>This is a computer-generated payslip and does not need a signature.</div>
        </div>
      </div>
    </div>
  );
}
