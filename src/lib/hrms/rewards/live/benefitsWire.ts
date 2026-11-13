// The one place where the dashboard's Benefits shapes (camelCase, optional fields) meet the HRMS benefits API's
// (snake_case top-level keys, null for "nothing"; nested objects/arrays pass through in the dashboard's camelCase shape).
// Mirrors live/wire.ts and the phase-6 assetsWire.ts: nothing else in the app knows the wire names, dates are YYYY-MM-DD,
// and `undefined` is "none" on the way in.
//
// Phase 7: the Benefits slice of the Rewards store moves to the server — the plan catalogue, per-employee enrolments,
// insurance claims and their status trail, the enrolment window (+ extensions), reminders and the "sent to payroll" map.
// Compensation (the third Rewards slice) stays local, so only these shapes are mapped here.

import { arr, isObj, num, str, UUID_RE, type Row } from '../../live/wire';
import type { Id, ISODate, Month } from '../../types';
import type {
  BenefitsWindow, Claim, ClaimStatus, Dependant, DependantRules, Enrolment, Plan, PlanKind, PlanTier, Relation,
} from '../types';
import type { EnrolInput, NewClaimInput } from '../store';

export type { Row };

// ───────────────────────────── enum guards ─────────────────────────────
const PLAN_KINDS = new Set<PlanKind>(['health', 'accident', 'meal', 'nps', 'flex']);
const CLAIM_STATUSES = new Set<ClaimStatus>(['submitted', 'in_review', 'query', 'approved', 'settled', 'rejected']);
const RELATIONS = new Set<Relation>(['spouse', 'child', 'parent']);
const CLAIM_RELATIONS = new Set<Claim['relation']>(['self', 'spouse', 'child', 'parent']);
const CLAIM_KINDS = new Set<Claim['kind']>(['cashless', 'reimbursement']);

const asPlanKind = (v: unknown): PlanKind => (PLAN_KINDS.has(v as PlanKind) ? (v as PlanKind) : 'health');
const asClaimStatus = (v: unknown): ClaimStatus => (CLAIM_STATUSES.has(v as ClaimStatus) ? (v as ClaimStatus) : 'submitted');
const asRelation = (v: unknown): Relation => (RELATIONS.has(v as Relation) ? (v as Relation) : 'child');
const asClaimRelation = (v: unknown): Claim['relation'] => (CLAIM_RELATIONS.has(v as Claim['relation']) ? (v as Claim['relation']) : 'self');
const asClaimKind = (v: unknown): Claim['kind'] => (CLAIM_KINDS.has(v as Claim['kind']) ? (v as Claim['kind']) : 'cashless');

const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) { const n = num(x); if (n !== undefined) out[k] = n; }
  return out;
};

// ───────────────────────────── plans ─────────────────────────────
/** A plan, in the dashboard's shape. The tier, employer-share, dependant-rule and basket objects pass through as the
 * dashboard already shapes them (camelCase nested), as the wire contract says; only the top-level keys are snake_case. */
export function planFromWire(r: Row): Plan {
  const plan: Plan = {
    id: String(r.id ?? ''), kind: asPlanKind(r.kind), name: String(r.name ?? ''), summary: String(r.summary ?? ''),
    provider: String(r.provider ?? ''), auto: r.auto === true,
    tiers: arr(r.tiers).map((t) => ({ ...(t as unknown as PlanTier) })),
    employerSharePct: isObj(r.employer_share_pct) ? (r.employer_share_pct as Plan['employerSharePct']) : {},
    taxNote: String(r.tax_note ?? ''), coverStart: str(r.cover_start) ?? '', renewsOn: str(r.renews_on) ?? '',
  };
  if (isObj(r.dependants)) plan.dependants = r.dependants as unknown as DependantRules;
  const flexMonthly = num(r.flex_monthly); if (flexMonthly !== undefined) plan.flexMonthly = flexMonthly;
  if (Array.isArray(r.baskets)) plan.baskets = arr(r.baskets).map((b) => ({ id: String(b.id ?? ''), label: String(b.label ?? '') }));
  return plan;
}

