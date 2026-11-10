'use client';
import { useEffect, useRef, useState } from 'react';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { RangePresetPicker, presetRange } from '../../../../components/attendance/RangePresets';
import { ffmReports, type VisitCoveragePayload } from '../../../../components/ffm/reports/ffmReportsApi';
import { csvLine, rangeProblem } from '../../../../components/ffm/reports/reportUtils';

/**
 * Visit Coverage — universe (planned) vs covered (visited) outlets, by city and by rep, over a chosen
 * range (default: this month so far).
 *
 * Data: GET /api/v1/analytics/ffm/reports/visit-coverage?from&to — outlets on the reps' route plans in the
 * range, and those with at least one visited call. (This page used to read /analytics/outlet-coverage, which
 * answers a different shape — form-submission outlet counts — so it only rendered for the demo account.)
 *
 * Layout: four big-number cards (universe, covered, gap, coverage %) over a per-city table and a per-rep
 * table. Coverage % is colour-coded — red below 50, amber 50–80, green 80+ — so admins can read the
 * tables at a glance. The gap is outlets planned but not visited at all in the range.
 */

type ByCity = { city: string; universe: number; covered: number };
type ByRep = { fe_id: string; fe_name: string; universe: number; covered: number; gap: number; coverage_pct: number };

function pctColor(pct: number) {
  if (pct >= 80) return '#10B981';
  if (pct >= 50) return '#F59E0B';
  return '#EF4444';
}

// Type-aware column sorting reads the raw per-city value (gap and coverage are
// derived so the comparator sorts numerically, not on the formatted string).
const cityVal = (c: ByCity, key: string): unknown => {
  switch (key) {
    case 'city': return c.city;
    case 'universe': return c.universe;
    case 'covered': return c.covered;
    case 'gap': return c.universe - c.covered;
    case 'coverage': return c.universe > 0 ? c.covered / c.universe : 0;
    default: return (c as unknown as Record<string, unknown>)[key];
  }
};
const repVal = (r: ByRep, key: string): unknown => (r as unknown as Record<string, unknown>)[key];

