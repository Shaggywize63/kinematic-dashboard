'use client';
// Live data source for the ASSETS slice of the Rewards area (phase 6). Sample mode never touches this file: the rewards
// store only calls in when the core HRMS source is 'live' (the same `kinematic_hrms_source` switch the rest of the module
// uses, read through live/store.ts).
//
// In live mode the register is loaded from GET /assets/bootstrap and held in memory only — it is never written to browser
// storage. The eight asset actions become server commands: each calls its endpoint, and the server's answer ({ asset, event })
// replaces the local asset and appends the event (the history stays append-only). A refusal carries the server's plain reason
// and nothing changes locally. Benefits and compensation are untouched here; they stay in the local area store.

import { useSyncExternalStore } from 'react';
import { getStatus, isLiveReady, randomUuid, subscribeLive, type Source } from '../../live/store';
import { HrmsApiError } from '../../live/client';
import { assetsApi } from './assetsClient';
import {
  assetCreateBody, issueBody, noteBody, repairBackBody, returnBody, transferBody,
} from './assetsWire';
import type { Id } from '../../types';
import type { Asset, AssetCondition, AssetEvent, AssetsState, AssetStatus } from '../types';
import type { NewAssetInput, Result } from '../store';

// ───────────────────────────── status and state ─────────────────────────────
export type AssetsPhase = 'idle' | 'loading' | 'ok' | 'not_ready' | 'error';
export interface AssetsLiveStatus { source: Source; phase: AssetsPhase; message: string }

const EMPTY_ASSETS: AssetsState = { items: [], events: [] };
const SAMPLE_STATUS: AssetsLiveStatus = { source: 'sample', phase: 'idle', message: '' };

let liveAssets: AssetsState | null = null;
let phase: AssetsPhase = 'idle';
let message = '';
let statusSnap: AssetsLiveStatus = SAMPLE_STATUS;

const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const asError = (e: unknown): HrmsApiError => (e instanceof HrmsApiError ? e : new HrmsApiError(e instanceof Error && e.message ? e.message : 'Request failed', 0));
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function refreshStatusSnapshot(): void {
  const source = getStatus().source;
  if (statusSnap.source !== source || statusSnap.phase !== phase || statusSnap.message !== message) {
    statusSnap = { source, phase, message };
  }
}
function setPhase(next: AssetsPhase, msg = ''): void {
  phase = next; message = msg;
  refreshStatusSnapshot();
  emit();
}

// ───────────────────────────── reads ─────────────────────────────
/** The live register, or an empty one before it has loaded. Held in memory only. */
export const getLiveAssets = (): AssetsState => liveAssets ?? EMPTY_ASSETS;

function getStatusSnapshot(): AssetsLiveStatus { refreshStatusSnapshot(); return statusSnap; }

/** The live register as a stable snapshot (for the merged rewards store). Null during server render and first client paint. */
export function useLiveAssetsSnapshot(): AssetsState {
  return useSyncExternalStore(subscribe, getLiveAssets, () => EMPTY_ASSETS);
}
/** The assets source and its load phase, for the Assets page's own loading / not-ready / error states. */
export function useLiveAssetsStatus(): AssetsLiveStatus {
  return useSyncExternalStore(subscribe, getStatusSnapshot, () => SAMPLE_STATUS);
}
/** Just the active source ('sample' | 'live'), for the merged rewards store. */
export function useLiveSource(): Source {
  return useSyncExternalStore(subscribeLive, () => getStatus().source, () => 'sample');
}

// ───────────────────────────── applying the server's answer ─────────────────────────────
function applyServer(asset: Asset, event: AssetEvent): void {
  const items = liveAssets ? [...liveAssets.items] : [];
  const i = items.findIndex((a) => a.id === asset.id);
  if (asset.id) { if (i >= 0) items[i] = asset; else items.push(asset); }
  const events = liveAssets ? [...liveAssets.events] : [];
  if (event.id && !events.some((e) => e.id === event.id)) events.push(event);   // append only, no duplicates
  liveAssets = { items, events };
  setPhase('ok');   // emits
}

