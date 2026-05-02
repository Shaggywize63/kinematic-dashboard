'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';
import { Card, PageHeader, Pill, Th, Td, Btn, inr, fmtDate, statusColor } from '../../../../components/distribution/Atoms';

export default function ReturnsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (status) params.status = status;
    try { const r: any = await api.getDistReturns(params); setItems(r?.data || r || []); } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [status]);

  const approve = async (id: string) => { if (!confirm('Approve this return? A credit-note ledger entry will post.')) return; try { await api.approveDistReturn(id); await load(); } catch (e: any) { alert(e.message); } };
  const reject = async (id: string) => { const r = prompt('Rejection reason?'); if (r === null) return; try { await api.rejectDistReturn(id, r); await load(); } catch (e: any) { alert(e.message); } };

  return (
    <div>
      <PageHeader title="Returns" subtitle="Photo + reason required. Supervisor-gated above threshold. Credit-note posts on approval." />

      <Card style={{ marginBottom: 22 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}>
          <option value="">All status</option>
          <option value="requested">requested</option>
          <option value="supervisor_approved">supervisor_approved</option>
          <option value="credited">credited</option>
          <option value="rejected">rejected</option>
        </select>
      </Card>

      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Th>Return #</Th><Th>Outlet</Th><Th>Invoice</Th><Th>Reason</Th><Th>Photos</Th><Th>Created</Th><Th>Supervisor</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Value</Th><Th />
          </tr></thead>
          <tbody>
            {loading ? <tr><Td>Loading…</Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td><Td><span /></Td></tr> :
              items.map((r) => (
                <tr key={r.id}>
                  <Td style={{ fontWeight: 700 }}>{r.return_no}</Td>
                  <Td>{r.outlet_id?.slice(0, 8)}…</Td>
                  <Td>{r.original_invoice_id?.slice(0, 8)}…</Td>
                  <Td><Pill color="amber">{r.reason_code}</Pill></Td>
                  <Td>{Array.isArray(r.photo_urls) ? r.photo_urls.length : 0}</Td>
                  <Td>{fmtDate(r.created_at)}</Td>
                  <Td>{r.requires_supervisor ? <Pill color="red">required</Pill> : <Pill color="gray">no</Pill>}</Td>
                  <Td><Pill color={statusColor(r.status)}>{r.status}</Pill></Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{inr(r.total_value)}</Td>
                  <Td>
                    {['requested', 'supervisor_approved'].includes(r.status) && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn onClick={() => approve(r.id)}>Approve</Btn>
                        <Btn variant="danger" onClick={() => reject(r.id)}>Reject</Btn>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            {!loading && !items.length && <tr><Td colSpan={10 as any} style={{ textAlign: 'center', color: 'var(--text-dim)' }}>No returns.</Td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
