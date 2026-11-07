import { test, expect } from '@playwright/test';
import { annualTax, addWorkingDays, buildBreakup, buildBankFile, buildEcr, computeFnf, computePayslip, runTotals, employeesForRun, preRunChecks } from '../src/lib/hrms/engine';
import { ESI, PF, TDS, professionalTax, valueOn, isMetroCity, lwfFor } from '../src/lib/hrms/rules';
import { checkAadhaar, checkAccount, checkEsic, checkIfsc, checkPan, checkUan, sampleAadhaar, completeness } from '../src/lib/hrms/validators';
import { inr, inrWords, inrShort, financialYear, tenure } from '../src/lib/hrms/format';
import { makeSeed } from '../src/lib/hrms/seed';

/** Pure logic behind the HRMS preview: statutory rules, salary breakup, payslips, F&F, files. No browser. */

const db = makeSeed();
const std = db.structures.find((s) => s.id === 'str_std')!;
const field = db.structures.find((s) => s.id === 'str_field')!;

test.describe('effective-dated rules', () => {
  test('the PF wage ceiling moves on 17 Sep 2026', () => {
    expect(valueOn(PF.ceiling, '2026-09-16')).toBe(15000);
    expect(valueOn(PF.ceiling, '2026-09-17')).toBe(25000);
  });
  test('ESI ceiling is 21,000', () => expect(valueOn(ESI.ceiling, '2026-11-01')).toBe(21000));
  test('the HRA metro list gains four cities from 1 Apr 2026', () => {
    expect(isMetroCity('Bengaluru', '2026-03-31')).toBe(false);
    expect(isMetroCity('Bengaluru', '2026-04-01')).toBe(true);
    expect(isMetroCity('Bangalore', '2026-11-01')).toBe(true);
    expect(isMetroCity('Jaipur', '2026-11-01')).toBe(false);
  });
  test('professional tax follows the state slab, with the February balance', () => {
    expect(professionalTax('Karnataka', 30000, 'male', '2026-11')).toBe(200);
    expect(professionalTax('Karnataka', 30000, 'male', '2027-02')).toBe(300);
    expect(professionalTax('Karnataka', 20000, 'male', '2026-11')).toBe(0);
    expect(professionalTax('Maharashtra', 20000, 'female', '2026-11')).toBe(0);
    expect(professionalTax('Maharashtra', 20000, 'male', '2026-11')).toBe(200);
    expect(professionalTax('Delhi', 90000, 'male', '2026-11')).toBe(0);
  });
  test('labour welfare fund applies only in its months', () => {
    expect(lwfFor('Maharashtra', '2026-06')).toEqual({ employee: 12, employer: 36 });
    expect(lwfFor('Maharashtra', '2026-07')).toEqual({ employee: 0, employer: 0 });
  });
});

test.describe('salary breakup', () => {
  test('a 12 lakh office CTC splits to the rupee and adds back up to the CTC', () => {
    const b = buildBreakup(std, 1200000, { asOn: '2026-11-30' });
    const byCode = Object.fromEntries(b.lines.map((l) => [l.code, l.monthly]));
    expect(byCode.BASIC).toBe(50000);
    expect(byCode.HRA).toBe(25000);
    expect(byCode.PF_ER).toBe(3000);            // 12% of the 25,000 ceiling
    expect(byCode.GRATUITY).toBe(2405);         // 4.81% of basic
    const total = b.lines.reduce((s, l) => s + l.monthly, 0);
    expect(Math.abs(total - 100000)).toBeLessThanOrEqual(1);
    expect(b.wageTest.passes).toBe(true);
    expect(b.monthlyGross).toBe(b.lines.filter((l) => l.kind === 'earning').reduce((s, l) => s + l.monthly, 0));
  });
  test('wages under 50% of remuneration are topped up and flagged', () => {
    const b = buildBreakup(field, 600000, { asOn: '2026-11-30' });
    expect(b.basic).toBe(17500);
    expect(b.wageTest.passes).toBe(false);
    expect(Math.round(b.wageTest.addBack)).toBe(7500);
    expect(Math.round(b.wageTest.codeWages)).toBe(25000);
    expect(b.warnings.some((w) => w.startsWith('Wages are'))).toBe(true);
  });
  test('the PF ceiling in force on the pay date caps the employer share', () => {
    const before = buildBreakup(std, 1200000, { asOn: '2026-08-31' }).lines.find((l) => l.code === 'PF_ER')!.monthly;
    const after = buildBreakup(std, 1200000, { asOn: '2026-11-30' }).lines.find((l) => l.code === 'PF_ER')!.monthly;
    expect(before).toBe(1800);
    expect(after).toBe(3000);
  });
});

