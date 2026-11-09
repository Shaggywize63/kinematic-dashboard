// Issue increment: the one place the Compensation page writes to the core database. It does exactly two things and logs them:
// updateEmployee(id, { annualCtc }) and issueLetter(...) with the existing increment template, merged by the Lifecycle letter code
// (read only here). A person confirms in the UI first, and the store refuses a second increment for the same person and cycle.

import { getDb } from '../../../../lib/hrms/db';
import { issueLetter, updateEmployee } from '../../../../lib/hrms/actions';
import { fullName } from '../../../../lib/hrms/format';
import type { Id } from '../../../../lib/hrms/types';
import { baseCtcFor, cycleMembership, newCtc } from '../../../../lib/hrms/rewards/engines';
import { recordIncrementApplied, rewardsStore, type Result } from '../../../../lib/hrms/rewards/store';
import { analyse, ensureLetterTemplates, issueBlockers, mergeValues } from '../../lifecycle/letters';

export interface IncrementPreview { employeeId: Id; name: string; before: number; after: number; pct: number; effectiveOn: string; letterText: string; blockers: string[] }

/** What applying would do, without doing it. `blockers` explains anything that stops it. */
export function previewIncrement(employeeId: Id): IncrementPreview | { error: string } {
  const st = rewardsStore.get();
  const db = getDb();
  const cycle = st.comp.cycle;
  const emp = db.employees.find((e) => e.id === employeeId);
  if (!emp) return { error: 'That employee no longer exists.' };
  const blockers: string[] = [];
  if (cycle.status !== 'approved') blockers.push('HR has not approved the cycle yet.');
  if (cycle.applied[employeeId]) blockers.push('An increment was already issued to this person in this cycle.');
  const member = cycleMembership(db, cycle).find((m) => m.employee.id === employeeId);
  if (!member?.included) blockers.push(`Not in this cycle${member?.reason ? `: ${member.reason.toLowerCase()}` : ''}.`);
  const p = cycle.proposals[employeeId];
  if (!p || p.pct <= 0) blockers.push('There is no increment proposed for this person.');
  const before = baseCtcFor(emp, cycle);
  const after = p ? newCtc(before, p.pct) : before;
  if (p && after <= before) blockers.push('The proposed percent is too small to change the CTC.');

  let letterText = '';
  if (!blockers.length) {
    if (!db.letterTemplates.some((t) => t.type === 'increment')) ensureLetterTemplates();
    const tpl = getDb().letterTemplates.find((t) => t.type === 'increment');
    if (!tpl) blockers.push('There is no increment letter template.');
    else {
      const { values } = mergeValues(getDb(), { ...emp, annualCtc: after }, { effectiveDate: cycle.effectiveOn });
      const analysis = analyse(tpl.body, values);
      letterText = analysis.text;
      blockers.push(...issueBlockers(analysis));
    }
  }
  return { employeeId, name: fullName(emp), before, after, pct: p?.pct ?? 0, effectiveOn: cycle.effectiveOn, letterText, blockers };
}

/** Applies one approved increment: new CTC on the core employee, an increment letter in the register, and a record in this cycle. */
export function applyIncrement(employeeId: Id): Result<{ letterId: Id; before: number; after: number }> {
  const pv = previewIncrement(employeeId);
  if ('error' in pv) return { ok: false, error: pv.error };
  if (pv.blockers.length) return { ok: false, error: pv.blockers[0]! };
  const tpl = getDb().letterTemplates.find((t) => t.type === 'increment')!;
  updateEmployee(employeeId, { annualCtc: pv.after });
  const letter = issueLetter({ employeeId, templateId: tpl.id, type: 'increment', body: pv.letterText });
  const rec = recordIncrementApplied(employeeId, { from: pv.before, to: pv.after, letterId: letter.id });
  if (!rec.ok) return rec;
  return { ok: true, letterId: letter.id, before: pv.before, after: pv.after };
}