export default function VisitCoverageReport() {
  const [from, setFrom] = useState(() => presetRange('month').from);
  const [to, setTo] = useState(() => presetRange('month').to);
  const [data, setData] = useState<VisitCoveragePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const problem = rangeProblem(from, to);

  useEffect(() => {
    const id = ++reqId.current;
    if (problem) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await ffmReports.visitCoverage({ from, to });
        if (id !== reqId.current) return;
        setData(res?.data ?? null);
      } catch (e: any) {
        if (id !== reqId.current) return;
        setData(null);
        setError(e?.message ?? 'Failed to load coverage');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
  }, [from, to, problem]);

  const exportCsv = () => {
    if (!data?.by_city) return;
    const lines = [csvLine(['City', 'Universe', 'Covered', 'Gap', 'Coverage %'])];
    for (const c of data.by_city) {
      const gap = c.universe - c.covered;
      const pct = c.universe > 0 ? Math.round((c.covered / c.universe) * 100) : 0;
      lines.push(csvLine([c.city, c.universe, c.covered, gap, pct]));
    }
    if (data.by_rep?.length) {
      lines.push('', csvLine(['Rep', 'Universe', 'Covered', 'Gap', 'Coverage %']));
      for (const r of data.by_rep) lines.push(csvLine([r.fe_name, r.universe, r.covered, r.gap, r.coverage_pct]));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visit-coverage-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cityRows = data?.by_city ?? [];
  const repRows: ByRep[] = data?.by_rep ?? [];
  const city = useTableSort<ByCity>(cityRows, cityVal, { key: 'city', dir: 'asc' });
  const rep = useTableSort<ByRep>(repRows, repVal, { key: 'fe_name', dir: 'asc' });

  const universe = Number(data?.universe) || 0;
  const covered = Number(data?.covered) || 0;
  const coveragePct = Number(data?.coverage_pct) || 0;
  const gap = universe - covered;
  const canExport = !!data?.by_city?.length;

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
          disabled={!canExport}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 14px',
            borderRadius: 8, fontWeight: 700, cursor: canExport ? 'pointer' : 'not-allowed',
            opacity: canExport ? 1 : 0.5, fontSize: 13,
          }}
        >
          ⬇ Export CSV
        </button>
      </header>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        <RangePresetPicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} idPrefix="ffm-cov" />
        {problem && <div role="alert" style={{ marginTop: 10, fontSize: 12, color: '#ef4444' }}>{problem}</div>}
      </div>

      {loading ? (
        <div style={{ padding: 16, color: 'var(--text-dim)' }}>Loading coverage…</div>
      ) : error ? (
        <div role="alert" style={{ padding: 16, color: '#ef4444' }}>{error}</div>
      ) : !data ? (
        <div style={{ padding: 16, color: 'var(--text-dim)' }}>No coverage data available yet.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Stat label="Universe" value={universe.toLocaleString('en-IN')} />
            <Stat label="Covered"  value={covered.toLocaleString('en-IN')} accent="#10B981" />
            <Stat label="Gap"      value={gap.toLocaleString('en-IN')} accent={gap > 0 ? '#EF4444' : undefined} />
            <Stat label="Coverage" value={`${coveragePct}%`} accent={pctColor(coveragePct)} />
          </div>

          <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
              By city
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  <tr>
                    <Th><SortLabel label="City" sortKey="city" sort={city.sort} onToggle={city.toggle} /></Th>
                    <Th align="right"><SortLabel label="Universe" sortKey="universe" sort={city.sort} onToggle={city.toggle} align="right" /></Th>
                    <Th align="right"><SortLabel label="Covered" sortKey="covered" sort={city.sort} onToggle={city.toggle} align="right" /></Th>
                    <Th align="right"><SortLabel label="Gap" sortKey="gap" sort={city.sort} onToggle={city.toggle} align="right" /></Th>
                    <Th align="right"><SortLabel label="Coverage" sortKey="coverage" sort={city.sort} onToggle={city.toggle} align="right" /></Th>
                    <Th>Progress</Th>
                  </tr>
                </thead>
                <tbody>
                  {cityRows.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>No planned outlets in the selected range.</td></tr>
                  )}
                  {city.sorted.map((c) => {
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

          {repRows.length > 0 && (
            <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
                By rep
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table data-testid="coverage-rep-table" style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    <tr>
                      <Th><SortLabel label="Rep" sortKey="fe_name" sort={rep.sort} onToggle={rep.toggle} /></Th>
                      <Th align="right"><SortLabel label="Universe" sortKey="universe" sort={rep.sort} onToggle={rep.toggle} align="right" /></Th>
                      <Th align="right"><SortLabel label="Covered" sortKey="covered" sort={rep.sort} onToggle={rep.toggle} align="right" /></Th>
                      <Th align="right"><SortLabel label="Gap" sortKey="gap" sort={rep.sort} onToggle={rep.toggle} align="right" /></Th>
                      <Th align="right"><SortLabel label="Coverage" sortKey="coverage_pct" sort={rep.sort} onToggle={rep.toggle} align="right" /></Th>
                      <Th>Progress</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.sorted.map((r) => (
                      <tr key={r.fe_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <Td>{r.fe_name}</Td>
                        <Td align="right">{r.universe}</Td>
                        <Td align="right">{r.covered}</Td>
                        <Td align="right">{r.gap}</Td>
                        <Td align="right" style={{ color: pctColor(r.coverage_pct), fontWeight: 700 }}>{r.coverage_pct}%</Td>
                        <Td>
                          <div style={{ height: 6, background: 'var(--s3)', borderRadius: 99, overflow: 'hidden', minWidth: 120 }}>
                            <div style={{ width: `${r.coverage_pct}%`, height: '100%', background: pctColor(r.coverage_pct), borderRadius: 99 }} />
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Universe = distinct outlets on a rep&apos;s route plan in the range (up to today); covered = those with at least one visited call; gap = planned but never visited in the range.
            An outlet planned for several reps counts once in the totals and once for each rep in the by-rep table. City comes from the outlet record.
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
