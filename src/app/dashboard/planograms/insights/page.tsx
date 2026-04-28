'use client';
import { useEffect, useState, useCallback } from 'react';
import planogramApi from '../../../../lib/planogramApi';
import type { ChronicGap, RiskForecastRow, SkuVisibility } from '../../../../types/planogram';

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

export default function PlanogramInsightsPage() {
  const [chronic, setChronic] = useState<ChronicGap[]>([]);
  const [risk, setRisk] = useState<RiskForecastRow[]>([]);
  const [sku, setSku] = useState<SkuVisibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r, s] = await Promise.all([
        planogramApi.chronicGaps(),
        planogramApi.riskForecast(),
        planogramApi.skuVisibility(14),
      ]);
      setChronic(g.data || []);
      setRisk(r.data || []);
      setSku(s.data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>
          Planogram Insights
        </div>
        <div style={{ fontSize: 13, color: C.gray, marginTop: 3 }}>
          Predictive intelligence — chronic gaps, risk forecast, SKU visibility.
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Risk forecast */}
        <Panel title="Stores at risk (next week)">
          {loading ? (
            <Empty text="Loading…" />
          ) : risk.length === 0 ? (
            <Empty text="No at-risk stores." />
          ) : (
            risk.map((r) => (
              <div
                key={r.store_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderBottom: `1px solid ${C.border}40`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.store_id.slice(0, 8)}…</div>
                  <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>
                    Latest {r.latest}% · slope {r.slope >= 0 ? '+' : ''}
                    {r.slope}/day
                  </div>
                </div>
                <RiskBadge risk={r.risk} />
              </div>
            ))
          )}
        </Panel>

        {/* Chronic gaps */}
        <Panel title="Chronic compliance gaps">
          {loading ? (
            <Empty text="Loading…" />
          ) : chronic.length === 0 ? (
            <Empty text="No chronic gaps detected." />
          ) : (
            chronic.map((c) => (
              <div
                key={c.store_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderBottom: `1px solid ${C.border}40`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.store_id.slice(0, 8)}…</div>
                  <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>
                    {c.failing} of last 5 captures failing
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.red }}>{c.avg_score}%</div>
              </div>
            ))
          )}
        </Panel>
      </div>

      <Panel title="SKU visibility (14d)">
        {loading ? (
          <Empty text="Loading…" />
        ) : sku.length === 0 ? (
          <Empty text="No SKU visibility data." />
        ) : (
          <div style={{ padding: '4px 0' }}>
            {sku.slice(0, 25).map((s) => (
              <div
                key={s.sku_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 18px',
                  borderBottom: `1px solid ${C.border}40`,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.sku_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 11, color: C.gray }}>
                    {s.appearances} captures · {s.avg_facings} facings avg
                  </div>
                  <Bar value={s.avg_facings} max={6} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--s1)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          fontFamily: "'Syne',sans-serif",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: 36, textAlign: 'center', color: 'var(--textTert)', fontSize: 13 }}>
      {text}
    </div>
  );
}

function RiskBadge({ risk }: { risk: number }) {
  const tone =
    risk >= 70
      ? { bg: 'rgba(224,30,44,0.12)', color: '#E01E2C', label: 'HIGH' }
      : risk >= 50
      ? { bg: 'rgba(255,184,0,0.12)', color: '#FFB800', label: 'MED' }
      : { bg: 'rgba(0,217,126,0.12)', color: '#00D97E', label: 'LOW' };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 20,
        background: tone.bg,
        color: tone.color,
      }}
    >
      {tone.label} · {risk}
    </span>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div
      style={{
        width: 80,
        height: 6,
        background: 'var(--s2)',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${pct}%`, height: '100%', background: '#E01E2C' }} />
    </div>
  );
}
