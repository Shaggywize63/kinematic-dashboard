'use client';
/**
 * Resolve the ids a distribution record carries (outlet_id, distributor_id, salesman_id) to display names.
 *
 * The orders / payments list endpoints return the bare rows (`select('*')`) — ids only, no joined names — so the
 * pages look them up in the lists they can already fetch: /distribution/distributors, /users and /stores.
 * Every lookup is fail-soft: a list the caller may not read (e.g. no `stores` module) just leaves those ids
 * unresolved and the page falls back to a short id, exactly as before.
 *
 * Re-fetches when the global client picker changes (all three lists are client scoped).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from './api';
import { useClient } from '../context/ClientContext';

export interface NamedOption { id: string; name: string; active?: boolean }

const rowsOf = (r: any): any[] => {
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.data)) return r.data;
  if (Array.isArray(r?.data?.data)) return r.data.data;
  return [];
};
const toOptions = (r: any): NamedOption[] =>
  rowsOf(r)
    .map((x) => ({ id: String(x?.id ?? ''), name: String(x?.name || x?.store_name || x?.outlet_name || ''), active: x?.is_active !== false }))
    .filter((o) => o.id && o.name);

const EMPTY: NamedOption[] = [];

export function useDistributionNames(want: { distributors?: boolean; salesmen?: boolean; outlets?: boolean }) {
  const { selectedClientId } = useClient();
  const { distributors: wantDist, salesmen: wantSales, outlets: wantOutlets } = want;
  const [lists, setLists] = useState<{ distributors: NamedOption[]; salesmen: NamedOption[]; outlets: NamedOption[] }>({
    distributors: EMPTY, salesmen: EMPTY, outlets: EMPTY,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const soft = (p: Promise<unknown>) => p.catch(() => null);
      const [d, u, o] = await Promise.all([
        wantDist ? soft(api.getDistributors()) : null,
        // Every user, deactivated included: an old order still names the rep who took it.
        wantSales ? soft(api.getFieldExecutives({ limit: '1000' })) : null,
        wantOutlets ? soft(api.getStores()) : null,
      ]);
      if (cancelled) return;
      setLists({ distributors: toOptions(d), salesmen: toOptions(u), outlets: toOptions(o) });
    })();
    return () => { cancelled = true; };
  }, [selectedClientId, wantDist, wantSales, wantOutlets]);

  const maps = useMemo(() => ({
    distributors: new Map(lists.distributors.map((o) => [o.id, o.name])),
    salesmen: new Map(lists.salesmen.map((o) => [o.id, o.name])),
    outlets: new Map(lists.outlets.map((o) => [o.id, o.name])),
  }), [lists]);

  const distributorName = useCallback((id?: string | null) => (id ? maps.distributors.get(id) : undefined), [maps]);
  const salesmanName = useCallback((id?: string | null) => (id ? maps.salesmen.get(id) : undefined), [maps]);
  const outletName = useCallback((id?: string | null) => (id ? maps.outlets.get(id) : undefined), [maps]);

  return { ...lists, distributorName, salesmanName, outletName };
}

/** `a1b2c3d4…` for an id we could not resolve to a name; an em dash when there is no id at all. */
export const shortId = (id?: string | null) => (id ? `${id.slice(0, 8)}…` : '—');
