'use client';
// Which rupee targets (Sales / Collection) this client has switched on. `types` is empty — and stays empty — for a
// client without the feature or when the call fails, so every caller can simply render nothing new in that case.

import { useEffect, useState } from 'react';
import { crmTargets } from './crmApi';
import type { TargetType } from '../types/crm';

const KINDS = ['sales', 'collection'];

export function useTargetTypes(): { types: TargetType[]; loaded: boolean } {
  const [types, setTypes] = useState<TargetType[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let off = false;
    crmTargets.types()
      .then((r) => {
        const list = r?.data?.types;
        if (!off) setTypes(Array.isArray(list) ? list.filter((t) => t && KINDS.includes(t.key)) : []);
      })
      .catch(() => { if (!off) setTypes([]); })
      .finally(() => { if (!off) setLoaded(true); });
    return () => { off = true; };
  }, []);
  return { types, loaded };
}
