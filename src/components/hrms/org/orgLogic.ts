// Pure logic for the Organisation screens: registration expiry, state coverage, usage counts and form validation.
// No React and no storage, so e2e/hrms-org-time.spec.ts can test it without a browser.

import type { Employee, HrmsDb, Id, ISODate, LegalEntity, Registration, RegistrationType } from '../../../lib/hrms/types';
import { buildBreakup } from '../../../lib/hrms/engine';
import { diffDays, fmtDate, num } from '../../../lib/hrms/format';
import { ESI, LWF_RULES, PT_NONE_STATES, PT_RULES, rowOn, valueOn, type Confidence } from '../../../lib/hrms/rules';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { checkGstin, checkPan, checkPincode, checkTan, type Check } from '../../../lib/hrms/validators';

/** A registration that ends within this many days of "today" is flagged as expiring. */
export const EXPIRY_WINDOW_DAYS = 90;

// ───────────────────────────── registration kinds ─────────────────────────────
export type StateRule = 'required' | 'optional' | 'none';
export const REGISTRATION_TYPES: { value: RegistrationType; label: string; short: string; state: StateRule; hint: string }[] = [
  { value: 'pf', label: 'Provident Fund (PF)', short: 'PF', state: 'none', hint: 'Establishment code from EPFO' },
  { value: 'esi', label: 'Employees State Insurance (ESI)', short: 'ESI', state: 'none', hint: '17 digit employer code' },
  { value: 'pt', label: 'Professional Tax (PT)', short: 'PT', state: 'required', hint: 'Enrolment or registration number, one per state' },
  { value: 'lwf', label: 'Labour Welfare Fund (LWF)', short: 'LWF', state: 'required', hint: 'Registration number, one per state' },
  { value: 'shops', label: 'Shops and Establishments', short: 'Shops', state: 'required', hint: 'Registration certificate number, one per state' },
  { value: 'clra', label: 'Contract Labour licence (CLRA)', short: 'CLRA', state: 'optional', hint: 'Principal employer registration or licence number' },
  { value: 'tan', label: 'TAN', short: 'TAN', state: 'none', hint: 'Tax deduction account number, like DELA12345B' },
  { value: 'gst', label: 'GST registration', short: 'GST', state: 'optional', hint: 'GSTIN, 15 characters' },
];
export const registrationMeta = (t: RegistrationType) => REGISTRATION_TYPES.find((x) => x.value === t)!;
export const registrationLabel = (t: RegistrationType): string => registrationMeta(t).label;

// ───────────────────────────── expiry ─────────────────────────────
export type ExpiryKind = 'none' | 'valid' | 'expiring' | 'expired';
export interface ExpiryStatus { kind: ExpiryKind; days?: number; label: string }

