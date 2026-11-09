'use client';
// Stores and actions for the assistant, policies and org chart pages. The sample data and every change people make live
// here (browser storage in the preview). Components read `.use()` and change data only through the actions below, so the
// later swap to API calls touches this file. The org chart's manager change goes to the core employee record.

import { createAreaStore } from '../areaStore';
import { getDb } from '../db';
import { ACTOR, logAccess, updateEmployee } from '../actions';
import { makeSeed, PREVIEW_TODAY } from '../seed';
import { uid } from '../types';
import type { HrmsDb, Id, ISODate } from '../types';
import { ask } from './engine';
import { currentVersion, audienceOf, nextCaseId, withNewVersion, type PublishDraft } from './policies';
import { canReportTo } from './orgChart';
import { seedAcks, seedLeaveRequests, seedMcpLog, seedPolicies, seedPosh, seedVacancies } from './seed';
import type {
  AssistState, ChatMessage, EngineResult, LeaveDraft, McpLogEntry, OrgPrefs, OrgState, PolicyState, PoshNature, StoredResult, Who, Vacancy,
} from './types';

const nowIso = () => new Date().toISOString();

// ───────────────────────────── assistant ─────────────────────────────
/** The three people the preview lets you chat as. Their roles are fixed here; the preview has no sign-in. */
export const PERSONAS: { employeeId: Id; role: Who['role']; label: string }[] = [
  { employeeId: 'emp_7', role: 'employee', label: 'Pooja Verma (employee)' },
  { employeeId: 'emp_4', role: 'manager', label: 'Rohit Chauhan (manager)' },
  { employeeId: 'emp_18', role: 'hr', label: 'Tanvi Kapoor (HR)' },
];
export const personaWho = (employeeId: Id): Who => {
  const p = PERSONAS.find((x) => x.employeeId === employeeId) ?? PERSONAS[0]!;
  return { employeeId: p.employeeId, role: p.role };
};

export function toStored(r: EngineResult): StoredResult {
  return { intent: r.intent, outcome: r.outcome, usedData: r.usedData, records: r.usedData.length, refused: r.refused, actions: r.actions, suggestions: r.suggestions, slots: r.slots };
}

function seedAssist(): AssistState {
  const db = makeSeed();
  const leaveRequests = seedLeaveRequests();
  const starters: { id: Id; text: string; at: string }[] = [
    { id: 'emp_7', text: 'Mera leave balance kitna hai?', at: '2026-11-06T09:02:00.000Z' },
    { id: 'emp_4', text: 'Who is on leave in my team?', at: '2026-11-06T09:05:00.000Z' },
    { id: 'emp_18', text: 'Pooja ka leave balance kitna hai?', at: '2026-11-06T09:08:00.000Z' },
  ];
  const conversations: AssistState['conversations'] = {};
  for (const s of starters) {
    const who = personaWho(s.id);
    const hello = ask(db, who, 'hi', { leaveRequests });
    const r = ask(db, who, s.text, { leaveRequests });
    conversations[s.id] = [
      { id: `m_${s.id}_1`, from: 'system', text: 'Simulation. This assistant uses fixed rules, not an AI model, and sends nothing to WhatsApp.', at: '2026-11-06T09:00:00.000Z' },
      { id: `m_${s.id}_2`, from: 'bot', text: hello.answer, at: '2026-11-06T09:00:05.000Z', result: toStored(hello) },
      { id: `m_${s.id}_3`, from: 'user', text: s.text, at: s.at },
      { id: `m_${s.id}_4`, from: 'bot', text: r.answer, at: s.at.replace(':00.000Z', ':03.000Z'), result: toStored(r) },
    ];
  }
  return { version: 1, persona: 'emp_7', conversations, leaveRequests, mcpLog: seedMcpLog(), lastVoice: null };
}
export const assistStore = createAreaStore<AssistState>('assist', 1, seedAssist);

const chat = (personaId: Id): ChatMessage[] => {
  const d = assistStore.get();
  return d.conversations[personaId] ?? [];
};

export function setPersona(employeeId: Id): void { assistStore.mutate((d) => { d.persona = employeeId; }); }
export function addChatMessage(personaId: Id, m: Omit<ChatMessage, 'id' | 'at'> & { at?: string }): ChatMessage {
  const msg: ChatMessage = { ...m, id: uid('m'), at: m.at ?? nowIso() };
  assistStore.mutate((d) => { (d.conversations[personaId] ??= []).push(msg); });
  return msg;
}
export function clearChat(personaId: Id): void { assistStore.mutate((d) => { d.conversations[personaId] = []; }); }
export function lastBotResult(personaId: Id): StoredResult | undefined {
  return [...chat(personaId)].reverse().find((m) => m.from === 'bot')?.result;
}

