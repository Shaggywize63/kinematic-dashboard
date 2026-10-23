'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { TelecallerPerfRow, TelecallerPerfDaily } from '../../../../../types/crm';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { useTableSort, SortLabel } from '../../../../../lib/tableSort';

/**
 * Telecaller Performance — the Kinematic replacement for the Excel "Call
 * Tracker". For each telecaller it shows calls made / connected / interested /
 * not-interested / follow-ups + scheme ₹ over the chosen window, with a daily
 * trend table mirroring the old "Monthly Performance" sheet. Owner-scoped per
 * telecaller; a manager sees their subtree, an admin the whole client.
 */

type Totals = Omit<TelecallerPerfRow, 'user_id' | 'user_name'>;

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(today) };
}

const rowVal = (r: TelecallerPerfRow, key: string): unknown =>
  (r as unknown as Record<string, unknown>)[key];

export default function TelecallerPerformancePage() {
  const [range, setRange] = useState(defaultRange);
  const [rows, setRows] = useState<TelecallerPerfRow[]>([]);
  const [daily, setDaily] = useState<TelecallerPerfDaily[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crmAnalytics.telecallerPerformance(range)
      .then((r) => {
        if (cancelled) return;
        // Endpoint returns the payload directly (no { success, data } envelope);
        // tolerate both shapes.
        const p = (r as unknown as {
          rows?: TelecallerPerfRow[]; daily?: TelecallerPerfDaily[]; totals?: Totals;
          data?: { rows?: TelecallerPerfRow[]; daily?: TelecallerPerfDaily[]; totals?: Totals };
        });
        setRows(p.rows ?? p.data?.rows ?? []);
        setDaily(p.daily ?? p.data?.daily ?? []);
        setTotals(p.totals ?? p.data?.totals ?? null);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load telecaller performance'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, cityKey]);

  const { sorted, sort, toggle } = useTableSort<TelecallerPerfRow>(rows, rowVal);
  const connectRate = totals && totals.calls > 0 ? totals.connected / totals.calls : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header range={range} onChange={setRange} />
      <KpiStrip totals={totals} connectRate={connectRate} loading={loading} />

      <TableCard title="Telecaller Wise">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                <Th sticky><SortLabel label="Telecaller" sortKey="user_name" sort={sort} onToggle={toggle} /></Th>
                <Th align="right"><SortLabel label="Leads" sortKey="leads_assigned" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Calls" sortKey="calls" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Connected" sortKey="connected" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Interested" sortKey="interested" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Not Interested" sortKey="not_interested" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Follow-ups" sortKey="follow_ups" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Conversions" sortKey="conversions" sort={sort} onToggle={toggle} align="right" /></Th>
                <Th align="right"><SortLabel label="Scheme ₹" sortKey="scheme_amount" sort={sort} onToggle={toggle} align="right" /></Th>
              </tr>
            </thead>
            <tbody>
              {totals && <TotalRow t={totals} />}
              {loading && rows.length === 0 && <tr><Td colSpan={9} center dim>Loading…</Td></tr>}
              {!loading && rows.length === 0 && <tr><Td colSpan={9} center dim>No telecaller activity for the selected window.</Td></tr>}
              {sorted.map((r) => (
                <tr key={r.user_id} style={{ fontWeight: 600 }}>
                  <Td sticky bold>{r.user_name}</Td>
                  <Td align="right">{r.leads_assigned}</Td>
                  <Td align="right" bold>{r.calls}</Td>
                  <Td align="right" tone="#10b981">{r.connected}</Td>
                  <Td align="right" tone="#3E9EFF">{r.interested}</Td>
                  <Td align="right" tone="#ef4444">{r.not_interested}</Td>
                  <Td align="right" tone="#F59E0B">{r.follow_ups}</Td>
                  <Td align="right" tone="#A855F7">{r.conversions}</Td>
                  <Td align="right" bold>{fmtInr(r.scheme_amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableCard>

      <TableCard title="Day-wise Trend">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                <Th>Date</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Connected</Th>
                <Th align="right">Interested</Th>
                <Th align="right">Scheme ₹</Th>
              </tr>
            </thead>
            <tbody>
              {!loading && daily.length === 0 && <tr><Td colSpan={5} center dim>No calls logged in this window.</Td></tr>}
              {daily.map((d) => (
                <tr key={d.date} style={{ fontWeight: 600 }}>
                  <Td>{fmtDate(d.date)}</Td>
                  <Td align="right" bold>{d.calls}</Td>
                  <Td align="right" tone="#10b981">{d.connected}</Td>
                  <Td align="right" tone="#3E9EFF">{d.interested}</Td>
                  <Td align="right">{fmtInr(d.scheme_amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableCard>
    </div>
  );
}

// ── Header + range filter ──────────────────────────────────────────

function Header({ range, onChange }: { range: { from: string; to: string }; onChange: (r: { from: string; to: string }) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Telecaller Performance</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          Calls, connects, interest and scheme ₹ per telecaller — the Call Tracker, live.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <DateInput label="From" value={range.from} onChange={(v) => onChange({ ...range, from: v })} />
        <DateInput label="To"   value={range.to}   onChange={(v) => onChange({ ...range, to: v })} />
      </div>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }} />
    </label>
  );
}

// ── KPI strip ──────────────────────────────────────────────────────

function KpiStrip({ totals, connectRate, loading }: { totals: Totals | null; connectRate: number; loading: boolean }) {
  const items = useMemo(() => [
    { label: 'Calls',          value: totals ? String(totals.calls) : '—',          accent: '#3E9EFF' },
    { label: 'Connected',      value: totals ? String(totals.connected) : '—',      accent: '#10B981' },
    { label: 'Connect Rate',   value: totals ? `${(connectRate * 100).toFixed(0)}%` : '—', accent: '#06B6D4' },
    { label: 'Interested',     value: totals ? String(totals.interested) : '—',     accent: '#A855F7' },
    { label: 'Follow-ups',     value: totals ? String(totals.follow_ups) : '—',     accent: '#F59E0B' },
    { label: 'Conversions',    value: totals ? String(totals.conversions) : '—',    accent: '#A855F7' },
    { label: 'Scheme ₹',       value: totals ? fmtInr(totals.scheme_amount) : '—',  accent: '#EC4899' },
  ], [totals, connectRate]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
      {items.map((k) => (
        <div key={k.label} style={{
          background: 'var(--s2)', border: '1px solid var(--border)', borderLeft: `3px solid ${k.accent}`,
          borderRadius: 12, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{k.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{loading ? '—' : k.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Table atoms ────────────────────────────────────────────────────

function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', background: '#1e88e5', color: '#fff', fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 13 }}>{title}</div>
      {children}
    </div>
  );
}

function TotalRow({ t }: { t: Totals }) {
  return (
    <tr style={{ background: 'var(--s1)', fontWeight: 800 }}>
      <Td sticky bold>Total</Td>
      <Td align="right">{t.leads_assigned}</Td>
      <Td align="right" bold>{t.calls}</Td>
      <Td align="right" tone="#10b981">{t.connected}</Td>
      <Td align="right" tone="#3E9EFF">{t.interested}</Td>
      <Td align="right" tone="#ef4444">{t.not_interested}</Td>
      <Td align="right" tone="#F59E0B">{t.follow_ups}</Td>
      <Td align="right" tone="#A855F7">{t.conversions}</Td>
      <Td align="right" bold>{fmtInr(t.scheme_amount)}</Td>
    </tr>
  );
}

function Th({ children, align, sticky }: { children: React.ReactNode; align?: 'right'; sticky?: boolean }) {
  return (
    <th style={{
      padding: '10px 14px', fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
      textTransform: 'uppercase', textAlign: align ?? 'left',
      borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
      color: 'var(--text-dim)',
      position: sticky ? 'sticky' : undefined, left: sticky ? 0 : undefined, zIndex: sticky ? 2 : undefined,
      background: sticky ? 'var(--s2)' : undefined, whiteSpace: 'nowrap',
    }}>{children}</th>
  );
}

function Td({ children, align, sticky, bold, tone, dim, center, colSpan }: {
  children: React.ReactNode; align?: 'right'; sticky?: boolean; bold?: boolean;
  tone?: string; dim?: boolean; center?: boolean; colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} style={{
      padding: '11px 14px', fontSize: 13,
      color: tone ?? (dim ? 'var(--text-dim)' : 'var(--text)'),
      fontWeight: bold ? 700 : undefined,
      textAlign: center ? 'center' : (align ?? 'left'),
      borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
      position: sticky ? 'sticky' : undefined, left: sticky ? 0 : undefined,
      background: sticky ? 'var(--s2)' : undefined, zIndex: sticky ? 1 : undefined,
      whiteSpace: 'nowrap', fontFamily: align === 'right' ? 'ui-monospace, monospace' : undefined,
    }}>{children}</td>
  );
}

// ── Formatters ─────────────────────────────────────────────────────

function fmtInr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
function fmtDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}
