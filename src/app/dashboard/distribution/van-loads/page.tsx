'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, fmtDate } from '../../../../components/distribution/Atoms';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

const STATUSES = ['open', 'reconciled', 'closed'];

function loadStatusColor(status: string): 'gray' | 'green' | 'red' | 'amber' | 'blue' {
  switch ((status || '').toLowerCase()) {
    case 'open': return 'amber';
    case 'reconciled': return 'blue';
    case 'closed': return 'green';
    default: return 'gray';
  }
}

const t = (l: any, k: string): number => Number(l?.totals?.[k]) || 0;

export default function VanLoadsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [loadDate, setLoadDate] = useState('');
  const [users, setUsers] = useState<Record<string, string>>({});
  const [dists, setDists] = useState<Record<string, string>>({});

  // Lookup maps so we can show rep + distributor names, not raw UUIDs.
  useEffect(() => {
    api.getUsers({ limit: '500' }).then((r: any) => {
      const arr = Array.isArray(r) ? r : (r?.data || []);
      const m: Record<string, string> = {};
      arr.forEach((u: any) => { m[u.id] = u.name || u.full_name || u.email || u.id; });
      setUsers(m);
    }).catch(() => {});
    api.getDistributors().then((r: any) => {
      const arr = r?.data || r || [];
      const m: Record<string, string> = {};
      arr.forEach((d: any) => { m[d.id] = d.name || d.code || d.id; });
      setDists(m);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      if (loadDate) params.load_date = loadDate;
      const r: any = await api.getVanLoads(Object.keys(params).length ? params : undefined);
      setItems(r?.data || r || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [status, loadDate]);
  useEffect(() => { load(); }, [load]);

  const repName = useCallback((l: any) => l.user_name || users[l.user_id] || l.user_id || '—', [users]);
  const distName = useCallback((l: any) => l.distributor_name || dists[l.distributor_id] || l.distributor_id || '—', [dists]);

  const loadVal = useCallback((l: any, key: string): unknown => {
    switch (key) {
      case 'date': return l.load_date;
      case 'rep': return repName(l);
      case 'distributor': return distName(l);
      case 'status': return l.status;
      case 'loaded': return t(l, 'loaded');
      case 'sold': return t(l, 'sold');
      case 'returned': return t(l, 'returned');
      case 'damaged': return t(l, 'damaged');
      default: return l[key];
    }
  }, [repName, distName]);

  const { sorted, sort, toggle } = useTableSort<any>(items, loadVal, { key: 'date', dir: 'desc' });
  const { pageItems, bar } = usePagination(sorted);

  const selStyle: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 };

  return (
    <div>
      <PageHeader
        title="Van Sales"
        subtitle="Van / route loads — stock loaded out, sold, returned and damaged, reconciled at day-end."
        right={<a href="/dashboard/distribution/van-loads/new"><Btn>+ New load</Btn></a>}
      />

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Load date</div>
            <input type="date" value={loadDate} onChange={(e) => setLoadDate(e.target.value)} style={selStyle} />
          </div>
          {(status || loadDate) && <Btn variant="ghost" onClick={() => { setStatus(''); setLoadDate(''); }}>Clear</Btn>}
        </div>
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th><SortLabel label="Date" sortKey="date" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Rep" sortKey="rep" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Distributor" sortKey="distributor" sort={sort} onToggle={toggle} /></Th>
            <Th><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Loaded" sortKey="loaded" sort={sort} onToggle={toggle} align="right" /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Sold" sortKey="sold" sort={sort} onToggle={toggle} align="right" /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Returned" sortKey="returned" sort={sort} onToggle={toggle} align="right" /></Th>
            <Th style={{ textAlign: 'right' }}><SortLabel label="Damaged" sortKey="damaged" sort={sort} onToggle={toggle} align="right" /></Th>
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              pageItems.map((l) => (
                <tr key={l.id}>
                  <Td style={{ fontWeight: 700 }}><a href={`/dashboard/distribution/van-loads/${l.id}`} style={{ color: 'var(--text)' }}>{l.load_date ? fmtDate(l.load_date).split(',')[0] : '—'}</a></Td>
                  <Td><a href={`/dashboard/distribution/van-loads/${l.id}`} style={{ color: 'var(--primary)' }}>{repName(l)}</a></Td>
                  <Td>{distName(l)}</Td>
                  <Td><Pill color={loadStatusColor(l.status)}>{l.status || 'open'}</Pill></Td>
                  <Td style={{ textAlign: 'right' }}>{t(l, 'loaded').toLocaleString('en-IN')}</Td>
                  <Td style={{ textAlign: 'right' }}>{t(l, 'sold').toLocaleString('en-IN')}</Td>
                  <Td style={{ textAlign: 'right' }}>{t(l, 'returned').toLocaleString('en-IN')}</Td>
                  <Td style={{ textAlign: 'right', color: t(l, 'damaged') > 0 ? 'var(--primary)' : undefined }}>{t(l, 'damaged').toLocaleString('en-IN')}</Td>
                </tr>
              ))}
            {!loading && !items.length && <tr><Td colSpan={8 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No van loads yet.</Td></tr>}
          </tbody>
        </table>
      </Card>
      {bar}
    </div>
  );
}
