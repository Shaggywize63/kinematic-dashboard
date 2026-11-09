// Assets: pure logic. No React, no storage. Tested in e2e/hrmsx-rewards.spec.ts.

import type { ExitCase, Id, ISODate } from '../types';
import { addDays, diffDays, tenure } from '../format';
import type { Asset, AssetCondition, AssetEvent, AssetEventKind, AssetStatus, AssetType } from './types';

export const ASSET_TYPES: { value: AssetType; label: string; prefix: string; lifeYears: number; singleIssue: boolean; keywords: string[] }[] = [
  { value: 'laptop', label: 'Laptop', prefix: 'LAP', lifeYears: 4, singleIssue: true, keywords: ['laptop', 'notebook'] },
  { value: 'phone', label: 'Phone', prefix: 'PHN', lifeYears: 3, singleIssue: true, keywords: ['phone', 'mobile', 'handset'] },
  { value: 'sim', label: 'SIM card', prefix: 'SIM', lifeYears: 1, singleIssue: true, keywords: ['sim'] },
  { value: 'vehicle', label: 'Vehicle', prefix: 'VEH', lifeYears: 8, singleIssue: true, keywords: ['vehicle', 'bike', 'scooter', 'motorcycle'] },
  { value: 'id_card', label: 'ID card', prefix: 'IDC', lifeYears: 3, singleIssue: true, keywords: ['id card', 'identity card', 'badge'] },
  { value: 'uniform', label: 'Uniform', prefix: 'UNI', lifeYears: 2, singleIssue: false, keywords: ['uniform'] },
  { value: 'tool', label: 'Tool or device', prefix: 'TLS', lifeYears: 5, singleIssue: false, keywords: ['tool', 'scanner', 'printer', 'scale'] },
];
export const typeInfo = (t: AssetType) => ASSET_TYPES.find((x) => x.value === t)!;
export const typeLabel = (t: AssetType): string => typeInfo(t).label;

export const STATUS_LABEL: Record<AssetStatus, string> = { in_stock: 'In stock', issued: 'Issued', in_repair: 'In repair', lost: 'Lost', retired: 'Retired' };
export const EVENT_LABEL: Record<AssetEventKind, string> = {
  purchased: 'Purchased', issued: 'Issued', returned: 'Returned', transferred: 'Transferred', repair_out: 'Sent for repair', repair_back: 'Back from repair', lost: 'Marked lost', retired: 'Retired',
};
export const CONDITION_LABEL: Record<AssetCondition, string> = { new: 'New', good: 'Good', fair: 'Fair', poor: 'Poor', damaged: 'Damaged' };
const CONDITION_RANK: Record<AssetCondition, number> = { new: 5, good: 4, fair: 3, poor: 2, damaged: 1 };
export const conditionWorse = (a: AssetCondition, than: AssetCondition): boolean => CONDITION_RANK[a] < CONDITION_RANK[than];

/** Adds whole months, clamping the day to the end of a shorter month (31 Aug + 6 months = 28 Feb). */
export function addMonthsISO(d: ISODate, months: number): ISODate {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}

// ───────────────────────────── value ─────────────────────────────
/**
 * Book value by straight-line depreciation over the stated useful life, in whole months, with no residual value:
 *   book value = cost x (1 - months used / (life in years x 12)), never below zero, rounded to the rupee.
 * Example: a laptop bought for 80,000 with a 4-year life is worth 40,000 after 24 months.
 */
export function bookValue(a: Pick<Asset, 'cost' | 'purchaseDate' | 'type'>, on: ISODate): number {
  const life = typeInfo(a.type).lifeYears * 12;
  if (a.purchaseDate >= on) return Math.round(a.cost);
  const used = tenure(a.purchaseDate, on).totalMonths;
  return Math.max(0, Math.round(a.cost * (1 - used / life)));
}

export interface RecoveryAdvice { bookValue: number; lifeYears: number; monthsUsed: number; recommended: number; basis: string }
/**
 * Advisory only. The figure is the book value on the date given. It is not a decision, it is never posted anywhere,
 * and taking it from a final settlement needs a lawful basis and the employee's agreement.
 */