test.describe('income tax', () => {
  const base = { regime: 'new' as const, basicAnnual: 0, hraAnnual: 0, metro: false, employeePfAnnual: 0, ptAnnual: 0, declaration: { sec80C: 0, sec80D: 0, nps80CCD1B: 0, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'not_submitted' as const } };
  test('new regime: no tax up to 12.75 lakh of salary (rebate plus standard deduction)', () => {
    expect(annualTax({ ...base, annualGross: 1275000 }).total).toBe(0);
  });
  test('new regime: 15 lakh of salary', () => {
    // taxable 14.25L: 20,000 + 40,000 + 15% of 2.25L = 93,750, cess 3,750
    expect(annualTax({ ...base, annualGross: 1500000 }).total).toBe(97500);
  });
  test('marginal relief keeps tax just above the rebate limit below the extra income', () => {
    const t = annualTax({ ...base, annualGross: 1300000 }); // taxable 12.25L
    expect(t.tax).toBeLessThanOrEqual(25000);
  });
  test('old regime honours declared deductions', () => {
    const decl = { sec80C: 150000, sec80D: 25000, nps80CCD1B: 50000, homeLoanInterest: 0, rentPaidAnnual: 0, other: 0, status: 'verified' as const };
    const withDecl = annualTax({ ...base, regime: 'old', annualGross: 1200000, declaration: decl }).total;
    const without = annualTax({ ...base, regime: 'old', annualGross: 1200000 }).total;
    expect(withDecl).toBeLessThan(without);
  });
  test('slab tables are what the rules file says', () => {
    expect(TDS.newRegime.slabs[0]).toEqual({ upTo: 400000, rate: 0 });
    expect(TDS.cess).toBe(4);
  });
});