function setActionState(d: AssistState, personaId: Id, messageId: Id, state: 'done' | 'dismissed') {
  const m = d.conversations[personaId]?.find((x) => x.id === messageId);
  if (m?.result) m.result.actionState = state;
}
export function dismissAction(personaId: Id, messageId: Id): void { assistStore.mutate((d) => setActionState(d, personaId, messageId, 'dismissed')); }
export function markActionDone(personaId: Id, messageId: Id): void { assistStore.mutate((d) => setActionState(d, personaId, messageId, 'done')); }

/** Record the leave request in the assistant's own store. Core leave balances are not touched. */
export function confirmLeave(personaId: Id, messageId: Id, draft: LeaveDraft, via: 'whatsapp' | 'voice' | 'mcp' = 'whatsapp'): string {
  const id = uid('lr');
  assistStore.mutate((d) => {
    d.leaveRequests.push({ id, employeeId: draft.employeeId, leaveTypeId: draft.leaveTypeId, leaveCode: draft.leaveCode, from: draft.from, to: draft.to, days: draft.days, half: draft.half, reason: draft.reason, status: 'pending', createdAt: nowIso(), via });
    setActionState(d, personaId, messageId, 'done');
  });
  return id;
}
export function cancelLeaveRequest(id: Id): void { assistStore.mutate((d) => { const r = d.leaveRequests.find((x) => x.id === id); if (r) r.status = 'cancelled'; }); }

export function logMcpCall(e: Omit<McpLogEntry, 'id' | 'at'>): void {
  assistStore.mutate((d) => { d.mcpLog.unshift({ ...e, id: uid('mcp'), at: nowIso() }); d.mcpLog = d.mcpLog.slice(0, 60); });
}
export function setLastVoice(lang: string, idx: number): void { assistStore.mutate((d) => { d.lastVoice = { lang, idx }; }); }

/** Shows pay data about someone else: write the access to the core access log, as the privacy module does. */
export function logSensitiveRead(employeeId: Id, field: string): void {
  logAccess(employeeId, field, 'Asked in the HR assistant (preview)');
}

// ───────────────────────────── policies ─────────────────────────────
function seedPolicyState(): PolicyState {
  const policies = seedPolicies();
  const acks = seedAcks(policies, makeSeed().employees);
  // A few reminders already sent for the travel policy, to people who have not acknowledged the new version.
  const travel = policies.find((p) => p.id === 'pol_travel')!;
  const cur = currentVersion(travel).version;
  const pending = makeSeed().employees.filter((e) => e.status === 'active' || e.status === 'on_notice').map((e) => e.id).filter((id) => !acks.some((a) => a.policyId === 'pol_travel' && a.version === cur && a.employeeId === id));
  const reminders = pending.slice(0, 3).map((employeeId, i) => ({ id: `rem_seed_${i}`, policyId: 'pol_travel', version: cur, employeeId, at: `2026-11-0${3 + i}T10:00:00.000Z`, by: 'Tanvi Kapoor' }));
  return { version: 1, policies, acks, reminders, posh: seedPosh(), log: [{ at: '2026-10-14T09:00:00.000Z', by: 'Neha Bansal', action: 'Published Travel & expense v2.1' }] };
}
export const policyStore = createAreaStore<PolicyState>('policies', 1, seedPolicyState);

const plog = (d: { log: { at: string; by: string; action: string }[] }, action: string) => { d.log.unshift({ at: nowIso(), by: ACTOR, action }); d.log = d.log.slice(0, 80); };

