'use client';
/**
 * Built-in lead field gate for analytics surfaces.
 *
 * The admin hides built-in lead fields (city, state, country, company, ...) in
 * Settings -> Custom Fields; every render site of such a field must honour it
 * (dashboard CLAUDE.md, "Built-in field overrides"). Forms use
 * `buildFieldHelpers(overrides, 'lead', scope)` with the lead's own business
 * type. A widget or report AGGREGATES leads of both types, so it cannot show a
 * field for some leads and hide it for others: `isHidden(key)` here is true when
 * the field is hidden for ANY lead type (universal, B2B or B2C override).
 *
 * Usage: gate the rows / columns / widgets, and defer rendering the gated part
 * until `didLoad`, otherwise the page races /crm/settings and briefly shows a
 * field the admin had hidden.
 */
import { useEffect, useState } from 'react';
import { crmSettings } from '../crmApi';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../crmFieldOverrides';
import { blockedBy, isLeadFieldHidden } from './leadFieldGate';

// One settings read is shared by every gated widget on a page.
let inflight: { at: number; promise: Promise<FieldOverrides> } | null = null;
const TTL_MS = 30_000;

export function loadLeadFieldOverrides(force = false): Promise<FieldOverrides> {
  if (!force && inflight && Date.now() - inflight.at < TTL_MS) return inflight.promise;
  const promise = crmSettings.get()
    .then((r) => extractFieldOverrides(r?.data))
    // A failed read leaves the form-side convention: nothing hidden.
    .catch(() => ({} as FieldOverrides));
  inflight = { at: Date.now(), promise };
  return promise;
}

export interface LeadFieldGate {
  /** False until /crm/settings has answered: defer rendering gated rows until then. */
  didLoad: boolean;
  isHidden: (key: string) => boolean;
  /** The admin's label for a built-in lead field (universal override), else the default. */
  labelFor: (key: string, defaultLabel: string) => string;
  /** Hidden built-in fields that block an analytics surface (see GATED_FIELDS_BY_SURFACE). */
  blockedBy: (surface: string) => string[];
}

export function useLeadFieldGate(): LeadFieldGate {
  const [overrides, setOverrides] = useState<FieldOverrides | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadLeadFieldOverrides().then((o) => { if (alive) setOverrides(o); });
    return () => { alive = false; };
  }, []);
  return {
    didLoad: overrides !== undefined,
    isHidden: (key) => isLeadFieldHidden(overrides, key),
    labelFor: (key, d) => buildFieldHelpers(overrides, 'lead', null).labelFor(key, d),
    blockedBy: (surface) => blockedBy(overrides, surface),
  };
}
