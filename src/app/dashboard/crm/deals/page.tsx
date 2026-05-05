'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmDeals } from '../../../../lib/crmApi';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { Deal } from '../../../../types/crm';
import DealsTable from '../../../../components/crm/DealsTable';
import { getStoredUser, canAccess } from '../../../../lib/auth';

export default function DealsListPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  const reload = async () => {
    setLoading(true);
    try { const r = await crmDeals.list(range); setDeals(r.data || []); }
    catch (e: any) { toast.error(e.message || 'Failed to load'); } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  useEffect(() => {
    const user = getStoredUser();
    if (user && canAccess(user.role, ['sub_admin'])) setIsAdmin(true);
  }, []);

  const filtered = deals.filter((d) => {
    if (q && !`${d.name} ${d.account_name || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (status && d.status !== status) return false;
    return true;
  });

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected((s) => filtered.every((d) => s.has(d.id)) ? new Set() : new Set(filtered.map((d) => d.id)));
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} deal${selected.size > 1 ? 's' : ''}? This soft-deletes them and they can be restored from the database if needed.`)) return;
    setBulkBusy(true);
    let ok = 0, failed = 0;
    for (const id of Array.from(selected)) {
      try { await crmDeals.remove(id); ok++; } catch { failed++; }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (failed === 0) toast.success(`Deleted ${ok} deal${ok > 1 ? 's' : ''}`);
    else toast.error(`Deleted ${ok}, ${failed} failed`);
    reload();
  };

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Revenue opportunities progressing through your sales pipeline. Each deal tracks value, expected close date, and AI-powered win probability so you can forecast accurately and focus effort where it matters most. Use the Pipeline view for a visual kanban of open deals.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="Search deals..." value={q} onChange={(e) => setQ(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
            <option value="">All</option><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option>
          </select>
          {isAdmin && selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>· {selected.size} selected</span>
              <button
                onClick={bulkDelete}
                disabled={bulkBusy}
                style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {bulkBusy ? 'Deleting…' : `🗑 Delete ${selected.size}`}
              </button>
            </>
          )}
        </div>
        <Link href="/dashboard/crm/deals/new" style={{ background: 'var(--primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>+ New Deal</Link>
      </div>
      <DealsTable
        deals={filtered}
        loading={loading}
        onAssign={async (dealId, userId) => {
          await crmDeals.update(dealId, { owner_id: userId } as any);
          toast.success(userId ? 'Deal reassigned' : 'Deal unassigned');
          reload();
        }}
        selected={isAdmin ? selected : undefined}
        onToggle={isAdmin ? toggle : undefined}
        onToggleAll={isAdmin ? toggleAll : undefined}
      />
    </div>
  );
}
