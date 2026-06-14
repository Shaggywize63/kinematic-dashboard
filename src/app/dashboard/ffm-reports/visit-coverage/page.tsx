'use client';
import { useEffect, useState } from 'react';
import api from '../../../../lib/api';

/**
 * Visit Coverage — universe (planned) vs covered (visited) outlets,
 * sliced by city. Data point already exists at /analytics/outlet-coverage
 * and the demo mock returns six cities so this view paints out of the
 * box for the demo account.
 *
 * Layout: four big-number cards (universe, covered, gap, coverage %)
 * over a per-city bar table. Coverage % is colour-coded — red below 50,
 * amber 50–80, green 80+ — so admins can read the table at a glance.
 */

type ByCity = { city: string; universe: number; covered: number };
interface Payload {
  universe: number;
  covered: number;
  coverage_pct: number;
  by_city?: ByCity[];
}

function pctColor(pct: number) {
  if (pct >= 80) return '#10B981';
  if (pct >= 50) return '#F59E0B';
  return '#EF4444';
}

export default function VisitCoverageReport() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ success: boolean; data: Payload }>('/api/v1/analytics/outlet-coverage');
        setData(res?.data ?? null);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load coverage');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const exportCsv = () => {
    if (!data?.by_city) return;
    const header = 'City,Universe,Covered,Gap,Coverage %';
    const lines = data.by_city.map((c) => {
      const gap = c.universe - c.covered;
      const pct = c.universe > 0 ? Math.round((c.covered / c.universe) * 100) : 0;
      return [c.city, c.universe, c.covered, gap, pct].join(',');
    });
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visit-coverage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: 16, color: 'var(--text-dim)' }}>Loading coverage…</div>;
  if (error) return <div style={{ padding: 16, color: '#ef4444' }}>{error}</div>;
  if (!data) return <div style={{ padding: 16, color: 'var(--text-dim)' }}>No coverage data available yet.</div>;

  const gap = data.universe - data.covered;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Visit Coverage</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Outlets in the planned universe vs outlets the team actually visited.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data.by_city?.length}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px',
            borderRadius: 8, fontWeight: 700, cursor: data.by_city?.length ? 'pointer' : 'not-allowed',
            opacity: data.by_city?.length ? 1 : 0.5, fontSize: 13,
          }}
        >
          ⬇ Export CSV
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Stat label="Universe" value={data.universe.toLocaleString('en-IN')} />
        <Stat label="Covered"  value={data.covered.toLocaleString('en-IN')} accent="#10B981" />
        <Stat label="Gap"      value={gap.toLocaleString('en-IN')} accent={gap > 0 ? '#EF4444' : undefined} />
        <Stat label="Coverage" value={`${data.coverage_pct}%`} accent={pctColor(data.coverage_pct)} />
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
          By city
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            <tr>
              <Th>City</Th>
              <Th align="right">Universe</Th>
              <Th align="right">Covered</Th>
              <Th align="right">Gap</Th>
              <Th align="right">Coverage</Th>
              <Th>Progress</Th>
            </tr>
          </thead>
          <tbody>
            {(data.by_city ?? []).map((c) => {
              const pct = c.universe > 0 ? Math.round((c.covered / c.universe) * 100) : 0;
              const cityGap = c.universe - c.covered;
              return (
                <tr key={c.city} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td>{c.city}</Td>
                  <Td align="right">{c.universe}</Td>
                  <Td align="right">{c.covered}</Td>
                  <Td align="right">{cityGap}</Td>
                  <Td align="right" style={{ color: pctColor(pct), fontWeight: 700 }}>{pct}%</Td>
                  <Td>
                    <div style={{ height: 6, background: 'var(--s3)', borderRadius: 99, overflow: 'hidden', minWidth: 120 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pctColor(pct), borderRadius: 99 }} />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
