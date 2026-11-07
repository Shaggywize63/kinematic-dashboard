// Letter templates: merge fields, default wording, rendering and the print document. Pure logic (plus one
// idempotent store call), kept apart from the screens so it can be reasoned about and tested on its own.

import type { Employee, HrmsDb, ISODate, LetterTemplate, LetterType } from '../../../lib/hrms/types';
import { getDb } from '../../../lib/hrms/db';
import { upsert } from '../../../lib/hrms/actions';
import { fmtDate, fullName, inr } from '../../../lib/hrms/format';
import { addMonthsToDate } from '../overview/insights';

export const LETTER_TYPES: { value: LetterType; label: string }[] = [
  { value: 'offer', label: 'Offer' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'increment', label: 'Increment' },
  { value: 'relieving', label: 'Relieving' },
  { value: 'experience', label: 'Experience' },
  { value: 'warning', label: 'Warning' },
];
export const letterTypeLabel = (t: LetterType): string => LETTER_TYPES.find((x) => x.value === t)?.label ?? t;

export const MERGE_FIELDS = [
  { key: 'employee_name', label: 'Employee name' },
  { key: 'employee_code', label: 'Employee code' },
  { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' },
  { key: 'location', label: 'Location' },
  { key: 'company', label: 'Company' },
  { key: 'ctc', label: 'Annual CTC' },
  { key: 'join_date', label: 'Join date' },
  { key: 'confirmation_date', label: 'Confirmation date' },
  { key: 'last_working_date', label: 'Last working date' },
  { key: 'effective_date', label: 'Effective date' },
  { key: 'probation_months', label: 'Probation (months)' },
  { key: 'notice_days', label: 'Notice (days)' },
  { key: 'signatory', label: 'Signatory' },
] as const;
export type MergeKey = (typeof MERGE_FIELDS)[number]['key'];
export type MergeValues = Record<MergeKey, string>;
const KEYS = new Set<string>(MERGE_FIELDS.map((f) => f.key));
export const fieldLabel = (k: string): string => MERGE_FIELDS.find((f) => f.key === k)?.label ?? k;

export const signatoryFor = (db: HrmsDb, e: Employee): string => {
  const s = db.entities.find((x) => x.id === e.entityId)?.signatory;
  return s ? `${s.name}, ${s.designation}` : '';
};

export interface MergeContext { effectiveDate: ISODate; signatory?: string }

/** Values for every merge field for one employee. Empty string means the data is missing. */
export function mergeValues(db: HrmsDb, e: Employee, ctx: MergeContext): { values: MergeValues; derived: MergeKey[] } {
  const derived: MergeKey[] = [];
  const exit = db.exits.find((x) => x.employeeId === e.id && x.stage !== 'closed') ?? db.exits.find((x) => x.employeeId === e.id);
  const lwd = e.lastWorkingDate ?? exit?.lastWorkingDate;
  let conf = e.confirmationDate;
  if (!conf && e.joinDate) { conf = addMonthsToDate(e.joinDate, e.probationMonths); derived.push('confirmation_date'); }
  const values: MergeValues = {
    employee_name: fullName(e),
    employee_code: e.code,
    designation: db.designations.find((d) => d.id === e.designationId)?.name ?? '',
    department: db.departments.find((d) => d.id === e.departmentId)?.name ?? '',
    location: db.locations.find((l) => l.id === e.locationId)?.name ?? '',
    company: db.entities.find((x) => x.id === e.entityId)?.name ?? '',
    ctc: e.annualCtc ? inr(e.annualCtc) : '',
    join_date: e.joinDate ? fmtDate(e.joinDate) : '',
    confirmation_date: conf ? fmtDate(conf) : '',
    last_working_date: lwd ? fmtDate(lwd) : '',
    effective_date: ctx.effectiveDate ? fmtDate(ctx.effectiveDate) : '',
    probation_months: String(e.probationMonths ?? ''),
    notice_days: String(e.noticeDays ?? ''),
    signatory: ctx.signatory ?? signatoryFor(db, e),
  };
  return { values, derived };
}

// ───────────────────────────── rendering ─────────────────────────────
export interface Segment { kind: 'text' | 'value' | 'missing' | 'unknown' | 'placeholder'; text: string; key?: string }
export interface Analysis {
  segments: Segment[];
  text: string;                  // the letter as it will be issued
  usedKeys: MergeKey[];          // merge fields the body uses, in order of first use
  missing: MergeKey[];           // used fields with no data
  unknown: string[];             // {{fields}} that do not exist
  placeholders: string[];        // [BRACKETED CAPITALS] the author must replace by hand
}

const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}|\[[A-Z][A-Z0-9 ,.'/-]{3,}\]/g;

export function analyse(body: string, values: MergeValues): Analysis {
  const segments: Segment[] = [];
  const usedKeys: MergeKey[] = [];
  const missing: MergeKey[] = [];
  const unknown: string[] = [];
  const placeholders: string[] = [];
  let out = '';
  let last = 0;
  const push = (s: Segment) => { segments.push(s); if (s.kind === 'value' || s.kind === 'text' || s.kind === 'placeholder') out += s.text; };
  for (const m of body.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) push({ kind: 'text', text: body.slice(last, at) });
    last = at + m[0].length;
    const key = m[1];
    if (key === undefined) {                       // [BRACKETED PLACEHOLDER]
      placeholders.push(m[0]);
      push({ kind: 'placeholder', text: m[0] });
    } else if (!KEYS.has(key)) {
      if (!unknown.includes(key)) unknown.push(key);
      segments.push({ kind: 'unknown', text: m[0], key });
    } else {
      const k = key as MergeKey;
      if (!usedKeys.includes(k)) usedKeys.push(k);
      if (!values[k]) {
        if (!missing.includes(k)) missing.push(k);
        segments.push({ kind: 'missing', text: m[0], key });
      } else push({ kind: 'value', text: values[k], key });
    }
  }
  if (last < body.length) push({ kind: 'text', text: body.slice(last) });
  return { segments, text: out, usedKeys, missing, unknown, placeholders };
}

/** Everything that stops a letter from being issued, as plain sentences. */
export function issueBlockers(a: Analysis): string[] {
  const out: string[] = [];
  if (a.unknown.length) out.push(`Unknown merge field${a.unknown.length > 1 ? 's' : ''}: ${a.unknown.map((k) => `{{${k}}}`).join(', ')}. Fix the template.`);
  if (a.missing.length) out.push(`No data for ${a.missing.map(fieldLabel).join(', ')}. Add it on the employee profile or the exit case.`);
  if (a.placeholders.length) out.push(`Replace the bracketed text before issuing: ${a.placeholders.join(', ')}.`);
  return out;
}

// ───────────────────────────── printing and download ─────────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface LetterDoc { company: string; address?: string; issuedOn: ISODate; body: string; title: string }

/** Plain-text version for the download: letterhead lines, then the body. */
export function letterText(d: LetterDoc): string {
  return [d.company, d.address ?? '', `Date: ${fmtDate(d.issuedOn)}`, '', d.body].filter((x, i) => i !== 1 || x).join('\n');
}

/** A self-contained HTML page for printing. Paper colours are fixed on purpose: a letter prints black on white. */
export function letterHtml(d: LetterDoc): string {
  const paras = d.body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>
@page { margin: 22mm 20mm; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.55; color: #111; margin: 0; }
.head { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 18px; }
.co { font-size: 16pt; font-weight: 700; } .ad { font-size: 10pt; color: #444; }
.dt { text-align: right; margin-bottom: 18px; } p { margin: 0 0 12px; }
</style></head><body><div class="head"><div class="co">${esc(d.company)}</div>${d.address ? `<div class="ad">${esc(d.address)}</div>` : ''}</div>
<div class="dt">Date: ${esc(fmtDate(d.issuedOn))}</div>${paras}</body></html>`;
}

/** Prints a letter alone (not the dashboard around it) through a hidden iframe, which popup blockers leave alone. */
export function printLetter(d: LetterDoc): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-testid', 'letter-print-frame');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!w || !doc) { frame.remove(); return; }
  doc.open(); doc.write(letterHtml(d)); doc.close();
  w.addEventListener('afterprint', () => frame.remove());
  setTimeout(() => { w.focus(); w.print(); }, 50);
  setTimeout(() => frame.remove(), 120_000); // safety net if afterprint never fires
}

// ───────────────────────────── default wording ─────────────────────────────
export const DEFAULT_TEMPLATES: Record<LetterType, { name: string; body: string }> = {
  offer: { name: 'Offer letter', body: 'Dear {{employee_name}},\n\nWe are pleased to offer you the position of {{designation}} at {{company}}, with an annual cost to company of {{ctc}}. Your proposed date of joining is {{join_date}}.\n\nThis offer is subject to verification of your documents and references.\n\nSincerely,\n{{signatory}}' },
  appointment: { name: 'Appointment letter', body: 'Dear {{employee_name}},\n\nFurther to your acceptance, you are appointed as {{designation}} in the {{department}} department at {{location}} with effect from {{join_date}}.\n\nYour annual CTC is {{ctc}}, as set out in the annexure. Your probation is {{probation_months}} months and the notice period is {{notice_days}} days.\n\nThis letter is issued under the Occupational Safety, Health and Working Conditions Code.\n\nSincerely,\n{{signatory}}' },
  confirmation: { name: 'Confirmation letter', body: 'Dear {{employee_name}},\n\nWe are happy to confirm your employment as {{designation}} with effect from {{confirmation_date}}, on successful completion of your probation.\n\nSincerely,\n{{signatory}}' },
  increment: { name: 'Increment letter', body: 'Dear {{employee_name}},\n\nIn recognition of your contribution, your annual CTC is revised to {{ctc}} with effect from {{effective_date}}.\n\nSincerely,\n{{signatory}}' },
  relieving: { name: 'Relieving letter', body: 'To whom it may concern,\n\n{{employee_name}} ({{employee_code}}) worked with {{company}} as {{designation}} from {{join_date}} to {{last_working_date}} and has been relieved of all duties. Their full and final settlement has been completed.\n\nSincerely,\n{{signatory}}' },
  experience: { name: 'Experience letter', body: 'To whom it may concern,\n\nThis is to certify that {{employee_name}} was employed with {{company}} as {{designation}} from {{join_date}} to {{last_working_date}}.\n\nSincerely,\n{{signatory}}' },
  warning: { name: 'Warning letter', body: 'Dear {{employee_name}},\n\nThis letter is a formal warning to you as {{designation}} in the {{department}} department, issued on {{effective_date}}.\n\n[DESCRIBE THE INCIDENT, THE DATE AND THE POLICY BREACHED]\n\nYou are required to correct this conduct immediately. A repeat may lead to further disciplinary action under company policy.\n\nSincerely,\n{{signatory}}' },
};

/** Every LetterType gets a template. Adds only the missing ones (through upsert) and is safe to call repeatedly. */
export function ensureLetterTemplates(): number {
  const have = new Set(getDb().letterTemplates.map((t) => t.type));
  let added = 0;
  for (const { value } of LETTER_TYPES) {
    if (have.has(value)) continue;
    const t: LetterTemplate = { id: `lt_${value}`, type: value, ...DEFAULT_TEMPLATES[value] };
    upsert('letterTemplates', t);
    added += 1;
  }
  return added;
}
