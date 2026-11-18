'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { crmDeals, crmLeads, crmTargets } from '../../../../../../lib/crmApi';
import api from '../../../../../../lib/api';
import type { Deal, Lead, SalespersonDetail } from '../../../../../../types/crm';
import { useReportCityKey } from '../../../../../../components/crm/reports/ReportFilters';
import { BarChart3, Building2, CalendarDays, CalendarRange, Target, Trophy, UserPlus } from 'lucide-react';
import { PageIcon, InlineIcon } from '../../../../../../components/ui/PageIcon';
import { metricIconFor } from '../../../../../../lib/labelIcons';

// Per-salesperson drill-down. Management clicks a rep on the Rep Leaderboard /
// Team Performance and lands here:
//   • Stage 1 — their won-deal sales summary and every lead assigned to them
//     (status + a link to the lead's Timeline = full follow-up history).
//   • Stage 2 — the rep's monthly sales target broken down the way management
//     asked for it, from GET /crm/targets/salesperson/:userId: target /
//     achieved / pending, the customers contributing this month, daily & weekly
//     progress, and target-vs-achieved for the last 6 months. Achievement follows
//     the client's configured basis (won deals for an opted-in client such as
//     Aadinath, logged entries otherwise). That endpoint is manager-gated, so for
//     a non-manager (or a client where it isn't reachable) the page falls back to
//     the Stage 1 target card from the rupee leaderboard and hides the breakdown.
interface SalesSummary {
  won: number; lost: number; open: number; revenue: number; avg_deal: number; win_rate: number;
}
interface TargetInfo { target: number | null; achieved: number; pct: number | null }

/** The current month ("YYYY-MM") in IST — matches the server's default month. */
function istMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
}

