'use client';
// One payslip: the paper view, a print button and a CSV download. The id is a payslip id found by scanning the pay runs.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, EmptyState, HrmsPage, Loading, Note, StatusBadge, T, downloadRows } from '../../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../../lib/hrms/db';
import { fmtMonth, fmtMonthLong, fullName } from '../../../../../lib/hrms/format';
import { findPayslip, isLocked } from '../../../../../components/hrms/payroll/logic';
import PayslipPaper from '../../../../../components/hrms/payroll/PayslipPaper';

export default function PayslipPage() {
  const params = useParams();
  const raw = params?.id;
  const id = String(Array.isArray(raw) ? raw[0] : raw ?? '');
  const db = useHrmsDb();
  if (!db) return <Loading />;
  const hit = findPayslip(db, id);
  if (!hit) {
    return (
      <HrmsPage title="Payslip not found">
        <EmptyState title="There is no payslip with this link"
          description="A payslip link stops working when its run is computed again, because the payslips are rebuilt, or when the sample data is reset. Open it again from the run."
          action={<Button variant="primary" href="/dashboard/hrms/payroll">Back to payroll</Button>} />
      </HrmsPage>
    );
  }
  const { run, slip } = hit;
  const e = db.employees.find((x) => x.id === slip.employeeId);

  const csv = () => {
    const rows: (string | number)[][] = [
      ['Payslip', '', `${e ? fullName(e) : ''} (${e?.code ?? ''})`, ''],
      ['Month', '', fmtMonthLong(slip.month), ''],
      ['Days', 'DAYS', `Days in month`, slip.daysInMonth], ['Days', 'PAID', 'Paid days', slip.paidDays], ['Days', 'LOP', 'Loss of pay days', slip.lopDays], ['Days', 'OT', 'Overtime hours', slip.overtimeHours],
      ...slip.earnings.map((l) => ['Earning', l.code, l.name, l.amount]),
      ['Total', 'GROSS', 'Gross earnings', slip.gross],
      ...slip.reimbursements.map((l) => ['Reimbursement', l.code, l.name, l.amount]),
      ...slip.deductions.map((l) => ['Deduction', l.code, l.name, l.amount]),
      ['Total', 'DEDUCTIONS', 'Total deductions', slip.totalDeductions],
      ['Total', 'NET', 'Net pay', slip.net],
      ...slip.employer.map((l) => ['Employer contribution', l.code, l.name, l.amount]),
      ['Total', 'EMPLOYER_COST', 'Employer cost', slip.employerCost],
      ['Law version', '', run.lawVersion, ''],
    ];
    downloadRows(`payslip-${e?.code ?? 'employee'}-${slip.month}`, ['Section', 'Code', 'Description', 'Amount'], rows);
  };

  return (
    <HrmsPage
      eyebrow={<span className="hr-noprint"><Link href={`/dashboard/hrms/payroll/runs/${run.id}?tab=pay`} style={{ color: T.mute, textDecoration: 'none' }}>Payroll / {fmtMonth(run.month)} run</Link></span>}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>Payslip, {e ? fullName(e) : 'employee'} <StatusBadge status={run.status} /></span>}
      description={`${fmtMonthLong(slip.month)} · ${db.entities.find((x) => x.id === run.entityId)?.name ?? ''}`}
      actions={<>
        <Button href={`/dashboard/hrms/payroll/runs/${run.id}?tab=compute`}>Back to the run</Button>
        <Button onClick={csv}>Download CSV</Button>
        <Button variant="primary" style={{ height: 40 }} onClick={() => window.print()}>Print</Button>
      </>}
    >
      <div className="hr-noprint" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!isLocked(run) && <Note tone="warn">This payslip is from a {run.status} run. It is not final and is not released to the employee until the run is frozen.</Note>}
        {slip.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
      </div>
      <PayslipPaper db={db} run={run} slip={slip} />
    </HrmsPage>
  );
}