export function expiryStatus(reg: Pick<Registration, 'validTo'>, today: ISODate = PREVIEW_TODAY): ExpiryStatus {
  if (!reg.validTo) return { kind: 'none', label: 'No end date' };
  const days = diffDays(today, reg.validTo);
  if (days < 0) return { kind: 'expired', days, label: `Expired ${-days} day${-days === 1 ? '' : 's'} ago` };
  if (days <= EXPIRY_WINDOW_DAYS) return { kind: 'expiring', days, label: days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}` };
  return { kind: 'valid', days, label: 'Valid' };
}

// ───────────────────────────── usage counts ─────────────────────────────
export function entityHeadcount(db: HrmsDb, entityId: Id): number {
  return db.employees.filter((e) => e.entityId === entityId && e.status !== 'exited').length;
}
export function usageOf(employees: Employee[], key: 'locationId' | 'departmentId' | 'designationId' | 'entityId', id: Id): { total: number; current: number; exited: number } {
  const list = employees.filter((e) => e[key] === id);
  const exited = list.filter((e) => e.status === 'exited').length;
  return { total: list.length, current: list.length - exited, exited };
}
/** "5 employees (4 current, 1 exited)". */
export function usageText(u: { total: number; current: number; exited: number }): string {
  const base = `${u.total} employee${u.total === 1 ? '' : 's'}`;
  return u.exited > 0 ? `${base} (${u.current} current, ${u.exited} exited)` : base;
}

// ───────────────────────────── state coverage ─────────────────────────────
export type CoverageStatus = 'on_file' | 'expiring' | 'expired' | 'missing';
export interface CoverageItem {
  type: RegistrationType;
  label: string;
  reason: string;
  status: CoverageStatus;
  registration?: Registration;
  confidence?: Confidence;
}
export interface StateCoverage {
  state: string;
  headcount: number;
  locations: string[];
  items: CoverageItem[];
  /** Registrations this state does not need, with the reason (so a missing PT in Delhi is not a gap). */
  notNeeded: { label: string; reason: string }[];
  gaps: number;
}

/** Find the registration of a type that covers a state. PF and ESI are not per state, so one without a state counts everywhere. */
export function findRegistration(entity: LegalEntity, type: RegistrationType, state: string): Registration | undefined {
  const perState = registrationMeta(type).state === 'required';
  const sameType = entity.registrations.filter((r) => r.type === type);
  if (perState) return sameType.find((r) => r.state === state);
  return sameType.find((r) => r.state === state) ?? sameType.find((r) => !r.state);
}

function statusOf(reg: Registration | undefined, today: ISODate): CoverageStatus {
  if (!reg) return 'missing';
  const x = expiryStatus(reg, today);
  return x.kind === 'expired' ? 'expired' : x.kind === 'expiring' ? 'expiring' : 'on_file';
}

export function stateCoverage(db: HrmsDb, entity: LegalEntity, today: ISODate = PREVIEW_TODAY): StateCoverage[] {
  const esiCeiling = valueOn(ESI.ceiling, today);
  const esiConf = rowOn(ESI.ceiling, today).confidence;
  const byState = new Map<string, { staff: Employee[]; locations: Set<string> }>();
  for (const e of db.employees) {
    if (e.entityId !== entity.id || e.status === 'exited') continue;
    const loc = db.locations.find((l) => l.id === e.locationId);
    if (!loc?.state) continue;
    const slot = byState.get(loc.state) ?? { staff: [], locations: new Set<string>() };
    slot.staff.push(e);
    slot.locations.add(loc.name);
    byState.set(loc.state, slot);
  }

  const out: StateCoverage[] = [];
  for (const [state, { staff, locations }] of byState) {
    const items: CoverageItem[] = [];
    const notNeeded: StateCoverage['notNeeded'] = [];
    const add = (type: RegistrationType, reason: string, confidence?: Confidence) => {
      const registration = findRegistration(entity, type, state);
      items.push({ type, label: registrationLabel(type), reason, status: statusOf(registration, today), registration, confidence });
    };

    add('pf', `${staff.length} employee${staff.length === 1 ? '' : 's'} on the payroll`);

    const underEsi = staff.filter((e) => {
      const structure = db.structures.find((s) => s.id === e.structureId);
      if (!structure || !e.annualCtc) return false;
      return buildBreakup(structure, e.annualCtc, { asOn: today, pfMember: e.pfMember, pfOnActual: e.pfOnActualWage, overrides: e.structureOverrides }).esiApplicable;
    });
    if (underEsi.length) add('esi', `${underEsi.length} employee${underEsi.length === 1 ? '' : 's'} earn under the ESI ceiling of ₹${num(esiCeiling)}`, esiConf);
    else notNeeded.push({ label: 'ESI', reason: `nobody here earns under the ₹${num(esiCeiling)} ceiling` });

    const pt = PT_RULES.find((r) => r.state === state);
    if (pt) add('pt', `${state} charges professional tax`, pt.confidence);
    else notNeeded.push({ label: 'PT', reason: PT_NONE_STATES.includes(state) ? `${state} has no professional tax` : `${state} is not in the preview's PT table` });

    const lwf = LWF_RULES.find((r) => r.state === state);
    if (lwf) add('lwf', `${state} has a labour welfare fund`, lwf.confidence);
    else notNeeded.push({ label: 'LWF', reason: `${state} is not in the preview's LWF table` });

    add('shops', 'Every establishment needs one in its state');

    out.push({ state, headcount: staff.length, locations: [...locations].sort(), items, notNeeded, gaps: items.filter((i) => i.status === 'missing' || i.status === 'expired').length });
  }
  return out.sort((a, b) => a.state.localeCompare(b.state));
}

export const entityGaps = (db: HrmsDb, entity: LegalEntity, today: ISODate = PREVIEW_TODAY): number =>
  stateCoverage(db, entity, today).reduce((t, s) => t + s.gaps, 0);

// ───────────────────────────── entity form ─────────────────────────────
export interface EntityForm {
  name: string; pan: string; tan: string; cin: string; gstin: string;
  line1: string; line2: string; city: string; state: string; pincode: string;
  signName: string; signDesignation: string;
}
export const emptyEntityForm = (): EntityForm => ({ name: '', pan: '', tan: '', cin: '', gstin: '', line1: '', line2: '', city: '', state: '', pincode: '', signName: '', signDesignation: '' });
export const entityToForm = (e: LegalEntity): EntityForm => ({
  name: e.name, pan: e.pan, tan: e.tan, cin: e.cin ?? '', gstin: e.gstin ?? '',
  line1: e.address.line1 ?? '', line2: e.address.line2 ?? '', city: e.address.city ?? '', state: e.address.state ?? '', pincode: e.address.pincode ?? '',
  signName: e.signatory?.name ?? '', signDesignation: e.signatory?.designation ?? '',
});
const up = (s: string) => s.replace(/\s+/g, '').toUpperCase();
export function formToEntity(f: EntityForm, base: Pick<LegalEntity, 'id' | 'registrations'>): LegalEntity {
  return {
    id: base.id, registrations: base.registrations,
    name: f.name.trim(), pan: up(f.pan), tan: up(f.tan), cin: f.cin.trim() ? up(f.cin) : undefined, gstin: f.gstin.trim() ? up(f.gstin) : undefined,
    address: { line1: f.line1.trim(), line2: f.line2.trim() || undefined, city: f.city.trim(), state: f.state, pincode: f.pincode.trim() },
    signatory: f.signName.trim() ? { name: f.signName.trim(), designation: f.signDesignation.trim() } : undefined,
  };
}

