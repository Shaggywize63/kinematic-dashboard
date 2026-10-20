'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmLeads, type LeadUpdate } from '../../../lib/crmApi';

/**
 * The lead's free-text updates (notes). Pairs with `crm_lead_updates`: every entry stamps
 * author + time, the newest is denormalised onto crm_leads.latest_update, and a new entry
 * invalidates the NBA cache server-side — so `onChanged` lets the page refresh the lead row
 * and drop its cached suggestion.
 */
export function useLeadUpdates(leadId: string, onChanged: () => void) {
  const [items, setItems] = useState<LeadUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const r = await crmLeads.updates(leadId, { limit: 100 });
      setItems(r.data || []);
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Failed to load updates');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const add = async (body: string): Promise<boolean> => {
    try {
      const r = await crmLeads.addUpdate(leadId, { body });
      // Prepend rather than reload — instant, and matches the newest-first order of the GET.
      setItems((prev) => [r.data, ...prev]);
      toast.success('Update added');
      onChanged();
      return true;
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Failed to save update');
      return false;
    }
  };

  const edit = async (updateId: string, body: string): Promise<boolean> => {
    const text = body.trim();
    if (!text) return false;
    try {
      const r = await crmLeads.editUpdate(leadId, updateId, { body: text });
      setItems((prev) => prev.map((it) => (it.id === updateId ? r.data : it)));
      toast.success('Update edited');
      onChanged();
      return true;
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Failed to edit update');
      return false;
    }
  };

  const remove = async (updateId: string) => {
    try {
      await crmLeads.deleteUpdate(leadId, updateId);
      setItems((prev) => prev.filter((it) => it.id !== updateId));
      toast.success('Update deleted');
      onChanged();
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Failed to delete update');
    }
  };

  return { items, loading, add, edit, remove };
}