// ───────────────────────────── enrolments ─────────────────────────────
const dependantFromWire = (d: Row): Dependant => ({ id: String(d.id ?? ''), name: String(d.name ?? ''), relation: asRelation(d.relation), dob: str(d.dob) ?? '' });

/** One person's enrolment, keyed by employee (the server's own row id is not kept — the dashboard upserts by employee). */
export function enrolmentFromWire(r: Row): Enrolment {
  const en: Enrolment = {
    employeeId: String(r.employee_id ?? ''), status: r.status === 'waived' ? 'waived' : 'enrolled',
    submittedOn: str(r.submitted_on) ?? '', by: String(r.by ?? ''),
    dependants: arr(r.dependants).map(dependantFromWire), flex: numMap(r.flex),
  };
  const healthTier = str(r.health_tier); if (healthTier) en.healthTier = healthTier;
  const mealTier = str(r.meal_tier); if (mealTier) en.mealTier = mealTier;
  const npsTier = str(r.nps_tier); if (npsTier) en.npsTier = npsTier;
  return en;
}

// ───────────────────────────── claims ─────────────────────────────
const trailFromWire = (t: Row): Claim['trail'][number] => {
  const entry: Claim['trail'][number] = { on: str(t.on) ?? '', status: asClaimStatus(t.status), by: String(t.by ?? '') };
  const note = str(t.note); if (note) entry.note = note;
  return entry;
};

export function claimFromWire(r: Row): Claim {
  const c: Claim = {
    id: String(r.id ?? ''), ref: String(r.ref ?? ''), employeeId: String(r.employee_id ?? ''), patient: String(r.patient ?? ''),
    relation: asClaimRelation(r.relation), kind: asClaimKind(r.kind), hospital: String(r.hospital ?? ''), claimed: num(r.claimed) ?? 0,
    filedOn: str(r.filed_on) ?? '', status: asClaimStatus(r.status), trail: arr(r.trail).map(trailFromWire),
  };
  const approved = num(r.approved); if (approved !== undefined) c.approved = approved;
  const closedOn = str(r.closed_on); if (closedOn) c.closedOn = closedOn;
  const rejectionReason = str(r.rejection_reason); if (rejectionReason) c.rejectionReason = rejectionReason;
  return c;
}

// ───────────────────────────── window, reminders, sent ─────────────────────────────
export function windowFromWire(r: Row): BenefitsWindow {
  return {
    opensOn: str(r.opens_on) ?? '', closesOn: str(r.closes_on) ?? '',
    extensions: arr(r.extensions).map((x) => ({ on: str(x.on) ?? '', days: num(x.days) ?? 0, reason: String(x.reason ?? ''), by: String(x.by ?? '') })),
  };
}

export const remindersFromWire = (v: unknown): Record<Id, ISODate> => {
  const out: Record<Id, ISODate> = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) { const d = str(x); if (d) out[k] = d; }
  return out;
};

export const sentFromWire = (v: unknown): Record<Month, { on: ISODate; rows: number; total: number; by: string }> => {
  const out: Record<Month, { on: ISODate; rows: number; total: number; by: string }> = {};
  if (isObj(v)) for (const [month, x] of Object.entries(v)) if (isObj(x)) out[month] = { on: str(x.on) ?? '', rows: num(x.rows) ?? 0, total: num(x.total) ?? 0, by: String(x.by ?? '') };
  return out;
};

// ───────────────────────────── bootstrap and command results ─────────────────────────────
export interface BenefitsBootstrap {
  plans: Plan[]; enrolments: Enrolment[]; claims: Claim[]; window: BenefitsWindow;
  reminders: Record<Id, ISODate>; sent: Record<Month, { on: ISODate; rows: number; total: number; by: string }>; serverTime?: string;
}
export function benefitsBootstrapFromWire(data: Row): BenefitsBootstrap {
  return {
    plans: arr(data.plans).map(planFromWire),
    enrolments: arr(data.enrolments).map(enrolmentFromWire),
    claims: arr(data.claims).map(claimFromWire),
    window: windowFromWire(isObj(data.window) ? data.window : {}),
    reminders: remindersFromWire(data.reminders),
    sent: sentFromWire(data.sent),
    serverTime: str(data.server_time),
  };
}

