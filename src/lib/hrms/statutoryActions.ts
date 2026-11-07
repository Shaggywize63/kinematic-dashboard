'use client';
// Actions for the Statutory, Reports and Privacy pages. Kept out of actions.ts on purpose (that file belongs to the
// shared layer). Everything goes through mutate() so subscribers re-render and the change is persisted.

import { mutate } from './db';
import { markFiled, upsert } from './actions';
import { PREVIEW_TODAY } from './seed';
import { uid } from './types';
import type { ComplianceTask, Id, ISODate, RetentionRule } from './types';

/**
 * Mark a compliance task as filed. markFiled() in actions.ts stamps the real clock, which would put "filed on" in
 * the real today instead of the preview's today, so the filing date is set explicitly afterwards.
 */
export function fileCompliance(id: Id, reference: string, filedOn: ISODate = PREVIEW_TODAY): void {
  markFiled(id, reference);
  mutate((db) => {
    const t = db.compliance.find((x) => x.id === id);
    if (t) t.filedOn = filedOn;
  });
}

/** Undo a filing recorded by mistake. The calendar derives the real status from the due date again. */
export function reopenCompliance(id: Id): void {
  mutate((db) => {
    const t = db.compliance.find((x) => x.id === id);
    if (!t) return;
    t.status = 'upcoming';
    t.filedOn = undefined;
    t.reference = undefined;
  });
}

/** Add a due date (from the suggested list) to the calendar. */
export function addComplianceTask(task: Omit<ComplianceTask, 'id' | 'status'>): ComplianceTask {
  const item: ComplianceTask = { ...task, id: uid('cmp'), status: 'upcoming' };
  upsert('compliance', item);
  return item;
}

/** Withdraw a consent. The record stays in the ledger with a withdrawn date: the ledger is evidence, not a setting. */
export function withdrawConsent(id: Id): void {
  mutate((db) => {
    const c = db.consents.find((x) => x.id === id);
    if (!c || c.withdrawnAt) return;
    c.withdrawnAt = `${PREVIEW_TODAY}T${new Date().toISOString().slice(11)}`;
  });
}

export function updateRetentionRule(id: Id, patch: Pick<RetentionRule, 'keepYears' | 'action'>): void {
  mutate((db) => {
    const r = db.retention.find((x) => x.id === id);
    if (!r) return;
    r.keepYears = patch.keepYears;
    r.action = patch.action;
  });
}
