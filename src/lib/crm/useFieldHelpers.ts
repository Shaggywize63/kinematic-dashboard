'use client';
// Field-override helpers for a CRM list page (deals / accounts): the same hide / relabel rules the forms use, read from
// GET /crm/settings once per page. `loaded` lets a list defer the columns an admin may have hidden, so a hidden column
// never flashes in before the settings arrive (the contract in CLAUDE.md).

import { useEffect, useMemo, useState } from 'react';
import { crmSettings } from '../crmApi';
import { buildFieldHelpers, extractFieldOverrides, type FieldHelpers, type FieldOverrides } from '../crmFieldOverrides';

export function useFieldHelpers(entity: 'deal' | 'account' | 'contact' | 'lead'): { fields: FieldHelpers; loaded: boolean } {
  const [overrides, setOverrides] = useState<FieldOverrides>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    crmSettings.get()
      .then((r) => { if (alive) setOverrides(extractFieldOverrides(r.data)); })
      .catch(() => { /* keep the defaults: every field shows */ })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);
  const fields = useMemo(() => buildFieldHelpers(overrides, entity), [overrides, entity]);
  return { fields, loaded };
}
