'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { TeamPerformanceRow } from '../../../../../types/crm';

/**
 * Team Performance — per-rep KPI roll-up across the caller's hierarchy
 * subtree. A Consumer Champion Manager (data_scope='team') sees every
 * Consumer Champion reporting to them; an Area Sales Manager sees the
 * subtree below.
 *
 * Layout:
 *   1. Date range filter (default: last 30 days)
 *   2. KPI strip — total won, conversion, ageing, new leads
 *   3. Team-wise table — sticky Total row at top, per-rep rows below.
 *      Sorted by won_value desc.
 */

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const past = new Date(today);
  past.setDate(today.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(past), to: iso(today) };
}

export default function TeamPerformancePage() {
  const [range, setRange] = useState(defaultRange);
  const [total, setTotal] = useState<TeamPerformanceRow | null>(null);
  const [rows, setRows] = useState<TeamPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crmAnalytics.teamPerformance(range)
      .then((r) => {
        if (cancelled) return;
        setTotal(r.data?.total ?? null);
        setRows(r.data?.rows ?? []);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load team performance'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const empty = !loading && rows.length === 0;

  // Conversion / ageing colour-coding so the manager can scan for
  // problems without reading numbers. Thresholds picked to match the
  // Tata Tiscon dashboards in the user's spec screenshot.
  const ageingTone = (d: number): string => (d >= 60 ? '#ef4444' : d >= 30 ? '#f59e0b' : '#10b981');
  const conversionTone = (r: number): string => (r >= 0.25 ? '#10b981' : r >= 0.10 ? '#f59e0b' : '#ef4444');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header range={range} onChange={setRange} />

      <KpiStrip total={total} loading={loading} />

      <div style={{
        background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px', background: '#1e88e5',
          color: '#fff', fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 13,
        }}>
          Team Wise
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--s1)' }}>
                <Th>Rep</Th>
                <Th align="right">Won Volume</Th>
                <Th align="right">Conversion Rate</Th>
                <Th align="right">Ageing (Last 90 days)</Th>
                <Th align="right">New Lead (Current Month)</Th>
              </tr>
            </thead>
            <tbody>
              {/* Sticky Total row — visually distinct so a manager sees
                  the bottom line before the per-rep breakdown. */}
              {total && (
                <tr style={{ background: 'var(--s1)', fontWeight: 800 }}>
                  <Td><strong>Total</strong></Td>
                  <Td align="right" mono>{fmtVolume(total.won_value)}</Td>
                  <Td align="right" mono>{fmtPercent(total.conversion_rate)}</Td>
                  <Td align="right" mono>{total.avg_ageing_days.toFixed(0)}</Td>
                  <Td align="right" mono>{total.new_leads_period}</Td>
                </tr>
              )}
              {loading && !rows.length && (
                <tr><Td colSpan={5} center dim>Loading…</Td></tr>
              )}
              {empty && (
                <tr><Td colSpan={5} center dim>No team data for the selected window.</Td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.user_id ?? r.name}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                  </Td>
                  <Td align="right" mono>{fmtVolume(r.won_value)}</Td>
                  <Td align="right" mono>
                    <span style={{ color: conversionTone(r.conversion_rate), fontWeight: 700 }}>
                      {fmtPercent(r.conversion_rate)}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    <span style={{ color: ageingTone(r.avg_ageing_days), fontWeight: 700 }}>
                      {r.avg_ageing_days.toFixed(0)}
                    </span>
                  </Td>
                  <Td align="right" mono>{r.new_leads_period}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Header + range filter ──────────────────────────────────────────

function Header({ range, onChange }: { range: { from: string; to: string }; onChange: (r: { from: string; to: string }) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Team Performance</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          Per-rep KPI roll-up across your hierarchy subtree. Updates with the date range below.
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
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
      />
    </label>
  );
}

// ── KPI strip ──────────────────────────────────────────────────────

function KpiStrip({ total, loading }: { total: TeamPerformanceRow | null; loading: boolean }) {
  const items = useMemo(() => [
    { label: 'Won Volume',       value: total ? fmtVolume(total.won_value) : '—',          accent: '#3E9EFF' },
    { label: 'Conversion Rate',  value: total ? fmtPercent(total.conversion_rate) : '—',   accent: '#10B981' },
    { label: 'Avg Ageing (days)', value: total ? total.avg_ageing_days.toFixed(0) : '—',   accent: '#F59E0B' },
    { label: 'New Leads (period)', value: total ? String(total.new_leads_period) : '—',    accent: '#A855F7' },
  ], [total]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {items.map((k) => (
        <div key={k.label} style={{
          background: 'var(--s2)', border: '1px solid var(--border)', borderLeft: `3px solid ${k.accent}`,
          borderRadius: 12, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {k.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
            {loading ? '—' : k.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Table atoms ────────────────────────────────────────────────────

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{
      padding: '10px 16px', fontSize: 11, fontWeight: 800, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: 0.6, textAlign: align ?? 'left',
      borderBottom: '1px solid var(--border)',
    }}>{children}</th>
  );
}

function Td({ children, align, mono, center, dim, colSpan }: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
  center?: boolean;
  dim?: boolean;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} style={{
      padding: '12px 16px', fontSize: 13,
      color: dim ? 'var(--text-dim)' : 'var(--text)',
      textAlign: center ? 'center' : (align ?? 'left'),
      borderBottom: '1px solid var(--border)',
      fontFamily: mono ? 'ui-monospace, monospace' : undefined,
    }}>{children}</td>
  );
}

// ── Formatters ─────────────────────────────────────────────────────

function fmtVolume(n: number): string {
  // Stored as a number; tenants format the unit themselves (₹ vs MT vs
  // count). Two decimals to match the screenshot's "599.23".
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPercent(r: number): string {
  if (!Number.isFinite(r)) return '—';
  return `${(r * 100).toFixed(2)}%`;
}
