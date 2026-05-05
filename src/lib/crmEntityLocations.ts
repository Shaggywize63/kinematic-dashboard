'use client';
import { useEffect, useState } from 'react';
import { crmLeads, crmContacts, crmAccounts } from './crmApi';

export type EntityLoc = { state?: string | null; city?: string | null };

/**
 * Pre-loads (id → state/city) for leads + contacts + accounts so list views
 * (tasks, activities, etc.) can resolve the location of an activity/task by
 * its linked entity FK without doing N+1 fetches.
 *
 * Activities tied only to a deal won't have a direct mapping here (deals
 * inherit location from their account); the consumer can decide whether to
 * exclude them from a location filter or treat them as "no location".
 */
export function useEntityLocations(enabled = true) {
  const [locations, setLocations] = useState<Map<string, EntityLoc>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) { setLoaded(true); return; }
    let cancel = false;
    (async () => {
      const map = new Map<string, EntityLoc>();
      try {
        const [leads, contacts, accounts] = await Promise.all([
          crmLeads.list({ limit: 500 }).catch(() => ({ data: [] as any[] })),
          crmContacts.list({ limit: 500 }).catch(() => ({ data: [] as any[] })),
          crmAccounts.list({ limit: 500 }).catch(() => ({ data: [] as any[] })),
        ]);
        ((leads as any).data || []).forEach((x: any) => map.set(x.id, { state: x.state, city: x.city }));
        ((contacts as any).data || []).forEach((x: any) => map.set(x.id, { state: x.state, city: x.city }));
        ((accounts as any).data || []).forEach((x: any) => map.set(x.id, { state: x.state, city: x.city }));
        if (!cancel) setLocations(map);
      } finally {
        if (!cancel) setLoaded(true);
      }
    })();
    return () => { cancel = true; };
  }, [enabled]);

  return { locations, loaded };
}

export function getActivityLocation(
  activity: { lead_id?: string | null; contact_id?: string | null; account_id?: string | null; deal_id?: string | null },
  locations: Map<string, EntityLoc>,
): EntityLoc | null {
  const id = activity.lead_id || activity.contact_id || activity.account_id || activity.deal_id;
  if (!id) return null;
  return locations.get(id) ?? null;
}
