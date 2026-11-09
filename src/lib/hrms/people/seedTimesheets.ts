// Timesheet seed: five projects (three clients, two internal), eight people in Technology and Operations, four weeks.
// Hours are generated from a fixed plan per person with a seeded random wobble. Deterministic.

import { addDays } from '../format';
import { makeRng } from '../areaStore';
import { PREVIEW_TODAY } from '../seed';
import { sheetId, emptyLine, sheetTotal, weekDates } from './timesheetEngine';
import type { Project, Sheet, SheetLine, TimesheetState } from './types';

export const PROJECTS: Project[] = [
  { id: 'p_northwind', name: 'Northwind Foods: fulfilment', client: 'Northwind Foods', kind: 'client', billable: true, budgetHours: 1200, priorHours: 380, sampleRate: 520 },
  { id: 'p_helio', name: 'Helio Retail: inventory portal', client: 'Helio Retail', kind: 'client', billable: true, budgetHours: 640, priorHours: 366, sampleRate: 2200 },
  { id: 'p_orbit', name: 'Orbit Pharma: cold-chain pilot', client: 'Orbit Pharma', kind: 'client', billable: true, budgetHours: 320, priorHours: 150, sampleRate: 1350 },
  { id: 'p_hrms', name: 'Internal: HRMS rollout', client: 'Internal', kind: 'internal', billable: false, budgetHours: 400, priorHours: 120, sampleRate: 0 },
  { id: 'p_admin', name: 'Internal: training and admin', client: 'Internal', kind: 'internal', billable: false, budgetHours: 520, priorHours: 240, sampleRate: 0 },
];

/** Who tracks time, and the weekly hours they plan against each project. */
const PLAN: { id: string; plan: Record<string, number>; sat?: number; approver: string }[] = [
  { id: 'emp_5', plan: { p_helio: 20, p_hrms: 12, p_admin: 6 }, approver: 'Sanjay Kulkarni' },
  { id: 'emp_17', plan: { p_helio: 28, p_orbit: 4, p_admin: 4 }, approver: 'Divya Menon' },
  { id: 'emp_10', plan: { p_northwind: 16, p_orbit: 8, p_admin: 12 }, approver: 'Sanjay Kulkarni' },
  { id: 'emp_11', plan: { p_northwind: 20, p_orbit: 6, p_admin: 8 }, approver: 'Sanjay Kulkarni' },
  { id: 'emp_21', plan: { p_northwind: 22, p_admin: 12 }, approver: 'Sanjay Kulkarni' },
  { id: 'emp_12', plan: { p_northwind: 24, p_admin: 12 }, sat: 4, approver: 'Sanjay Kulkarni' },
  { id: 'emp_13', plan: { p_northwind: 28, p_admin: 8 }, sat: 4, approver: 'Sanjay Kulkarni' },
  { id: 'emp_15', plan: { p_northwind: 34 }, sat: 4, approver: 'Sanjay Kulkarni' },
];

export const FIRST_WEEK = '2026-10-12';
export const SEED_WEEKS = [FIRST_WEEK, addDays(FIRST_WEEK, 7), addDays(FIRST_WEEK, 14), addDays(FIRST_WEEK, 21)];
const EMP_NAME: Record<string, string> = { emp_5: 'Divya Menon', emp_17: 'Harish Reddy', emp_10: 'Vikram Joshi', emp_11: 'Anita Desai', emp_21: 'Meenal Shah', emp_12: 'Manoj Patil', emp_13: 'Santosh Gaikwad', emp_15: 'Dinesh Kamble' };

export function makeTimesheetSeed(): TimesheetState {
  const rng = makeRng(31337);
  const sheets: Sheet[] = [];
  for (const person of PLAN) {
    SEED_WEEKS.forEach((weekStart, wi) => {
      const dates = weekDates(weekStart);
      const lines: SheetLine[] = Object.entries(person.plan).map(([projectId, weekly]) => {
        const line = emptyLine(projectId);
        for (let d = 0; d < 5; d++) {
          if (dates[d]! > PREVIEW_TODAY) continue;
          const wobble = (rng() - 0.5) * 2;
          line.hours[d] = Math.max(0, Math.round((weekly / 5 + wobble) * 2) / 2);
        }
        return line;
      });
      if (person.sat && dates[5]! <= PREVIEW_TODAY && rng() < 0.7) lines[0]!.hours[5] = person.sat;
      const sheet: Sheet = { id: sheetId(person.id, weekStart), employeeId: person.id, weekStart, lines, status: 'draft', trail: [] };

      // Every week but the current one has gone to the approver.
      if (wi < 3) {
        const submittedOn = addDays(weekStart, 7);
        sheet.status = 'approved';
        sheet.submittedOn = submittedOn;
        sheet.decidedOn = addDays(weekStart, 8);
        sheet.decidedBy = person.approver;
        sheet.trail = [
          { at: submittedOn, by: EMP_NAME[person.id]!, action: 'Submitted' },
          { at: sheet.decidedOn, by: person.approver, action: 'Approved' },
        ];
      }
      sheets.push(sheet);
    });
  }

  const find = (emp: string, wi: number) => sheets.find((s) => s.id === sheetId(emp, SEED_WEEKS[wi]!))!;
  // Harish worked a long week at the end of October: over the 48 hour cap, waiting for approval.
  {
    const s = find('emp_17', 2);
    s.lines[0]!.hours = [9, 9, 9, 8, 8, 4, 0];
    s.lines[1]!.hours = [1, 1, 1, 1, 1, 0, 0];
    s.lines[2]!.hours = [0, 0, 0, 0, 0, 0, 0];
    s.status = 'submitted'; s.submittedOn = '2026-11-02'; s.decidedOn = undefined; s.decidedBy = undefined;
    s.trail = [{ at: '2026-11-02', by: 'Harish Reddy', action: 'Submitted' }];
  }
  // Vikram's week is submitted and waiting.
  {
    const s = find('emp_10', 2);
    s.status = 'submitted'; s.submittedOn = '2026-11-03'; s.decidedOn = undefined; s.decidedBy = undefined;
    s.trail = [{ at: '2026-11-03', by: 'Vikram Joshi', action: 'Submitted' }];
  }
  // Meenal's week came back with a comment.
  {
    const s = find('emp_21', 2);
    s.lines[0]!.hours = [8, 8, 8, 6, 6, 0, 0];
    s.lines[1]!.hours = [0, 0, 0, 2, 2, 0, 0];
    s.status = 'returned'; s.submittedOn = '2026-11-02'; s.decidedOn = '2026-11-03'; s.decidedBy = 'Sanjay Kulkarni';
    s.comment = 'Please split Wednesday: about two hours were induction for the new joiner, not Northwind work.';
    s.trail = [
      { at: '2026-11-02', by: 'Meenal Shah', action: 'Submitted' },
      { at: '2026-11-03', by: 'Sanjay Kulkarni', action: 'Returned', comment: s.comment },
    ];
  }
  // Keep the totals of every other week sensible (nobody over the cap by accident).
  for (const s of sheets) if (s.status === 'approved' && sheetTotal(s) > 48) s.lines[0]!.hours = s.lines[0]!.hours.map((h) => Math.min(h, 8));

  return {
    policy: { maxPerDay: 16, weeklyCap: 48, standardWeek: 40 },
    projects: structuredClone(PROJECTS),
    trackedIds: PLAN.map((p) => p.id),
    sheets,
    log: [],
  };
}