/** Publish a new version. Everyone it applies to has to acknowledge it again (when it asks for acknowledgement). */
export function publishPolicy(policyId: Id, draft: PublishDraft, db: HrmsDb): { version: string; reset: number } {
  let out = { version: '', reset: 0 };
  policyStore.mutate((d) => {
    const i = d.policies.findIndex((p) => p.id === policyId);
    if (i < 0) return;
    const before = d.policies[i]!;
    const next = withNewVersion(before, draft, ACTOR, PREVIEW_TODAY);
    const reset = draft.requiresAck ? audienceOf(db, next).length : 0;
    d.policies[i] = next;
    out = { version: currentVersion(next).version, reset };
    plog(d, `Published ${before.title} v${out.version}${draft.requiresAck ? `, acknowledgement reset for ${reset} people` : ', no acknowledgement needed'}`);
  });
  return out;
}
export function acknowledge(policyId: Id, employeeId: Id): void {
  policyStore.mutate((d) => {
    const p = d.policies.find((x) => x.id === policyId);
    if (!p) return;
    const v = currentVersion(p).version;
    if (d.acks.some((a) => a.policyId === policyId && a.version === v && a.employeeId === employeeId)) return;
    d.acks.push({ policyId, version: v, employeeId, at: PREVIEW_TODAY });
    plog(d, `Recorded acknowledgement of ${p.title} v${v} (preview stand-in for the employee)`);
  });
}
/** Log a reminder. Nothing is sent: the preview has no email or WhatsApp. */
export function sendReminders(policyId: Id, employeeIds: Id[]): number {
  let n = 0;
  policyStore.mutate((d) => {
    const p = d.policies.find((x) => x.id === policyId);
    if (!p) return;
    const v = currentVersion(p).version;
    for (const employeeId of employeeIds) { d.reminders.push({ id: uid('rem'), policyId, version: v, employeeId, at: nowIso(), by: ACTOR }); n += 1; }
    if (n) plog(d, `Logged ${n} reminder${n === 1 ? '' : 's'} for ${p.title} v${v} (not sent)`);
  });
  return n;
}
export function logPoshCase(nature: PoshNature, receivedOn: ISODate): string {
  let id = '';
  policyStore.mutate((d) => {
    id = nextCaseId(d.posh.cases, Number(receivedOn.slice(0, 4)));
    d.posh.cases.push({ id, receivedOn, nature, status: 'received' });
    plog(d, `Logged ${id} in the register (category only)`);
  });
  return id;
}
const NEXT_STATUS = { received: 'inquiry', inquiry: 'report_submitted', report_submitted: 'closed' } as const;
export function advancePoshCase(id: string, outcome: 'action_taken' | 'no_action' = 'no_action'): void {
  policyStore.mutate((d) => {
    const c = d.posh.cases.find((x) => x.id === id);
    if (!c || c.status === 'closed') return;
    c.status = NEXT_STATUS[c.status];
    if (c.status === 'closed') { c.closedOn = PREVIEW_TODAY; c.outcome = outcome; }
    plog(d, `Moved ${id} to ${c.status.replace('_', ' ')}`);
  });
}
export function addPoshSession(s: { date: ISODate; title: string; mode: 'in_person' | 'online'; attendees: Id[] }): void {
  policyStore.mutate((d) => {
    d.posh.sessions.push({ id: uid('ps'), ...s });
    plog(d, `Recorded awareness session "${s.title}" with ${s.attendees.length} people`);
  });
}

// ───────────────────────────── org chart ─────────────────────────────
const DEFAULT_PREFS: OrgPrefs = { collapsed: [], showExited: false, view: 'chart', groupBy: 'department' };
export const orgStore = createAreaStore<OrgState>('orgchart', 1, () => ({ version: 1, vacancies: seedVacancies(), prefs: { ...DEFAULT_PREFS }, log: [] }));
const olog = (d: OrgState, action: string) => { d.log.unshift({ at: nowIso(), by: ACTOR, action }); d.log = d.log.slice(0, 60); };

export function setOrgPrefs(patch: Partial<OrgPrefs>): void { orgStore.mutate((d) => { d.prefs = { ...d.prefs, ...patch }; }); }
export function addVacancy(v: Omit<Vacancy, 'id'>): void { orgStore.mutate((d) => { d.vacancies.push({ ...v, id: uid('vac') }); olog(d, `Added open role ${v.title}`); }); }
export function removeVacancy(id: Id): void { orgStore.mutate((d) => { const v = d.vacancies.find((x) => x.id === id); d.vacancies = d.vacancies.filter((x) => x.id !== id); if (v) olog(d, `Removed open role ${v.title}`); }); }

/**
 * Change who someone reports to. Checks for a loop again (never trust the screen), then writes the core employee record
 * through updateEmployee(), so the Employees page shows it and the person's change log records it.
 */
export function changeManager(employeeId: Id, newManagerId: Id | undefined): { ok: boolean; reason?: string } {
  const db = getDb();
  const check = canReportTo(db.employees, employeeId, newManagerId);
  if (!check.ok) return check;
  updateEmployee(employeeId, { reportingToId: newManagerId });
  orgStore.mutate((d) => olog(d, `Changed reporting line for ${employeeId} to ${newManagerId ?? 'none'}`));
  return { ok: true };
}

