'use client';
// Owner picker data for the account / deal edit modals: whether this user may change the owner and the
// assignable people to choose from. Loads only while the modal is open and only for people who may use it.
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from './useAuth';
import { canChangeRecordOwner, type RecordOwnerUser } from '../lib/recordOwnerAccess';
import type { UserOption } from '../components/crm/shared/UserSearchSelect';

export function useRecordOwnerPicker(open: boolean): { canChange: boolean; users: UserOption[] } {
  const { user } = useAuth();
  const canChange = canChangeRecordOwner(user as unknown as RecordOwnerUser | null);
  const [users, setUsers] = useState<UserOption[]>([]);
  useEffect(() => {
    if (!open || !canChange) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getUsers({ limit: '500', scope: 'assignable' }) as { data?: Array<{ id: string; name?: string; full_name?: string; email?: string }> };
        if (cancelled) return;
        setUsers((r?.data || []).map((x) => ({ id: x.id, name: x.name || x.full_name || x.email || 'User' })));
      } catch { if (!cancelled) setUsers([]); }
    })();
    return () => { cancelled = true; };
  }, [open, canChange]);
  return { canChange, users };
}
