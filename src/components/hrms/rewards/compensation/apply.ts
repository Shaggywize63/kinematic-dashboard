// Issue increment: the one place the Compensation page writes to the core database. It does exactly two things and logs them:
// updateEmployee(id, { annualCtc }) and issueLetter(...) with the existing increment template, merged by the Lifecycle letter code
// (read only here). A person confirms in the UI first, and the store refuses a second increment for the same person and cycle.
//
// In live mode the core writes go through the core live store (queued server calls), and the increment is recorded on the
// compensation cycle (POST /compensation/cycle/applied/:id with the letter's id) only after both reached the server. The steps
// run one at a time — letter, then CTC, then the cycle record — and each finished step is remembered (in memory) per person,
// so "Issue increment" after a failure repeats only the missing steps. That matters for pay: once the CTC has moved, working
// the increment out again from the new CTC would raise it twice.

import { getDb } from '../../../../lib/hrms/db';
import { issueLetter, updateEmployee } from '../../../../lib/hrms/actions';
import { getStatus, isLive, settle } from '../../../../lib/hrms/live/store';
import { fullName } from '../../../../lib/hrms/format';
import type { Id } from '../../../../lib/hrms/types';
import { baseCtcFor, cycleMembership, newCtc } from '../../../../lib/hrms/rewards/engines';
import { recordIncrementApplied, rewardsStore, type Result } from '../../../../lib/hrms/rewards/store';
import { analyse, ensureLetterTemplates, issueBlockers, mergeValues } from '../../lifecycle/letters';

/** Live mode: the steps already done for a person whose last attempt stopped part-way. Cleared once the cycle records it. */
interface PendingIncrement { from: number; to: number; letterId?: Id; ctcSaved?: boolean }
const pending = new Map<Id, PendingIncrement>();

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
  const pend = pending.get(employeeId);
  const before = pend?.from ?? baseCtcFor(emp, cycle);
  const after = pend?.to ?? (p ? newCtc(before, p.pct) : before);
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
export async function applyIncrement(employeeId: Id): Promise<Result<{ letterId: Id; before: number; after: number }>> {
  const pv = previewIncrement(employeeId);
  if ('error' in pv) return { ok: false, error: pv.error };
  if (pv.blockers.length) return { ok: false, error: pv.blockers[0]! };
  const tpl = getDb().letterTemplates.find((t) => t.type === 'increment')!;

  if (!isLive()) {
    // Sample mode: every write is local and immediate.
    updateEmployee(employeeId, { annualCtc: pv.after });
    const letter = issueLetter({ employeeId, templateId: tpl.id, type: 'increment', body: pv.letterText });
    const rec = await recordIncrementApplied(employeeId, { from: pv.before, to: pv.after, letterId: letter.id });
    if (!rec.ok) return rec;
    return { ok: true, letterId: letter.id, before: pv.before, after: pv.after };
  }

  if (getStatus().lifecyclePhase !== 'ok') {
    return { ok: false, error: 'Letters have not loaded from the server, so the increment letter cannot be issued. Nothing was changed.' };
  }
  const step: PendingIncrement = pending.get(employeeId) ?? { from: pv.before, to: pv.after };
  const retry = 'Issue increment again to finish: only the missing step is repeated.';

  // 1. The letter. A failed write is undone by the live store, so the letter is still there only if the server took it.
  if (!step.letterId) {
    const letter = issueLetter({ employeeId, templateId: tpl.id, type: 'increment', body: pv.letterText });
    await settle();
    if (!getDb().letters.some((l) => l.id === letter.id)) {
      return { ok: false, error: step.ctcSaved ? `The increment letter could not be saved on the server. ${retry}` : 'The increment letter could not be saved on the server, so nothing was changed.' };
    }
    step.letterId = letter.id;
    pending.set(employeeId, step);
  }

  // 2. The new CTC on the core record (likewise undone if the server refused it).
  if (!step.ctcSaved) {
    updateEmployee(employeeId, { annualCtc: step.to });
    await settle();
    if (getDb().employees.find((e) => e.id === employeeId)?.annualCtc !== step.to) {
      return { ok: false, error: `The letter is issued, but the new CTC could not be saved on the server, so the increment was not recorded. ${retry}` };
    }
    step.ctcSaved = true;
  }

  // 3. The record on the cycle, atomic and once per person on the server.
  const rec = await recordIncrementApplied(employeeId, { from: step.from, to: step.to, letterId: step.letterId });
  if (!rec.ok) return { ok: false, error: `The new CTC and the letter are saved, but the cycle did not record the increment: ${rec.error} ${retry}` };
  pending.delete(employeeId);
  return { ok: true, letterId: step.letterId, before: step.from, after: step.to };
}