export default function SalespersonPage() {
  const params = useParams<{ userId: string }>();
  const userId = Array.isArray(params?.userId) ? params.userId[0] : (params?.userId ?? '');
  const cityKey = useReportCityKey();

  const [name, setName] = useState('Salesperson');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [target, setTarget] = useState<TargetInfo | null | 'none'>(null); // null = loading, 'none' = no target
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // Stage 2 target drill-down, re-fetched when the month changes.
  const [month, setMonth] = useState<string>(() => istMonth());
  const [detail, setDetail] = useState<SalespersonDetail | null | 'none'>(null); // null = loading, 'none' = unavailable

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Names + sales summary + leads in parallel; each failure is contained so
      // one empty source never blanks the whole page.
      const [usersR, dealsR, leadsR] = await Promise.allSettled([
        api.getUsers({ limit: '500' }) as Promise<any>,
        crmDeals.list({ limit: 1000 }),
        crmLeads.list({ owner_id: userId, limit: 200 }),
      ]);
      if (cancelled) return;

      if (usersR.status === 'fulfilled') {
        const users: Array<{ id: string; name?: string; full_name?: string; email?: string }> =
          usersR.value?.data || usersR.value || [];
        const u = users.find((x) => x.id === userId);
        if (u) setName(u.name || u.full_name || u.email || 'Salesperson');
      }

      if (dealsR.status === 'fulfilled') {
        const deals: Deal[] = (dealsR.value?.data || []).filter((d: any) => (d.owner_id || '') === userId);
        const s: SalesSummary = { won: 0, lost: 0, open: 0, revenue: 0, avg_deal: 0, win_rate: 0 };
        for (const d of deals) {
          const status = (d as any).status;
          if (status === 'won') { s.won++; s.revenue += Number((d as any).amount || 0); }
          else if (status === 'lost') s.lost++;
          else s.open++;
        }
        s.avg_deal = s.won > 0 ? s.revenue / s.won : 0;
        const denom = s.won + s.lost;
        s.win_rate = denom > 0 ? (s.won / denom) * 100 : 0;
        setSummary(s);
      } else { setSummary({ won: 0, lost: 0, open: 0, revenue: 0, avg_deal: 0, win_rate: 0 }); }

      if (leadsR.status === 'fulfilled') setLeads(leadsR.value?.data || []);
      else { setLeads([]); toast.error('Could not load leads'); }

      // Target board is separate + optional (feature off for many clients) — never fail the page on it.
      // This is the Stage 1 fallback; the richer Stage 2 detail (below) supersedes it when available.
      try {
        const board = await crmTargets.rupeeLeaderboard('sales');
        if (cancelled) return;
        const row = (board?.data?.entries || []).find((e) => e.user_id === userId);
        setTarget(row ? { target: row.target, achieved: row.achieved, pct: row.pct } : 'none');
      } catch { if (!cancelled) setTarget('none'); }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, cityKey]);

  // Stage 2 drill-down — depends on the selected month too, so changing the month
  // refetches only this (manager-gated; falls back silently when unavailable).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setDetail(null);
    (async () => {
      try {
        const res = await crmTargets.salespersonDetail(userId, month);
        if (!cancelled) setDetail(res?.data ?? 'none');
      } catch { if (!cancelled) setDetail('none'); }
    })();
    return () => { cancelled = true; };
  }, [userId, cityKey, month]);

  const shownLeads = useMemo(
    () => (statusFilter ? leads.filter((l) => l.status === statusFilter) : leads),
    [leads, statusFilter],
  );
  const leadStatuses = useMemo(
    () => Array.from(new Set(leads.map((l) => l.status).filter(Boolean))) as string[],
    [leads],
  );

  const d = detail && detail !== 'none' ? detail : null;
  const countLabel = d?.basis === 'won_deals' ? 'Orders' : 'Entries';
  // Fallback (Stage 1) pending, used only when the detail endpoint is unavailable.
  const fbPending = target && target !== 'none' && target.target != null
    ? Math.max(0, target.target - target.achieved) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard/crm/reports/rep-leaderboard" style={{ color: 'var(--text-dim)', fontSize: 13, textDecoration: 'none' }}>← Rep Leaderboard</Link>
        <h2 style={{ color: 'var(--text)', margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 12 }}><PageIcon />{name}</h2>
        <Link href={`/dashboard/crm/leads?owner=${encodeURIComponent(userId)}`} style={{ marginLeft: 'auto', color: 'var(--accent, #6366f1)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          View in Leads →
        </Link>
      </div>

      {/* Sales summary — won deals */}
      <section style={card}>
        <h3 style={h3}><InlineIcon icon={Trophy} size={16} style={{ color: 'var(--text-dim)' }} />Sales (won deals)</h3>
        {loading && !summary ? <Muted>Loading…</Muted> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Kpi label="Revenue" value={inr(summary?.revenue || 0)} strong />
            <Kpi label="Deals Won" value={summary?.won ?? 0} />
            <Kpi label="Open Pipeline" value={summary?.open ?? 0} />
            <Kpi label="Avg Deal" value={summary?.avg_deal ? inr(summary.avg_deal) : '—'} />
            <Kpi label="Win Rate" value={`${(summary?.win_rate ?? 0).toFixed(1)}%`} />
          </div>
        )}
      </section>

      {/* Monthly sales target — Stage 2 detail when available, else the Stage 1 board fallback */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ ...h3, marginBottom: 0 }}><InlineIcon icon={Target} size={16} style={{ color: 'var(--text-dim)' }} />Monthly sales target</h3>
            {d && <BasisBadge basis={d.basis} />}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 12 }}>
            Month
            <input
              type="month"
              value={month}
              max={istMonth()}
              onChange={(e) => setMonth(e.target.value || istMonth())}
              style={{ ...sel, padding: '5px 8px' }}
            />
          </label>
        </div>
        {d ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Kpi label="Target" value={d.target != null ? inr(d.target) : '—'} />
            <Kpi label="Achieved" value={inr(d.achieved)} strong />
            <Kpi label="Pending" value={d.pending != null ? inr(d.pending) : '—'} />
            <Kpi label="Progress" value={d.pct != null ? `${d.pct}%` : '—'} />
          </div>
        ) : detail === null && target === null ? <Muted>Loading…</Muted>
          : target && target !== 'none' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Kpi label="Target" value={target.target != null ? inr(target.target) : '—'} />
              <Kpi label="Achieved" value={inr(target.achieved)} strong />
              <Kpi label="Pending" value={fbPending != null ? inr(fbPending) : '—'} />
              <Kpi label="Progress" value={target.pct != null ? `${target.pct.toFixed(0)}%` : '—'} />
            </div>
          ) : <Muted>No sales target set for this salesperson.</Muted>}
      </section>

      {/* Stage 2 breakdowns — only when the detail endpoint answered */}
      {d && (
        <>
          {/* Customer-wise orders contributing this month */}
          <section style={card}>
            <h3 style={h3}><InlineIcon icon={Building2} size={16} style={{ color: 'var(--text-dim)' }} />Customers this month ({d.customers.length})</h3>
            {d.customers.length === 0 ? <Muted>No sales recorded in this month.</Muted> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>Customer</th>
                      <th style={thNum}>{countLabel}</th>
                      <th style={thNum}>Value</th>
                      <th style={{ ...th, width: '34%' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => { const top = d.customers[0]?.value || 0; return d.customers.map((c) => (
                      <tr key={c.name}>
                        <td style={td}>{c.name}</td>
                        <td style={tdNum}>{c.count}</td>
                        <td style={{ ...tdNum, fontWeight: 700 }}>{inr(c.value)}</td>
                        <td style={td}><Bar frac={top > 0 ? c.value / top : 0} /></td>
                      </tr>
                    )); })()}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Daily & weekly progress */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <section style={card}>
              <h3 style={h3}><InlineIcon icon={CalendarDays} size={16} style={{ color: 'var(--text-dim)' }} />Daily progress</h3>
              <ProgressList
                rows={d.daily.map((x) => ({ key: x.date, label: fmtDay(x.date), value: x.value, count: x.count }))}
                countLabel={countLabel}
                empty="No daily sales this month."
              />
            </section>
            <section style={card}>
              <h3 style={h3}><InlineIcon icon={CalendarRange} size={16} style={{ color: 'var(--text-dim)' }} />Weekly progress</h3>
              <ProgressList
                rows={d.weekly.map((x) => ({ key: x.week_start, label: `Week of ${fmtDay(x.week_start)}`, value: x.value, count: x.count }))}
                countLabel={countLabel}
                empty="No weekly sales this month."
              />
            </section>
          </div>

          {/* Historical target vs achieved — last 6 months */}
          <section style={card}>
            <h3 style={h3}><InlineIcon icon={BarChart3} size={16} style={{ color: 'var(--text-dim)' }} />Target vs achieved — last 6 months</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Month</th>
                    <th style={thNum}>Target</th>
                    <th style={thNum}>Achieved</th>
                    <th style={thNum}>%</th>
                    <th style={{ ...th, width: '30%' }}>Attainment</th>
                  </tr>
                </thead>
                <tbody>
                  {d.historical.map((m) => (
                    <tr key={m.month}>
                      <td style={td}>{fmtMonth(m.month)}</td>
                      <td style={{ ...tdNum, color: 'var(--text-dim)' }}>{m.target != null ? inr(m.target) : '—'}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{inr(m.achieved)}</td>
                      <td style={tdNum}>{m.pct != null ? `${m.pct}%` : '—'}</td>
                      <td style={td}><Bar frac={m.pct != null ? Math.min(1, m.pct / 100) : 0} tone={m.pct != null && m.pct >= 100 ? '#10b981' : undefined} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Leads assigned to this salesperson */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ ...h3, marginBottom: 0 }}><InlineIcon icon={UserPlus} size={16} style={{ color: 'var(--text-dim)' }} />Leads ({shownLeads.length})</h3>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={sel}>
            <option value="">All statuses</option>
            {leadStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {loading && leads.length === 0 ? <Muted>Loading…</Muted>
          : shownLeads.length === 0 ? <Muted>No leads assigned.</Muted>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Lead</th>
                    <th style={th}>Company</th>
                    <th style={th}>Status</th>
                    <th style={th}>Source</th>
                    <th style={thNum}>Score</th>
                    <th style={thNum}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {shownLeads.map((l) => (
                    <tr key={l.id}>
                      <td style={td}>
                        <Link href={`/dashboard/crm/leads/${l.id}`} style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>
                          {[l.first_name, l.last_name].filter(Boolean).join(' ') || (l as any).company || 'Lead'}
                        </Link>
                      </td>
                      <td style={{ ...td, color: 'var(--text-dim)' }}>{(l as any).company || '—'}</td>
                      <td style={td}><StatusPill status={l.status} /></td>
                      <td style={{ ...td, color: 'var(--text-dim)' }}>{(l as any).source_name || '—'}</td>
                      <td style={tdNum}>{(l as any).score ?? '—'}</td>
                      <td style={{ ...tdNum, color: 'var(--text-dim)' }}>{fmtDate((l as any).updated_at || (l as any).created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, display: 'flex', alignItems: 'center', gap: 5 }}>{(() => { const I = metricIconFor(label); return I ? <InlineIcon icon={I} size={13} /> : null; })()}{label}</div>
      <div style={{ fontSize: strong ? 20 : 18, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function BasisBadge({ basis }: { basis: SalespersonDetail['basis'] }) {
  const won = basis === 'won_deals';
  const tone = won ? '#10b981' : 'var(--text-dim)';
  return (
    <span title={won ? 'Achievement counted from won CRM deals' : 'Achievement counted from logged sales entries'}
      style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, color: tone, border: `1px solid ${tone}`, textTransform: 'uppercase', letterSpacing: 0.4 }}>
      {won ? 'From won deals' : 'From logged entries'}
    </span>
  );
}

function Bar({ frac, tone }: { frac: number; tone?: string }) {
  const pct = Math.max(0, Math.min(1, frac || 0)) * 100;
  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: tone || 'var(--accent, #6366f1)' }} />
    </div>
  );
}

function ProgressList({ rows, countLabel, empty }: {
  rows: Array<{ key: string; label: string; value: number; count: number }>; countLabel: string; empty: string;
}) {
  if (rows.length === 0) return <Muted>{empty}</Muted>;
  const top = Math.max(...rows.map((r) => r.value), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--text)' }}>{r.label}</span>
            <span style={{ color: 'var(--text-dim)' }}>{inr(r.value)} · {r.count} {countLabel.toLowerCase()}</span>
          </div>
          <Bar frac={top > 0 ? r.value / top : 0} />
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status === 'converted' ? '#10b981' : status === 'lost' || status === 'unqualified' ? '#ef4444'
    : status === 'qualified' ? '#6366f1' : status === 'working' ? '#f59e0b' : 'var(--text-dim)';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: tone, border: `1px solid ${tone}`, textTransform: 'capitalize' }}>
      {status || '—'}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 8 }}>{children}</div>;
}

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

/** A plain "YYYY-MM-DD" → "12 Nov" (no timezone math — the server already works in IST). */
function fmtDay(s: string): string {
  const [y, m, dd] = (s || '').split('-').map(Number);
  if (!y || !m || !dd) return s || '—';
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || '';
  return `${dd} ${mon}`;
}

/** "YYYY-MM" → "Nov 2026". */
function fmtMonth(s: string): string {
  const [y, m] = (s || '').split('-').map(Number);
  if (!y || !m) return s || '—';
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || '';
  return `${mon} ${y}`;
}

function inr(n: number): string {
  if (!n) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 };
const h3: React.CSSProperties = { color: 'var(--text)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 };
const sel: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 8, fontSize: 13 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right' };