test.describe('payslips on the sample company', () => {
  const entityId = 'ent_retail';
  const oct = db.payRuns.find((r) => r.month === '2026-10' && r.entityId === entityId)!;

  test('the seed holds closed runs for Sep and Oct', () => {
    expect(db.payRuns.map((r) => r.month).sort()).toContain('2026-10');
    expect(oct.status).toBe('paid');
    expect(oct.payslips.length).toBeGreaterThan(8);
  });
  test('every payslip balances: net = gross + reimbursements - deductions, and nothing is NaN', () => {
    for (const run of db.payRuns) {
      for (const s of run.payslips) {
        const reimb = s.reimbursements.reduce((t, l) => t + l.amount, 0);
        expect(s.net).toBe(s.gross + reimb - s.totalDeductions);
        expect(s.gross).toBe(s.earnings.reduce((t, l) => t + l.amount, 0));
        expect(s.totalDeductions).toBe(s.deductions.reduce((t, l) => t + l.amount, 0));
        for (const v of [s.gross, s.net, s.employerCost, s.wages.pfWage, s.wages.codeWages]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
  test('employee PF is 12% of the PF wage and employer PF splits into EPF and EPS', () => {
    const slip = oct.payslips.find((s) => s.deductions.some((d) => d.code === 'PF'))!;
    const pf = slip.deductions.find((d) => d.code === 'PF')!.amount;
    expect(pf).toBe(Math.round((slip.wages.pfWage * 12) / 100));
    const epf = slip.employer.find((l) => l.code === 'EPF_ER')?.amount ?? 0;
    const eps = slip.employer.find((l) => l.code === 'EPS_ER')?.amount ?? 0;
    expect(epf + eps).toBe(Math.round((slip.wages.pfWage * 12) / 100));
  });
  test('a low-paid warehouse worker gets ESI both ways, a high earner does not', () => {
    const low = db.employees.find((e) => e.id === 'emp_12')!;
    const lowSlip = oct.payslips.length ? db.payRuns.find((r) => r.month === '2026-10' && r.entityId === low.entityId)!.payslips.find((s) => s.employeeId === low.id)! : null;
    expect(lowSlip!.deductions.some((d) => d.code === 'ESI')).toBe(true);
    expect(lowSlip!.employer.some((l) => l.code === 'ESI_ER')).toBe(true);
    const high = oct.payslips.find((s) => s.employeeId === 'emp_1')!;
    expect(high.deductions.some((d) => d.code === 'ESI')).toBe(false);
  });
  test('loss of pay prorates earnings', () => {
    const e = db.employees.find((x) => x.id === 'emp_5')!;
    const structure = db.structures.find((s) => s.id === e.structureId)!;
    const loc = db.locations.find((l) => l.id === e.locationId)!;
    const att = (lop: number) => ({ employeeId: e.id, month: '2026-11', daysInMonth: 30, presentDays: 30 - lop, paidLeaveDays: 0, weeklyOffs: 4, holidays: 0, lopDays: lop, overtimeHours: 0, locked: false });
    const common = { employee: e, structure, location: loc, adjustments: [], loans: [], shiftHours: 8, month: '2026-11', runId: 'x' };
    const full = computePayslip({ ...common, attendance: att(0) });
    const half = computePayslip({ ...common, attendance: att(15) });
    expect(half.gross).toBeLessThan(full.gross);
    expect(Math.abs(half.gross - full.gross / 2)).toBeLessThanOrEqual(5);
  });
  test('overtime pays at twice the ordinary hourly wage', () => {
    const e = db.employees.find((x) => x.id === 'emp_12')!;
    const structure = db.structures.find((s) => s.id === e.structureId)!;
    const loc = db.locations.find((l) => l.id === e.locationId)!;
    const att = { employeeId: e.id, month: '2026-11', daysInMonth: 30, presentDays: 26, paidLeaveDays: 0, weeklyOffs: 4, holidays: 0, lopDays: 0, overtimeHours: 10, locked: false };
    const slip = computePayslip({ employee: e, structure, location: loc, attendance: att, adjustments: [], loans: [], overtimeRule: db.overtimeRules[0], shiftHours: 8, month: '2026-11', runId: 'x' });
    const ot = slip.earnings.find((l) => l.code === 'OT')!;
    const b = buildBreakup(structure, e.annualCtc!, { asOn: '2026-11-30', pfMember: e.pfMember, pfOnActual: e.pfOnActualWage });
    expect(ot.amount).toBe(Math.round(10 * (b.wageTest.codeWages / (26 * 8)) * 2));
  });
  test('run totals add up', () => {
    const t = runTotals(oct);
    expect(t.headcount).toBe(oct.payslips.length);
    expect(t.net).toBe(oct.payslips.reduce((s, p) => s + p.net, 0));
  });
});

test.describe('pre-run checks and files', () => {
  test('missing bank, UAN and PAN are caught before the run', () => {
    const checks = preRunChecks(db, '2026-11', 'ent_retail');
    const titles = checks.map((c) => c.title);
    expect(titles).toContain('No bank account');   // Sana
    expect(titles).toContain('UAN not Aadhaar-seeded'); // Pooja
    expect(checks.find((c) => c.title === 'No bank account')!.severity).toBe('blocker');
  });
  test('the ECR skips and reports employees whose UAN is missing or unseeded', () => {
    const run = db.payRuns.find((r) => r.month === '2026-10' && r.entityId === 'ent_retail')!;
    const ecr = buildEcr(db, run);
    expect(ecr.rows).toBeGreaterThan(5);
    expect(ecr.text.split('\n')[0]!.split('#~#').length).toBe(11);
    expect(ecr.blocked.length).toBeGreaterThan(0);
  });
  test('the bank file lists only people who can be paid by transfer', () => {
    const run = db.payRuns.find((r) => r.month === '2026-10' && r.entityId === 'ent_retail')!;
    const bank = buildBankFile(db, run);
    expect(bank.rows.length + bank.skipped.length).toBe(run.payslips.length);
    expect(bank.skipped.some((s) => s.reason === 'No bank account')).toBe(true);
  });
  test('employees in a run: joiners after month end and leavers before month start are out', () => {
    const ids = employeesForRun(db, '2026-11', 'ent_retail').map((e) => e.id);
    expect(ids).not.toContain('emp_24');  // onboarding (joins 16 Nov, after... still onboarding)
    expect(ids).not.toContain('emp_25');  // onboarding
    expect(ids).not.toContain('emp_23');  // exited on 30 Sep
    expect(ids).toContain('emp_22');      // on notice, leaves 30 Nov
  });
});

test.describe('full and final', () => {
  test('gratuity needs five years for permanent staff and uses 15/26 of wages per year', () => {
    const long = db.employees.find((e) => e.id === 'emp_1')!;          // joined 2017
    const res = computeFnf(db, { id: 'f', employeeId: long.id, lastWorkingDate: '2026-11-30', noticeDaysServed: 90, leaveEncashDays: 10, otherRecoveries: 0, otherPayments: 0, status: 'draft', dueBy: '' })!;
    expect(res.gratuity.eligible).toBe(true);
    expect(res.gratuity.amount).toBeGreaterThan(0);
    const short = db.employees.find((e) => e.id === 'emp_9')!;         // joined 2025
    const r2 = computeFnf(db, { id: 'f2', employeeId: short.id, lastWorkingDate: '2026-11-30', noticeDaysServed: 30, leaveEncashDays: 0, otherRecoveries: 0, otherPayments: 0, status: 'draft', dueBy: '' })!;
    expect(r2.gratuity.eligible).toBe(false);
  });
  test('a notice shortfall is recovered', () => {
    const e = db.employees.find((x) => x.id === 'emp_22')!;
    const res = computeFnf(db, { id: 'f3', employeeId: e.id, lastWorkingDate: '2026-11-30', noticeDaysServed: 10, leaveEncashDays: 0, otherRecoveries: 0, otherPayments: 0, status: 'draft', dueBy: '' })!;
    expect(res.lines.some((l) => l.label.startsWith('Notice shortfall'))).toBe(true);
  });
  test('settlement is due two working days after the last day (Sundays do not count)', () => {
    expect(addWorkingDays('2026-11-06', 2)).toBe('2026-11-09'); // Fri → Sat (1), skip Sun, Mon (2)
  });
});

test.describe('identifier checks', () => {
  test('PAN', () => {
    expect(checkPan('ABCPE1234F').ok).toBe(true);
    expect(checkPan('abcpe1234f').ok).toBe(true);
    expect(checkPan('ABCDE12345').ok).toBe(false);
  });
  test('Aadhaar checksum', () => {
    expect(checkAadhaar(sampleAadhaar(7)).ok).toBe(true);
    expect(checkAadhaar('123456789012').ok).toBe(false);
    expect(checkAadhaar('2345').ok).toBe(false);
  });
  test('UAN, ESIC, IFSC, account', () => {
    expect(checkUan('100200300400').ok).toBe(true);
    expect(checkUan('1002').ok).toBe(false);
    expect(checkEsic('1100123450').ok).toBe(true);
    expect(checkIfsc('HDFC0001234').ok).toBe(true);
    expect(checkIfsc('HDFC1001234').ok).toBe(false);
    expect(checkAccount('501000000000').ok).toBe(true);
  });
  test('completeness lists what is missing', () => {
    const e = db.employees.find((x) => x.id === 'emp_9')!; // no bank
    const c = completeness(e);
    expect(c.missing).toContain('Bank account');
    expect(c.pct).toBeLessThan(100);
  });
});

test.describe('formatting', () => {
  test('Indian grouping and words', () => {
    expect(inr(1234567)).toBe('₹12,34,567');
    expect(inrShort(1850000)).toBe('₹18.5L');
    expect(inrWords(125000)).toBe('Rupees One Lakh Twenty Five Thousand Only');
    expect(inrWords(0)).toBe('Rupees Zero Only');
  });
  test('financial year and tenure', () => {
    expect(financialYear('2026-11')).toMatchObject({ label: 'FY 2026-27', monthsElapsed: 8, monthsLeft: 5 });
    expect(financialYear('2027-02').label).toBe('FY 2026-27');
    expect(tenure('2020-03-02', '2026-11-07')).toMatchObject({ years: 6, months: 8 });
  });
});
