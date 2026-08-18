'use client';
import { useEffect, useState } from 'react';
import { ffmAnalytics, TlsdPoint, UniqueOutletsRow } from '../../../lib/ffmAnalyticsConfig';
import { useTableSort, SortLabel } from '../../../lib/tableSort';

/**
 * Beat Productivity — the beat_productivity module surface (off by default).
 *
 *   • TLSD (Total Lines Sold per Day): distinct SKU lines billed per day, with
 *     order count and drop size (lines / order).
 *   • Unique vs productive outlets per rep (MTD): how many distinct outlets each
 *     rep actually worked, and how many of those booked an order.
 *
 * Both datasets come from module-gated endpoints, so a tenant without the module
 * gets a clean "not enabled" panel instead of an error.
 */

function pctColor(pct: number) {
  if (pct >= 80) return '#10B981';
  if (pct >= 50) return '#F59E0B';
  return '#EF4444';
}

const uoVal = (r: UniqueOutletsRow, key: string): unknown =>
  (r as unknown as Record<string, unknown>)[key];

export default function BeatProductivityPage() {
  const [tlsd, setTlsd] = useState<TlsdPoint[]>([]);
  const [outlets, setOutlets] = useState<UniqueOutletsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([ffmAnalytics.tlsd(), ffmAnalytics.uniqueOutlets()]);
        setTlsd(t?.data ?? []);
        setOutlets(u?.data ?? []);
      } catch (e: any) {
        // 403 = the client hasn't been granted the beat_productivity module.
        if (e?.status === 403 || /403|forbidden|module/i.test(e?.message ?? '')) setGated(true);
        else setError(e?.message ?? 'Failed to load beat productivity');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { sorted, sort, toggle } = useTableSort<UniqueOutletsRow>(
    outlets, uoVal, { key: 'productive_outlets', dir: 'desc' },
  );

  if (loading) return <div style={{ padding: 16, color: 'var(--text-dim)' }}>Loading beat productivity…</div>;
  if (gated) return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Beat Productivity</h1>
      <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        This module isn’t enabled for your account. Ask your administrator to turn on
        <strong style={{ color: 'var(--text)' }}> Beat Productivity</strong> for this client to unlock
        Total Lines Sold per Day and unique / productive outlet metrics.
      </p>
    </div>
  );
  if (error) return <div style={{ padding: 16, color: '#ef4444' }}>{error}</div>;

  const totalLines = tlsd.reduce((s, p) => s + p.lines, 0);
  const totalOrders = tlsd.reduce((s, p) => s + p.orders, 0);
  const avgDrop = totalOrders ? Math.round((totalLines / totalOrders) * 10) / 10 : 0;
  const activeDays = tlsd.length;
  const avgLinesDay = activeDays ? Math.round(totalLines / activeDays) : 0;
  const maxLines = Math.max(1, ...tlsd.map((p) => p.lines));

  const empty = tlsd.length === 0 && outlets.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Beat Productivity</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
          Lines sold per day and how many outlets each rep actually turned productive.
        </p>
      </header>

      {empty ? (
        <div style={{ padding: 16, color: 'var(--text-dim)', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
          No orders or visits in the window yet — this fills in as reps book orders on their beats.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Stat label="Lines (30d)" value={totalLines.toLocaleString('en-IN')} />
            <Stat label="Orders (30d)" value={totalOrders.toLocaleString('en-IN')} accent="#3E9EFF" />
            <Stat label="Avg drop size" value={`${avgDrop}`} accent="#10B981" />
            <Stat label="Avg lines / day" value={`${avgLinesDay}`} />
          </div>

          {/* TLSD daily bars — inline, theme-aware, no chart lib. */}
          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 12 }}>
              Total Lines Sold per Day
            </div>
            {tlsd.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No order lines in the last 30 days.</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, overflowX: 'auto' }}>
                {tlsd.map((p) => (
                  <div key={p.day} title={`${p.day}: ${p.lines} lines, ${p.orders} orders`}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 26, flex: '1 0 26px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{p.lines}</div>
                    <div style={{ width: '70%', height: `${Math.max(4, (p.lines / maxLines) * 104)}px`, background: 'var(--primary)', borderRadius: '4px 4px 0 0' }} />
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{p.day.slice(5)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unique / productive outlets per rep. */}
          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
              Unique vs productive outlets — this month
            </div>
            {outlets.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>No visited outlets this month yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  <tr>
                    <Th><SortLabel label="Rep" sortKey="fe_name" sort={sort} onToggle={toggle} /></Th>
                    <Th align="right"><SortLabel label="Unique outlets" sortKey="unique_outlets" sort={sort} onToggle={toggle} align="right" /></Th>
                    <Th align="right"><SortLabel label="Productive" sortKey="productive_outlets" sort={sort} onToggle={toggle} align="right" /></Th>
                    <Th align="right"><SortLabel label="Productive %" sortKey="productive_outlet_pct" sort={sort} onToggle={toggle} align="right" /></Th>
                    <Th>Share</Th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.fe_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <Td>{r.fe_name}</Td>
                      <Td align="right">{r.unique_outlets}</Td>
                      <Td align="right">{r.productive_outlets}</Td>
                      <Td align="right" style={{ color: pctColor(r.productive_outlet_pct), fontWeight: 700 }}>{r.productive_outlet_pct}%</Td>
                      <Td>
                        <div style={{ height: 6, background: 'var(--s3)', borderRadius: 99, overflow: 'hidden', minWidth: 120 }}>
                          <div style={{ width: `${r.productive_outlet_pct}%`, height: '100%', background: pctColor(r.productive_outlet_pct), borderRadius: 99 }} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return <th style={{ padding: '10px 12px', textAlign: align ?? 'left', fontWeight: 700 }}>{children}</th>;
}

function Td({ children, align, style }: { children: React.ReactNode; align?: 'right' | 'left'; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', textAlign: align ?? 'left', color: 'var(--text)', ...style }}>{children}</td>;
}