/** The answer to a window set/extend. The server echoes the config window; a wrapper key is tolerated. */
export const windowResultFromWire = (data: Row): BenefitsWindow => windowFromWire(isObj(data.window) ? data.window : data);
/** The answer to logging reminders: the config's reminders map (a wrapper key is tolerated). */
export const remindersResultFromWire = (data: Row): Record<Id, ISODate> => remindersFromWire(isObj(data.reminders) ? data.reminders : data);
/** The answer to a claim register/move: the updated claim. */
export const claimResultFromWire = (data: Row): Claim => claimFromWire(isObj(data.claim) ? data.claim : data);

export interface SendResult { removed: number; added: number; total: number }
export const sendResultFromWire = (data: Row): SendResult => ({ removed: num(data.removed) ?? 0, added: num(data.added) ?? 0, total: num(data.total) ?? 0 });

// ───────────────────────────── to the wire ─────────────────────────────
const trimOrNull = (s: string | undefined): string | null => { const t = (s ?? '').trim(); return t || null; };

/** Body for POST /benefits/plans. The whole plan in snake_case; nested objects/arrays pass through in the dashboard shape.
 * A client UUID makes the create idempotent, matching the other create endpoints. */
export function planCreateBody(plan: Plan, id?: string): Row {
  const body: Row = {
    kind: plan.kind, name: plan.name, summary: plan.summary, provider: plan.provider, auto: plan.auto,
    tiers: plan.tiers, employer_share_pct: plan.employerSharePct,
    dependants: plan.dependants ?? null, flex_monthly: plan.flexMonthly ?? null, baskets: plan.baskets ?? null,
    tax_note: plan.taxNote, cover_start: plan.coverStart, renews_on: plan.renewsOn,
  };
  const useId = id && UUID_RE.test(id) ? id : UUID_RE.test(plan.id) ? plan.id : undefined;
  if (useId) body.id = useId;
  return body;
}

/** Body for POST /benefits/enrolments (submitEnrolment). The server upserts by employee_id and re-checks eligibility
 * and the dependant rules. Cleared fields are sent as null so the clear is explicit. */
export function enrolmentBody(i: EnrolInput): Row {
  const enrolled = i.status === 'enrolled';
  return {
    employee_id: i.employeeId, status: i.status,
    health_tier: enrolled ? (i.healthTier ?? null) : null,
    dependants: enrolled ? i.dependants.map((d) => ({ id: d.id, name: d.name.trim(), relation: d.relation, dob: d.dob })) : [],
    meal_tier: enrolled ? (i.mealTier ?? null) : null,
    nps_tier: enrolled ? (i.npsTier ?? null) : null,
    flex: enrolled ? Object.fromEntries(Object.entries(i.flex).filter(([, v]) => v > 0)) : {},
  };
}

export const setWindowBody = (opensOn: ISODate, closesOn: ISODate): Row => ({ opens_on: opensOn, closes_on: closesOn });
export const extendWindowBody = (days: number, reason: string): Row => ({ days, reason: reason.trim() });
export const remindersBody = (ids: Id[]): Row => ({ employee_ids: ids });

/** Body for POST /benefits/claims (registerClaim). A client UUID makes the create idempotent. */
export function claimCreateBody(i: NewClaimInput, id?: string): Row {
  const body: Row = {
    employee_id: i.employeeId, patient: i.patient.trim() || 'Self', relation: i.relation, kind: i.kind,
    hospital: i.hospital.trim(), claimed: Math.round(i.claimed),
  };
  if (id && UUID_RE.test(id)) body.id = id;
  return body;
}

/** Body for POST /benefits/claims/:id/move (moveClaim). Only what the server needs; the id of the claim is in the path. */
export function moveClaimBody(to: ClaimStatus, o: { note?: string; approved?: number; reason?: string }): Row {
  const body: Row = { to, note: trimOrNull(o.note) };
  if (o.approved != null) body.approved = Math.round(o.approved);
  if (o.reason != null) body.reason = trimOrNull(o.reason);
  return body;
}

export const sendToPayrollBody = (month: Month): Row => ({ month });
