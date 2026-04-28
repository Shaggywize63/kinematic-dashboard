'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import planogramApi from '../../../lib/planogramApi';
import type { Planogram, TrendPoint, StoreRanking } from '../../../types/planogram';

const C = {
  red: '#E01E2C',
  green: '#00D97E',
  yellow: '#FFB800',
  blue: '#3E9EFF',
  gray: 'var(--textSec)',
  grayd: 'var(--textTert)',
  s2: 'var(--s2)',
  border: 'var(--border)',
};

export default function PlanogramsPage() {
  const [planograms, setPlanograms] = useState<Planogram[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [ranking, setRanking] = useState<StoreRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t, r] = await Promise.all([
        planogramApi.list(),
        planogramApi.trend(30),
        planogramApi.storeRanking(7),
      ]);
      setPlanograms(p.data || []);
      setTrend(t.data || []);
      setRanking(r.data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load planograms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const avgScore = trend.length
    ? Math.round((trend.reduce((s, p) => s + p.avg_score, 0) / trend.length) * 10) / 10
    : 0;
  const totalCaptures = trend.reduce((s, p) => s + p.captures, 0);
  const trendDelta = computeTrendDelta(trend);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>
            AI Planogram Engine
          </div>
          <div style={{ fontSize: 13, color: C.gray, marginTop: 3 }}>
            Live shelf intelligence — recognition, compliance, recommendations.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href="/dashboard/planograms/insights"
            style={{
              padding: '9px 16px',
              background: C.s2,
              border: `1px solid ${C.border}`,
              color: C.gray,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif",
              textDecoration: 'none',
            }}
          >
            Insights & Risk
          </Link>
          <button
            onClick={fetchAll}
            style={{
              padding: '9px 16px',
              background: C.s2,
              border: `1px solid ${C.border}`,
              color: C.gray,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            Refresh
          </button>
          <Link
            href="/dashboard/planograms/new"
            style={{
              padding: '9px 16px',
              background: C.red,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'DM Sans',sans-serif",
              textDecoration: 'none',
            }}
          >
            + New planogram
          </Link>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(224,30,44,0.08)',
            border: '1px solid rgba(224,30,44,0.2)',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 13,
            color: C.red,
          }}
        >
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Kpi label="Active planograms" value={planograms.filter((p) => p.is_active).length} accent={C.blue} />
        <Kpi
          label="Avg compliance (30d)"
          value={`${avgScore}%`}
          accent={avgScore >= 80 ? C.green : avgScore >= 65 ? C.yellow : C.red}
        />
        <Kpi label="Captures (30d)" value={totalCaptures} accent={C.blue} />
        <Kpi
          label="Trend"
          value={`${trendDelta >= 0 ? '+' : ''}${trendDelta}%`}
          accent={trendDelta >= 0 ? C.green : C.red}
        />
      </div>

      {/* Trend sparkline */}
      <div
        style={{
          background: 'var(--s1)',
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 20,
        }}
      >
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          Compliance trend — last 30 days
        </div>
        <Sparkline data={trend.map((t) => t.avg_score)} />
      </div>

      {/* Two-col: planogram list + store ranking */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        {/* Planogram list */}
        <div
          style={{
            background: 'var(--s1)',
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${C.border}`,
              fontFamily: "'Syne',sans-serif",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Planograms
          </div>
          {loading ? (
            <div style={{ padding: 36, textAlign: 'center', color: C.grayd, fontSize: 13 }}>Loading…</div>
          ) : planograms.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: C.grayd, fontSize: 13 }}>
              No planograms yet — upload one to start scoring captures.
            </div>
          ) : (
            planograms.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/planograms/${p.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: `1px solid ${C.border}40`,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 3 }}>
                    {p.category || 'Uncategorized'} · {p.expected_skus?.length || 0} SKUs · v{p.version}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 20,
                    background: p.is_active ? 'rgba(0,217,126,0.12)' : 'rgba(122,139,160,0.08)',
                    color: p.is_active ? C.green : '#7A8BA0',
                  }}
                >
                  {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </Link>
            ))
          )}
        </div>

        {/* Store ranking */}
        <div
          style={{
            background: 'var(--s1)',
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${C.border}`,
              fontFamily: "'Syne',sans-serif",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Top stores (7d)
          </div>
          {ranking.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: C.grayd, fontSize: 13 }}>
              No captures yet.
            </div>
          ) : (
            ranking.slice(0, 8).map((r, i) => (
              <div
                key={r.bucket}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderBottom: `1px solid ${C.border}40`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: C.s2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.gray,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.bucket_label.slice(0, 8)}…</div>
                    <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>
                      {r.captures} captures
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: r.avg_score >= 80 ? C.green : r.avg_score >= 65 ? C.yellow : C.red,
                  }}
                >
                  {r.avg_score}%
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper components ───────────────────────────────────────────────────

function Kpi({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div
      style={{
        background: 'var(--s1)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: accent }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--textSec)', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (!data.length)
    return (
      <div style={{ fontSize: 12, color: 'var(--textTert)', padding: '20px 0' }}>
        Not enough data yet.
      </div>
    );
  const w = 600;
  const h = 80;
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 100);
  const span = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / span) * (h - 8) - 4}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80 }}>
      <polyline fill="none" stroke="#E01E2C" strokeWidth={2} points={points} />
    </svg>
  );
}

function computeTrendDelta(trend: TrendPoint[]) {
  if (trend.length < 4) return 0;
  const n = trend.length;
  const head = trend.slice(0, Math.floor(n / 2));
  const tail = trend.slice(Math.floor(n / 2));
  const avg = (arr: TrendPoint[]) => arr.reduce((s, p) => s + p.avg_score, 0) / arr.length;
  return Math.round((avg(tail) - avg(head)) * 10) / 10;
}
