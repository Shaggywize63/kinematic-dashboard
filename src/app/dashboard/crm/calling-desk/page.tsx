'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmDesk } from '../../../../lib/crmApi';
import type { DeskCallTask, DeskCallStatus, DeskDaySummary } from '../../../../lib/crmApi';
import { istToday, istDate, istTime } from '../../../../lib/istTime';

/**
 * Calling Desk — the pharma daily tele-calling workflow (Maa Mansha Pharma).
 * A desk operator opens today's auto-generated calling list and dispositions
 * each customer with one of the 3 statuses. "Order Taken" captures the order
 * value, which flows to the lightweight order ledger (sales + RFM + alerts).
 * Previous days stay intact and browsable via the date picker.
 *
 * All times shown in IST.
 */

// The client's fixed 3-status wording (mirrors crm_settings.config.call_statuses
// written by onboard-maa-mansha.ts; admins can relabel there).
const STATUS_META: Record<Exclude<DeskCallStatus, 'pending'>, { label: string; short: string; color: string; bg: string }> = {
  order_taken:   { label: 'Call Connected – Order Taken',   short: 'Order Taken',   color: '#16a34a', bg: '#dcfce7' },
  order_pending: { label: 'Call Connected – Order Pending', short: 'Order Pending', color: '#b45309', bg: '#fef3c7' },
  no_order:      { label: 'No Order Today',                 short: 'No Order',      color: '#6b7280', bg: '#f3f4f6' },
};
const inr = (n: number | null | undefined) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function CallingDeskPage() {
  const [date, setDate] = useState(istToday);
  const [statusFilter, setStatusFilter] = useState<'' | DeskCallStatus>('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<DeskCallTask[]>([]);
  const [summary, setSummary] = useState<DeskDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<Record<string, string>>({});

  const load = useMemo(() => () => {
    setLoading(true);
    Promise.all([
      crmDesk.callList({ date, status: statusFilter || undefined, q: q || undefined, limit: 500 }),
      crmDesk.summary(date),
    ])
      .then(([list, sum]) => {
        setRows(list.data?.rows ?? []);
        setSummary(sum.data ?? null);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load calling list'))
      .finally(() => setLoading(false));
  }, [date, statusFilter, q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      crmDesk.callList({ date, status: statusFilter || undefined, q: q || undefined, limit: 500 }),
      crmDesk.summary(date),
    ])
      .then(([list, sum]) => { if (cancelled) return; setRows(list.data?.rows ?? []); setSummary(sum.data ?? null); })
      .catch((e: any) => { if (!cancelled) toast.error(e?.message || 'Failed to load calling list'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, statusFilter, q]);

  async function generate() {
    setGenerating(true);
    try {
      const r = await crmDesk.generate(date);
      toast.success(`List ready — ${r.data.created} new, ${r.data.existing} already on today's list (${r.data.customers} customers).`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not generate the list');
    } finally { setGenerating(false); }
  }

  async function setStatus(task: DeskCallTask, status: DeskCallStatus) {
    let order_value: number | null = null;
    if (status === 'order_taken') {
      const raw = orderDraft[task.id];
      const parsed = Number(raw);
      if (!raw || isNaN(parsed) || parsed < 0) { toast.error('Enter the order value first'); return; }
      order_value = parsed;
    }
    setSavingId(task.id);
    try {
      const r = await crmDesk.setStatus(task.id, { status, order_value });
      setRows((prev) => prev.map((t) => (t.id === task.id ? r.data.task : t)));
      crmDesk.summary(date).then((s) => setSummary(s.data ?? null)).catch(() => {});
      setOrderDraft((d) => { const n = { ...d }; delete n[task.id]; return n; });
    } catch (e: any) {
      toast.error(e?.message || 'Could not update status');
    } finally { setSavingId(null); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Calling Desk</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted, #6b7280)', fontSize: 13 }}>
            Daily customer calling list — {istDate(date)} (IST)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} max={istToday()} onChange={(e) => setDate(e.target.value || istToday())}
            style={inputStyle} />
          <button onClick={generate} disabled={generating || date !== istToday()}
            title={date !== istToday() ? 'You can only generate today’s list' : 'Build today’s calling list from the customer master'}
            style={{ ...btnStyle, opacity: generating || date !== istToday() ? 0.6 : 1 }}>
            {generating ? 'Generating…' : 'Generate Today’s List'}
          </button>
          <Link href="/dashboard/crm/calling-desk/reports" style={{ ...btnStyle, background: '#fff', color: 'var(--primary, #2563eb)', textDecoration: 'none' }}>
            Reports →
          </Link>
        </div>
      </div>

      <SummaryStrip summary={summary} loading={loading} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={inputStyle}>
          <option value="">All statuses</option>
          <option value="pending">Not called yet</option>
          <option value="order_taken">Order Taken</option>
          <option value="order_pending">Order Pending</option>
          <option value="no_order">No Order</option>
        </select>
        <input placeholder="Search customer…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, minWidth: 220 }} />
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 820 }}>
            <thead>
              <tr>
                {['Customer', 'Mobile', 'Status', 'Order Value', 'Called (IST)', 'Action'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                  No customers on this day&rsquo;s list. {date === istToday() ? 'Click “Generate Today’s List”.' : ''}
                </td></tr>
              ) : rows.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={tdStyle}><span style={{ fontWeight: 600 }}>{t.customer_name || '—'}</span></td>
                  <td style={tdStyle}>{t.customer_phone || '—'}</td>
                  <td style={tdStyle}><StatusBadge status={t.status} /></td>
                  <td style={tdStyle}>{t.status === 'order_taken' ? inr(t.order_value) : '—'}</td>
                  <td style={tdStyle}>{t.called_at ? istTime(t.called_at) : '—'}</td>
                  <td style={{ ...tdStyle, minWidth: 320 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="number" min={0} placeholder="₹ value"
                        value={orderDraft[t.id] ?? (t.status === 'order_taken' ? String(t.order_value ?? '') : '')}
                        onChange={(e) => setOrderDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                        style={{ ...inputStyle, width: 110 }}
                      />
                      <button disabled={savingId === t.id} onClick={() => setStatus(t, 'order_taken')} style={pill('#16a34a')}>Order Taken</button>
                      <button disabled={savingId === t.id} onClick={() => setStatus(t, 'order_pending')} style={pill('#b45309')}>Pending</button>
                      <button disabled={savingId === t.id} onClick={() => setStatus(t, 'no_order')} style={pill('#6b7280')}>No Order</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DeskCallStatus }) {
  if (status === 'pending') return <span style={{ ...badge, color: '#6b7280', background: '#f3f4f6' }}>Not called</span>;
  const m = STATUS_META[status];
  return <span style={{ ...badge, color: m.color, background: m.bg }} title={m.label}>{m.short}</span>;
}

function SummaryStrip({ summary, loading }: { summary: DeskDaySummary | null; loading: boolean }) {
  const cells = [
    { label: 'Assigned', value: summary?.assigned ?? 0 },
    { label: 'Called', value: summary?.called ?? 0 },
    { label: 'Order Taken', value: summary?.order_taken ?? 0, color: '#16a34a' },
    { label: 'Order Pending', value: summary?.order_pending ?? 0, color: '#b45309' },
    { label: 'No Order', value: summary?.no_order ?? 0, color: '#6b7280' },
    { label: 'Orders Value', value: `₹${Number(summary?.orders_value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: '#2563eb' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
      {cells.map((c) => (
        <div key={c.label} style={cardStyle}>
          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{c.label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: (c as any).color || '#111827', opacity: loading ? 0.4 : 1 }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' };
const btnStyle: React.CSSProperties = { padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--primary, #2563eb)', color: '#fff', cursor: 'pointer' };
const cardStyle: React.CSSProperties = { background: 'var(--card, #fff)', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#111827', verticalAlign: 'middle' };
const badge: React.CSSProperties = { padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
const pill = (c: string): React.CSSProperties => ({ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#fff', background: c, border: 'none', cursor: 'pointer' });
