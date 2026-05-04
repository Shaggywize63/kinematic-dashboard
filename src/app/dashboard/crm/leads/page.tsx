'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmLeads, crmLeadSources } from '../../../../lib/crmApi';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Lead, LeadSource } from '../../../../types/crm';
import LeadsTable from '../../../../components/crm/LeadsTable';
import LeadFilters, { type LeadFiltersValue } from '../../../../components/crm/LeadFilters';

export default function LeadsListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [filters, setFilters] = useState<LeadFiltersValue>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  const reload = async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.allSettled([crmLeads.list(range), crmLeadSources.list()]);
      if (l.status === 'fulfilled') setLeads(l.value.data || []);
      if (s.status === 'fulfilled') setSources(s.value.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  const filtered = useMemo(() => {
    const q = (filters.q || '').toLowerCase();
    return leads.filter((l) => {
      if (q && !`${l.full_name || ''} ${l.first_name || ''} ${l.last_name || ''} ${l.email || ''} ${l.company || ''}`.toLowerCase().includes(q)) return false;
      if (filters.status && l.status !== filters.status) return false;
      if (filters.grade && l.score_grade !== filters.grade) return false;
      if (filters.source && l.source_id !== filters.source) return false;
      if (filters.owner && l.owner_id !== filters.owner) return false;
      return true;
    });
  }, [leads, filters]);

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected((s) => filtered.every((l) => s.has(l.id)) ? new Set() : new Set(filtered.map((l) => l.id)));
  };

  const bulkAssignToMe = async () => {
    const userRaw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
    const userId = userRaw ? JSON.parse(userRaw)?.id : null;
    if (!userId) return toast.error('No user id available');
    try {
      await crmLeads.bulkAssign({ lead_ids: Array.from(selected), owner_id: userId });
      toast.success(`Assigned ${selected.size} leads to you`);
      setSelected(new Set());
      reload();
    } catch (e: any) { toast.error(e.message || 'Bulk assign failed'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{filtered.length} leads</span>
          {selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>• {selected.size} selected</span>
              <button onClick={bulkAssignToMe} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Assign to me</button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/crm/leads/import" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Import</Link>
          <Link href="/dashboard/crm/leads/new" style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Lead</Link>
        </div>
      </div>
      <LeadFilters value={filters} onChange={setFilters} sources={sources.map((s) => ({ id: s.id, name: s.name }))} />
      <LeadsTable leads={filtered} selected={selected} onToggle={toggle} onToggleAll={toggleAll} loading={loading} />
    </div>
  );
}