export function recoveryAdvice(a: Pick<Asset, 'cost' | 'purchaseDate' | 'type'>, on: ISODate): RecoveryAdvice {
  const lifeYears = typeInfo(a.type).lifeYears;
  const monthsUsed = a.purchaseDate >= on ? 0 : tenure(a.purchaseDate, on).totalMonths;
  const bv = bookValue(a, on);
  return {
    bookValue: bv, lifeYears, monthsUsed, recommended: bv,
    basis: `Cost ${a.cost} less straight-line depreciation over ${lifeYears} ${lifeYears === 1 ? 'year' : 'years'}: ${monthsUsed} of ${lifeYears * 12} months used.`,
  };
}

// ───────────────────────────── age and warranty ─────────────────────────────
const isLiveAsset = (a: Asset): boolean => a.status !== 'retired' && a.status !== 'lost';

/** Days left on the warranty (negative when it has ended); null when the asset has none. */
export function warrantyDaysLeft(a: Asset, on: ISODate): number | null {
  return a.warrantyEnd ? diffDays(on, a.warrantyEnd) : null;
}
/** Live assets whose warranty ends within `days` days from `on` (including today), soonest first. */
export function warrantyExpiring(items: Asset[], on: ISODate, days = 60): Asset[] {
  return items
    .filter((a) => isLiveAsset(a) && a.warrantyEnd && a.warrantyEnd >= on && diffDays(on, a.warrantyEnd) <= days)
    .sort((x, y) => (x.warrantyEnd! < y.warrantyEnd! ? -1 : 1));
}
/** True when more than `years` whole years have passed since purchase. */
export const olderThan = (a: Asset, years: number, on: ISODate): boolean => addMonthsISO(a.purchaseDate, years * 12) < on;
export function agedAssets(items: Asset[], on: ISODate, years = 4): Asset[] {
  return items.filter((a) => isLiveAsset(a) && olderThan(a, years, on)).sort((x, y) => (x.purchaseDate < y.purchaseDate ? -1 : 1));
}
export function ageLabel(a: Asset, on: ISODate): string {
  const t = tenure(a.purchaseDate, on);
  return t.years ? `${t.years}y ${t.months}m` : `${t.months}m`;
}

// ───────────────────────────── holders ─────────────────────────────
export const heldBy = (items: Asset[], personId: Id): Asset[] => items.filter((a) => a.status === 'issued' && a.holderId === personId);

/** The asset the person already holds of the same single-issue type, if issuing `asset` to them would be a second one. */
export function duplicateIssue(items: Asset[], personId: Id, asset: Pick<Asset, 'id' | 'type'>): Asset | undefined {
  if (!typeInfo(asset.type).singleIssue) return undefined;
  return heldBy(items, personId).find((a) => a.type === asset.type && a.id !== asset.id);
}

