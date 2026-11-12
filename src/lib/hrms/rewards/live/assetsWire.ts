// The one place where the dashboard's Asset / AssetEvent shapes (camelCase, optional fields) meet the HRMS assets API's
// (snake_case top-level keys, null for "nothing"). Mirrors lib/hrms/live/wire.ts: nothing else in the app knows the wire
// names, dates are YYYY-MM-DD, and `undefined` is "none" on the way in.
//
// Phase 6: the asset register moves to the server. Benefits and compensation (the other two Rewards slices) stay local,
// so only these two shapes are mapped here.

import { addMonthsISO } from '../assetsEngine';
import { arr, isObj, num, str, UUID_RE, type Row } from '../../live/wire';
import type { Id } from '../../types';
import type { Asset, AssetCondition, AssetEvent, AssetEventKind, AssetStatus, AssetType } from '../types';
import type { NewAssetInput } from '../store';

export type { Row };

// ───────────────────────────── enum guards ─────────────────────────────
const TYPES = new Set<AssetType>(['laptop', 'phone', 'sim', 'vehicle', 'id_card', 'uniform', 'tool']);
const STATUSES = new Set<AssetStatus>(['in_stock', 'issued', 'in_repair', 'lost', 'retired']);
const CONDITIONS = new Set<AssetCondition>(['new', 'good', 'fair', 'poor', 'damaged']);
const KINDS = new Set<AssetEventKind>(['purchased', 'issued', 'returned', 'transferred', 'repair_out', 'repair_back', 'lost', 'retired']);

const asType = (v: unknown): AssetType => (TYPES.has(v as AssetType) ? (v as AssetType) : 'laptop');
const asStatus = (v: unknown): AssetStatus => (STATUSES.has(v as AssetStatus) ? (v as AssetStatus) : 'in_stock');
const asCondition = (v: unknown): AssetCondition => (CONDITIONS.has(v as AssetCondition) ? (v as AssetCondition) : 'good');
const asKind = (v: unknown): AssetEventKind => (KINDS.has(v as AssetEventKind) ? (v as AssetEventKind) : 'purchased');

// ───────────────────────────── from the wire ─────────────────────────────
export function assetFromWire(r: Row): Asset {
  return {
    id: String(r.id ?? ''), tag: String(r.tag ?? ''), type: asType(r.type), make: String(r.make ?? ''), model: String(r.model ?? ''),
    serial: String(r.serial ?? ''), purchaseDate: str(r.purchase_date) ?? '', cost: num(r.cost) ?? 0,
    warrantyEnd: str(r.warranty_end) ?? null, condition: asCondition(r.condition), status: asStatus(r.status),
    holderId: str(r.holder_id),
  };
}

/** An event, in the dashboard's shape. Optional fields (from/to/condition/ack/note) are left out when the server sent none,
 * so the row equals what the sample store would have written. The list is append-only; nothing here edits an event. */
export function assetEventFromWire(r: Row): AssetEvent {
  const ev: AssetEvent = {
    id: String(r.id ?? ''), assetId: String(r.asset_id ?? ''), on: str(r.on) ?? '', kind: asKind(r.kind),
    status: asStatus(r.status), by: String(r.by ?? ''),
  };
  const fromId = str(r.from_id); if (fromId) ev.fromId = fromId;
  const toId = str(r.to_id); if (toId) ev.toId = toId;
  if (CONDITIONS.has(r.condition as AssetCondition)) ev.condition = r.condition as AssetCondition;
  if (typeof r.ack === 'boolean') ev.ack = r.ack;
  const note = str(r.note); if (note) ev.note = note;
  return ev;
}

export interface AssetsBootstrap { assets: Asset[]; events: AssetEvent[]; serverTime?: string }
export function assetsBootstrapFromWire(data: Row): AssetsBootstrap {
  return { assets: arr(data.assets).map(assetFromWire), events: arr(data.events).map(assetEventFromWire), serverTime: str(data.server_time) };
}

/** The answer to a create or a command: the updated asset and the appended event. */
export interface CommandResult { asset: Asset; event: AssetEvent }
export function commandResultFromWire(data: Row): CommandResult {
  return { asset: assetFromWire(isObj(data.asset) ? data.asset : {}), event: assetEventFromWire(isObj(data.event) ? data.event : {}) };
}

// ───────────────────────────── to the wire ─────────────────────────────
const trimOrNull = (s: string | undefined): string | null => { const t = (s ?? '').trim(); return t || null; };
export const noteOut = (s: string | undefined): string | undefined => { const t = (s ?? '').trim(); return t || undefined; };

/** Body for POST /assets. The server assigns the tag (its own `nextTag` by type) and the status (`in_stock`); the warranty
 * is sent as the end date the dashboard works out from the months on the form. A client UUID makes the create idempotent. */
export function assetCreateBody(input: NewAssetInput, id?: string): Row {
  const body: Row = {
    type: input.type, make: input.make.trim(), model: input.model.trim(), serial: input.serial.trim(),
    purchase_date: input.purchaseDate, cost: Math.round(input.cost), condition: input.condition,
    warranty_end: input.warrantyMonths > 0 ? addMonthsISO(input.purchaseDate, input.warrantyMonths) : null,
  };
  if (id && UUID_RE.test(id)) body.id = id;
  return body;
}

// The command bodies: only what the server needs, in snake_case. `null` is sent for an omitted optional note so the clear is
// explicit, matching the rest of the wire; the id of the asset is in the path, never the body.
export const issueBody = (i: { personId: Id; condition: AssetCondition; ack: boolean; note?: string }): Row =>
  ({ person_id: i.personId, condition: i.condition, ack: i.ack, note: trimOrNull(i.note) });
export const returnBody = (i: { condition: AssetCondition; next: AssetStatus; note?: string }): Row =>
  ({ condition: i.condition, next: i.next, note: trimOrNull(i.note) });
export const transferBody = (i: { toId: Id; condition: AssetCondition; ack: boolean; note?: string }): Row =>
  ({ to_id: i.toId, condition: i.condition, ack: i.ack, note: trimOrNull(i.note) });
export const repairBackBody = (i: { condition: AssetCondition; note?: string }): Row =>
  ({ condition: i.condition, note: trimOrNull(i.note) });
export const noteBody = (note?: string): Row => ({ note: trimOrNull(note) });