// ───────────────────────────── loading ─────────────────────────────
let loading = false;
let loadedInputsVersion = -1;

async function loadAssets(): Promise<void> {
  setPhase('loading');
  try {
    const data = await assetsApi.bootstrap();
    liveAssets = { items: data.assets, events: data.events };
    setPhase('ok');
  } catch (e) {
    const err = asError(e);
    liveAssets = null;
    setPhase(err.notReady ? 'not_ready' : 'error', err.message);
  }
}

function maybeLoad(force = false): void {
  const st = getStatus();
  if (st.source !== 'live' || st.phase !== 'ready') return;
  if (!force && (loading || loadedInputsVersion === st.inputsVersion)) return;
  loadedInputsVersion = st.inputsVersion;
  loading = true;
  void loadAssets().finally(() => { loading = false; });
}

/** Called by the Assets page on mount (and when the core source / readiness changes), so a navigation to the page loads the
 * register even if the subscription below missed the core's transition to ready. Idempotent. */
export const ensureAssetsLoaded = (): void => maybeLoad();
/** The Assets page's "Try again" after a not-ready or error. */
export const reloadAssets = (): void => maybeLoad(true);

// The core live source drives the assets slice: a load when it becomes ready, a reload on every refresh, a reset back to sample.
subscribeLive(() => {
  const st = getStatus();
  if (st.source !== 'live') {
    if (liveAssets !== null || phase !== 'idle') { liveAssets = null; loadedInputsVersion = -1; setPhase('idle'); }
    else { refreshStatusSnapshot(); emit(); }
    return;
  }
  refreshStatusSnapshot();
  maybeLoad();
});

// ───────────────────────────── commands ─────────────────────────────
function blocked(): string | null {
  if (!isLiveReady()) return 'The HRMS data has not loaded from the server.';
  if (phase !== 'ok') return message || 'The asset register has not loaded from the server.';
  return null;
}

async function command(assetId: Id, path: string, body: Record<string, unknown>): Promise<Result> {
  const b = blocked(); if (b) return fail(b);
  try {
    const { asset, event } = await assetsApi.command(assetId, path, body);
    applyServer(asset, event);
    return { ok: true };
  } catch (e) { return fail(asError(e).message); }
}

export async function liveAddAsset(input: NewAssetInput): Promise<Result<{ id: Id; tag: string }>> {
  const b = blocked(); if (b) return fail(b);
  try {
    const { asset, event } = await assetsApi.create(assetCreateBody(input, randomUuid()));
    applyServer(asset, event);
    return { ok: true, id: asset.id, tag: asset.tag };
  } catch (e) { return fail(asError(e).message); }
}

export const liveIssueAsset = (i: { assetId: Id; personId: Id; condition: AssetCondition; ack: boolean; note?: string }): Promise<Result> =>
  command(i.assetId, 'issue', issueBody(i));
export const liveReturnAsset = (i: { assetId: Id; condition: AssetCondition; next: Extract<AssetStatus, 'in_stock' | 'in_repair' | 'retired'>; note?: string }): Promise<Result> =>
  command(i.assetId, 'return', returnBody(i));
export const liveTransferAsset = (i: { assetId: Id; toId: Id; condition: AssetCondition; ack: boolean; note?: string }): Promise<Result> =>
  command(i.assetId, 'transfer', transferBody(i));
export const liveSendToRepair = (assetId: Id, note?: string): Promise<Result> =>
  command(assetId, 'repair-out', noteBody(note));
export const liveBackFromRepair = (assetId: Id, condition: AssetCondition, note?: string): Promise<Result> =>
  command(assetId, 'repair-back', repairBackBody({ condition, note }));
export const liveMarkLost = (assetId: Id, note?: string): Promise<Result> =>
  command(assetId, 'lost', noteBody(note));
export const liveRetireAsset = (assetId: Id, note?: string): Promise<Result> =>
  command(assetId, 'retire', noteBody(note));