const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export type Errors<K extends string> = Partial<Record<K, string>>;
const msg = (c: Check): string | undefined => (c.ok ? undefined : c.message);

export function validateEntity(f: EntityForm, others: LegalEntity[]): Errors<keyof EntityForm> {
  const e: Errors<keyof EntityForm> = {};
  if (!f.name.trim()) e.name = 'Legal name is required';
  else if (others.some((o) => o.name.trim().toLowerCase() === f.name.trim().toLowerCase())) e.name = 'Another entity already has this name';
  e.pan = msg(checkPan(f.pan));
  if (!e.pan && others.some((o) => up(o.pan) === up(f.pan))) e.pan = 'Another entity already uses this PAN';
  e.tan = msg(checkTan(f.tan));
  if (f.cin.trim() && !CIN_RE.test(up(f.cin))) e.cin = 'CIN is 21 characters, like U52100DL2016PTC301234';
  e.gstin = msg(checkGstin(f.gstin));
  if (!e.gstin && !e.pan && f.gstin.trim() && up(f.gstin).slice(2, 12) !== up(f.pan)) e.gstin = `The PAN inside this GSTIN (${up(f.gstin).slice(2, 12)}) does not match the entity PAN`;
  if (!f.line1.trim()) e.line1 = 'Address line 1 is required';
  if (!f.city.trim()) e.city = 'City is required';
  if (!f.state) e.state = 'Choose a state';
  e.pincode = msg(checkPincode(f.pincode));
  if (f.signName.trim() && !f.signDesignation.trim()) e.signDesignation = 'Add the signatory designation';
  if (!f.signName.trim() && f.signDesignation.trim()) e.signName = 'Add the signatory name';
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errors<keyof EntityForm>;
}

// ───────────────────────────── registration form ─────────────────────────────
export interface RegistrationForm { type: RegistrationType; state: string; number: string; validFrom: string; validTo: string; notes: string }
export const emptyRegistrationForm = (): RegistrationForm => ({ type: 'pf', state: '', number: '', validFrom: '', validTo: '', notes: '' });
export const registrationToForm = (r: Registration): RegistrationForm => ({ type: r.type, state: r.state ?? '', number: r.number, validFrom: r.validFrom ?? '', validTo: r.validTo ?? '', notes: r.notes ?? '' });
export function formToRegistration(f: RegistrationForm, id: Id): Registration {
  const stateful = registrationMeta(f.type).state !== 'none';
  return {
    id, type: f.type, state: stateful && f.state ? f.state : undefined, number: f.type === 'gst' || f.type === 'tan' ? up(f.number) : f.number.trim(),
    validFrom: f.validFrom || undefined, validTo: f.validTo || undefined, notes: f.notes.trim() || undefined,
  };
}

export function validateRegistration(f: RegistrationForm, entity: LegalEntity, editingId?: Id): Errors<keyof RegistrationForm> {
  const e: Errors<keyof RegistrationForm> = {};
  const meta = registrationMeta(f.type);
  if (meta.state === 'required' && !f.state) e.state = `${meta.short} is registered per state. Choose the state`;
  if (!f.number.trim()) e.number = 'Registration number is required';
  else if (f.type === 'gst') e.number = msg(checkGstin(f.number)) ?? (up(f.number).length === 15 ? undefined : 'GSTIN is 15 characters');
  else if (f.type === 'tan') e.number = msg(checkTan(f.number));
  else if (f.number.trim().length > 40) e.number = 'Registration number is too long';
  if (!e.number) {
    const same = entity.registrations.find((r) => r.id !== editingId && r.type === f.type && (r.state ?? '') === (meta.state === 'none' ? '' : f.state) && r.number.trim().toLowerCase() === f.number.trim().toLowerCase());
    if (same) e.number = 'This registration is already on file for the entity';
  }
  if (f.validFrom && f.validTo && f.validTo < f.validFrom) e.validTo = `Valid to must be on or after ${fmtDate(f.validFrom)}`;
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errors<keyof RegistrationForm>;
}

// ───────────────────────────── simple name lists ─────────────────────────────
export function validateName(name: string, others: string[], noun: string): string | undefined {
  const n = name.trim();
  if (!n) return `${noun} name is required`;
  if (n.length > 60) return `${noun} name is too long (60 characters at most)`;
  if (others.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return `There is already a ${noun.toLowerCase()} called ${n}`;
  return undefined;
}