export function nextTag(items: Asset[], type: AssetType): string {
  const prefix = typeInfo(type).prefix;
  const max = items.filter((a) => a.type === type).reduce((m, a) => Math.max(m, Number(a.tag.split('-').pop()) || 0), 0);
  return `AST-${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** What the history says the asset is now. The history is the source of truth, so this must equal the stored state. */
export function replayAsset(events: AssetEvent[], assetId: Id): { status: AssetStatus; holderId?: Id } | null {
  const mine = events.filter((e) => e.assetId === assetId);
  const last = mine[mine.length - 1];
  if (!last) return null;
  return { status: last.status, holderId: last.status === 'issued' ? last.toId : undefined };
}

// ───────────────────────────── cost and groups ─────────────────────────────
export interface CostRow { name: string; count: number; cost: number; book: number }
/** Cost and book value by department of the current holder; unissued assets fall under `unassignedLabel`. */
export function costByDepartment(items: Asset[], deptOf: (personId: Id) => string | undefined, on: ISODate, unassignedLabel = 'Not issued'): CostRow[] {
  const map = new Map<string, CostRow>();
  for (const a of items) {
    if (a.status === 'retired' || a.status === 'lost') continue;
    const name = (a.status === 'issued' && a.holderId ? deptOf(a.holderId) : undefined) ?? unassignedLabel;
    const row = map.get(name) ?? { name, count: 0, cost: 0, book: 0 };
    row.count += 1; row.cost += a.cost; row.book += bookValue(a, on);
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

// ───────────────────────────── exits ─────────────────────────────
export type ExitAssetState =
  | 'return_pending'                 // still held, and the exit checklist agrees it is not back
  | 'register_returned_checklist_open'   // the register has it back, the Lifecycle checklist is not ticked
  | 'checklist_returned_register_open'   // the checklist says returned, the register still shows the person as holder
  | 'both_returned'
  | 'not_on_checklist';              // held, but nothing on the exit checklist matches

export interface ExitAssetRow {
  key: string;
  asset?: Asset;
  core?: ExitCase['assets'][number];
  state: ExitAssetState | 'checklist_only';
}

export const EXIT_STATE_LABEL: Record<ExitAssetRow['state'], string> = {
  return_pending: 'Return before clearance',
  register_returned_checklist_open: 'Returned here, tick the checklist',
  checklist_returned_register_open: 'Checklist says returned, register disagrees',
  both_returned: 'Returned',
  not_on_checklist: 'Return before clearance, not on the checklist',
  checklist_only: 'On the checklist, not in this register',
};

function matchStrength(a: Asset, coreName: string): 0 | 1 | 2 {
  const n = coreName.toLowerCase();
  if (n.includes(a.tag.toLowerCase())) return 2;
  const tail = a.serial.replace(/\D/g, '').slice(-4);
  if (tail.length === 4 && n.includes(tail)) return 2;
  return typeInfo(a.type).keywords.some((k) => n.includes(k)) ? 1 : 0;
}

/**
 * Lines up the assets a person holds (or has handed back) in this register with the asset list on their core exit
 * checklist. Strong matches (tag or serial ending) are paired first, then matches by kind of item. Nothing here edits the
 * core exit: it only reports where the two disagree.
 */
export function reconcileExit(everHeld: Asset[], personId: Id, coreAssets: ExitCase['assets'] | undefined): ExitAssetRow[] {
  const core = coreAssets ?? [];
  const usedCore = new Set<Id>();
  const pair = new Map<Id, ExitCase['assets'][number]>();
  for (const strength of [2, 1] as const) {
    for (const a of everHeld) {
      if (pair.has(a.id)) continue;
      const hit = core.find((c) => !usedCore.has(c.id) && matchStrength(a, c.name) === strength);
      if (hit) { pair.set(a.id, hit); usedCore.add(hit.id); }
    }
  }
  const rows: ExitAssetRow[] = everHeld.map((a) => {
    const c = pair.get(a.id);
    const stillHeld = a.status === 'issued' && a.holderId === personId;
    let state: ExitAssetRow['state'];
    if (!c) state = stillHeld ? 'not_on_checklist' : 'both_returned';
    else if (stillHeld) state = c.returned ? 'checklist_returned_register_open' : 'return_pending';
    else state = c.returned ? 'both_returned' : 'register_returned_checklist_open';
    return { key: a.id, asset: a, core: c, state };
  });
  for (const c of core) if (!usedCore.has(c.id)) rows.push({ key: c.id, core: c, state: 'checklist_only' });
  return rows;
}

/** Ids of the assets a person has ever been issued, from the history. */
export function everHeldIds(events: AssetEvent[], personId: Id): Id[] {
  const out: Id[] = [];
  for (const e of events) if (e.toId === personId && (e.kind === 'issued' || e.kind === 'transferred') && !out.includes(e.assetId)) out.push(e.assetId);
  return out;
}

/** Date to measure book value on for a leaver: their last working day if it is still ahead, otherwise today. */
export const recoveryDate = (lastWorkingDate: ISODate | undefined, today: ISODate): ISODate => (lastWorkingDate && lastWorkingDate > today ? lastWorkingDate : today);

export function addDaysISO(d: ISODate, n: number): ISODate { return addDays(d, n); }
