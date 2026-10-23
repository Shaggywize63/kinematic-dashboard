'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { crmActivities } from '../../../lib/crmApi';
import type { DetailActivity } from './format';

/**
 * Status changes and deletes for a lead's activities — the same calls the old
 * ActivityTimeline made (PATCH status, soft DELETE), shared by the timeline and
 * the "Up next" card so both behave identically.
 */
export function useActivityActions(onChanged: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatus = async (a: DetailActivity, status: 'open' | 'in_progress' | 'completed' | 'cancelled') => {
    setBusyId(a.id);
    try {
      const payload: Record<string, unknown> = { status };
      if (status === 'completed') payload.completed_at = new Date().toISOString();
      // Reopening must clear the completion stamp or the row still reads as done.
      if (status === 'open') payload.completed_at = null;
      await crmActivities.update(a.id, payload as never);
      toast.success(status === 'completed' ? 'Marked complete' : status === 'open' ? 'Reopened' : `Marked ${status.replace('_', ' ')}`);
      onChanged();
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a: DetailActivity) => {
    setBusyId(a.id);
    try {
      await crmActivities.remove(a.id);
      toast.success('Activity deleted');
      onChanged();
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return { busyId, setStatus, remove };
}
