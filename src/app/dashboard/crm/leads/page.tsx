'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmLeads, crmLeadSources, crmSettings } from '../../../../lib/crmApi';
import api from '../../../../lib/api';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import { useCrmLocationFilter } from '../../../../stores/crmLocationFilterStore';
import type { Lead, LeadSource } from '../../../../types/crm';
import LeadsTable from '../../../../components/crm/LeadsTable';
import LeadFilters, { type LeadFiltersValue } from '../../../../components/crm/LeadFilters';

type UserOption = { id: string; name: string };

export default function LeadsListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [filters, setFilters] = useState<LeadFiltersValue>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isB2C, setIsB2C] = useState(false);
  const assignMenuRef = useRef<HTMLDivElement>(null);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));
  const { state: locState, city: locCity } = useCrmLocationFilter();

  const reload = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      if (locState) params.state = locState;
      if (locCity) params.city = locCity;
      const [l, s] = await Promise.allSettled([crmLeads.list(params), crmLeadSources.list()]);
      if (l.status === 'fulfilled') setLeads(l.value.data || []);
      if (s.status === 'fulfilled') setSources(s.value.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [range.from, range.to, locState, locCity]);

  useEffect(() => {
    crmSettings.get().then((r) => {
      if (r.data?.business_type === 'b2c') setIsB2C(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!showAssignMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (assignMenuRef.current && !assignMenuRef.current.contains(e.target as Node)) setShowAssignMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAssignMenu]);

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
    const parsed = userRaw ? (() => { try { return JSON.parse(userRaw); } catch { return null; } })() : null;
    const userId = parsed?.id || parsed?.user_id || parsed?.userId;
    if (!userId) return toast.error('Could not determine your user ID');
    try {
      await crmLeads.bulkAssign({ lead_ids: Array.from(selected), owner_id: userId });
      toast.success(`Assigned ${selected.size} leads to you`);
      setSelected(new Set());
      reload();
    } catch (e: any) { toast.error(e.message || 'Bulk assign failed'); }
  };

  const loadUsers = async () => {
    if (users.length > 0 || usersLoading) return;
    setUsersLoading(true);
    try {
      const r = await api.getUsers() as any;
      const list: UserOption[] = (r.data || r || []).map((u: any) => ({
        id: u.id,
        name: u.name || u.full_name || u.email || 'User',
      }));
      setUsers(list);
    } catch { setUsers([]); } finally { setUsersLoading(false); }
  };

  const bulkAssignTo = async (userId: string, userName: string) => {
    try {
      await crmLeads.bulkAssign({ lead_ids: Array.from(selected), owner_id: userId });
      toast.success(`Assigned ${selected.size} leads to ${userName}`);
      setSelected(new Set());
      setShowAssignMenu(false);
      reload();
    } catch (e: any) { toast.error(e.message || 'Bulk assign failed'); }
  };

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Track and nurture potential customers before they become deals. Use AI scoring to prioritise hot leads, qualify them with your team, and convert top prospects to contacts, accounts, and deals in one click. Bulk-import from CSV or capture individually.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{filtered.length} leads</span>
          {(locState || locCity) && (
            <span style={{ fontSize: 11, color: 'var(--primary)', background: 'var(--s3)', padding: '3px 8px', borderRadius: 6 }}>
              📍 {[locCity, locState].filter(Boolean).join(', ')}
            </span>
          )}
          {selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>• {selected.size} selected</span>
              <button
                onClick={bulkAssignToMe}
                style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
              >
                Assign to me
              </button>
              <div ref={assignMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => { setShowAssignMenu((m) => !m); loadUsers(); }}
                  style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
                >
                  Assign to...
                </button>
                {showAssignMenu && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 200, minWidth: 180, maxHeight: 220, overflowY: 'auto' }}>
                    {usersLoading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>Loading users...</div>}
                    {!usersLoading && users.length === 0 && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>No users found</div>}
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => bulkAssignTo(u.id, u.name)}
                        style={{ width: '100%', display: 'block', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
                      >
                        {u.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/crm/leads/import" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Import</Link>
          <Link href="/dashboard/crm/leads/new" style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Lead</Link>
        </div>
      </div>
      <LeadFilters value={filters} onChange={setFilters} sources={sources.map((s) => ({ id: s.id, name: s.name }))} />
      <LeadsTable
        leads={filtered}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        loading={loading}
        isB2C={isB2C}
        onAssign={async (leadId, userId) => {
          await crmLeads.update(leadId, { owner_id: userId } as any);
          toast.success(userId ? 'Lead reassigned' : 'Lead unassigned');
          reload();
        }}
      />
    </div>
  );
}
