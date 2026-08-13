'use client';
/**
 * Distribution → Control Tower. The redesigned overview: one route-to-market
 * spine (brand → distributor → retailer → end customer) with live counts +
 * coverage, headline KPIs, a KINI AI briefing, data-driven AI signals, and a
 * short demand forecast. All from GET /api/v1/distribution/control-tower.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '../../../../lib/api';
import { palette as C, Card, Row, StatCard, PageHeader, Pill, Btn, inr } from '../../../../components/distribution/Atoms';

interface Stage { key: string; label: string; entity?: string | null; icon?: string | null; optional?: boolean; }
interface Signal { type: string; severity: 'critical' | 'warning' | 'ai'; title: string; detail: string; action?: string }
interface Tower {
  spine: {
    brand: { count: number; skus: number; price_lists: number; schemes: number };
    distributor: { count: number; healthy: number; at_risk: number };
    retailer: { count: number; covered: number; coverage_pct: number; dormant: number };
    consumer: { count: number; new_this_week: number };
  };
  kpis: { gmv_today: number; gmv_30d: number; orders_30d: number; outstanding: number; coverage_pct: number; dormant_outlets: number };
  signals: Signal[];
  forecast: Array<{ sku_id: string; name: string; qty30: number; prior30: number; trendPct: number; projectedNext30: number }>;
  narrative: string;
  generated_at: string;
}

const DEFAULT_STAGES: Stage[] = [
  { key: 'brand', label: 'Brand', entity: 'brand', icon: '🏭' },
  { key: 'distributor', label: 'Distributor', entity: 'distributor', icon: '🏢' },
  { key: 'retailer', label: 'Retailer', entity: 'outlet', icon: '🏪' },
  { key: 'consumer', label: 'End customer', entity: 'consumer', icon: '🧑' },
];

const sevPill = (s: Signal['severity']) => (s === 'critical' ? 'red' : s === 'warning' ? 'amber' : 'blue') as 'red' | 'amber' | 'blue';
const sevIcon = (s: Signal['severity']) => (s === 'critical' ? '⚠️' : s === 'warning' ? '💤' : '✨');

export default function ControlTowerPage() {
  const [tower, setTower] = useState<Tower | null>(null);
  const [stages, setStages] = useState<Stage[]>(DEFAULT_STAGES);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [t, s]: any = await Promise.all([
        api.getControlTower(),
        api.getDistStages().catch(() => null),
      ]);
      const payload = (t?.data ?? t) as Tower;
      setTower(payload);
      const st = (s?.data ?? s)?.stages as Stage[] | undefined;
      if (st && st.length) setStages(st);
    } catch (e: any) {
      setErr(e?.message || 'Could not load the control tower.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ask = async (question?: string) => {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ(text); setAsking(true); setAnswer(null);
    try { const r: any = await api.askDistKini(text); setAnswer((r?.data ?? r)?.answer || 'No answer.'); }
    catch (e: any) { setAnswer(e?.message || 'KINI is unavailable right now.'); }
    finally { setAsking(false); }
  };

  // Map each configured stage to its live metric from the spine.
  const nodes = useMemo(() => {
    const sp = tower?.spine;
    return stages.map((stage) => {
      const e = stage.entity || stage.key;
      if (sp && (e === 'brand')) return { stage, big: sp.brand.count, unit: 'brand' + (sp.brand.count === 1 ? '' : 's'), sub: `${sp.brand.skus} SKUs · ${sp.brand.schemes} schemes`, health: 'green' as const };
      if (sp && (e === 'distributor')) return { stage, big: sp.distributor.count, unit: 'distributors', sub: `${sp.distributor.healthy} healthy · ${sp.distributor.at_risk} at risk`, health: sp.distributor.at_risk ? 'amber' as const : 'green' as const };
      if (sp && (e === 'outlet' || e === 'retailer')) return { stage, big: sp.retailer.count, unit: 'outlets', sub: `${sp.retailer.coverage_pct}% covered · ${sp.retailer.dormant} dormant`, health: sp.retailer.coverage_pct < 70 ? 'amber' as const : 'green' as const };
      if (sp && (e === 'consumer')) return { stage, big: sp.consumer.count, unit: 'consumers', sub: `+${sp.consumer.new_this_week} this week`, health: 'green' as const };
      return { stage, big: 0, unit: '', sub: 'configure', health: 'gray' as const };
    });
  }, [stages, tower]);

  return (
    <div>
      <PageHeader
        title="Control Tower"
        subtitle="How your product reaches the end customer — brand to consumer, with AI watching the whole route."
        right={<Row style={{ gap: 8 }}>
          <Link href="/dashboard/distribution/setup"><Btn variant="ghost">Network Setup</Btn></Link>
          <Btn variant="ghost" onClick={load}>↻ Refresh</Btn>
        </Row>}
      />

      {err && <Card style={{ borderColor: 'rgba(224,30,44,0.3)', color: C.red, marginBottom: 16 }}>{err} <span style={{ color: C.dim }}>— the endpoint deploys with the backend; try again shortly.</span></Card>}

      {/* KINI AI briefing */}
      {(tower?.narrative || loading) && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: 'linear-gradient(120deg, rgba(139,123,240,0.10), var(--s1))', border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', flex: 'none', background: 'conic-gradient(from 210deg, #8B7BF0, var(--green), #F59E0B, #8B7BF0)', boxShadow: '0 0 20px -4px #8B7BF0' }} />
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, fontWeight: 700, marginBottom: 4 }}>KINI briefing</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.55, color: C.text }}>{loading && !tower ? 'Reading your network…' : tower?.narrative}</div>
          </div>
        </div>
      )}

      {/* Ask KINI — conversational control tower */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: 'var(--s1)', padding: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 15 }}>✨</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
            placeholder="Ask KINI about your network — e.g. which distributors will stock out this week?"
            style={{ flex: 1, background: 'transparent', border: 'none', color: C.text, fontSize: 14, outline: 'none' }} />
          <Btn onClick={() => ask()} disabled={asking || !q.trim()}>{asking ? 'Thinking…' : 'Ask'}</Btn>
        </div>
        {answer && <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 13.5, color: C.text, lineHeight: 1.55 }}>{answer}</div>}
      </div>

      {/* KPIs */}
      <Row style={{ marginBottom: 18 }}>
        <StatCard label="GMV · last 30 days" value={inr(tower?.kpis.gmv_30d ?? 0)} hint={`${inr(tower?.kpis.gmv_today ?? 0)} today`} />
        <StatCard label="Outlet coverage" value={`${tower?.kpis.coverage_pct ?? 0}%`} hint={`${tower?.spine.retailer.covered ?? 0} of ${tower?.spine.retailer.count ?? 0} ordered (30d)`} accent={(tower?.kpis.coverage_pct ?? 0) < 70 ? '#F59E0B' : undefined} />
        <StatCard label="Orders · 30 days" value={String(tower?.kpis.orders_30d ?? 0)} />
        <StatCard label="Outstanding" value={inr(tower?.kpis.outstanding ?? 0)} accent={(tower?.kpis.outstanding ?? 0) > 0 ? '#F59E0B' : undefined} />
        <StatCard label="Consumers reached" value={String(tower?.spine.consumer.count ?? 0)} hint={`+${tower?.spine.consumer.new_this_week ?? 0} this week`} accent={C.green} />
      </Row>

      {/* Route-to-market spine */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, fontWeight: 700, marginBottom: 14 }}>Route to market</div>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'stretch' }}>
          {nodes.map((n, i) => (
            <div key={n.stage.key} style={{ display: 'flex', alignItems: 'stretch', flex: '1 1 200px', minWidth: 190 }}>
              <div style={{ flex: 1, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 15, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', fontSize: 16, background: 'rgba(139,123,240,0.14)', border: `1px solid ${C.border}` }}>{n.stage.icon || '•'}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{n.stage.label}
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginLeft: 7, verticalAlign: 'middle', background: n.health === 'green' ? 'var(--green)' : n.health === 'amber' ? '#F59E0B' : 'var(--text-dim)' }} />
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 10 }}>{n.big.toLocaleString('en-IN')} <span style={{ fontSize: 12, fontWeight: 600, color: C.dim }}>{n.unit}</span></div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{n.sub}</div>
              </div>
              {i < nodes.length - 1 && (
                <div style={{ width: 26, display: 'grid', placeItems: 'center', color: '#F59E0B', fontSize: 18 }}>→</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Signals + Forecast */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,360px)', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>AI signals</div>
            <Pill color="blue">act in one tap</Pill>
          </div>
          {(!tower || tower.signals.length === 0) ? (
            <div style={{ color: C.dim, fontSize: 13, padding: '16px 0' }}>{loading ? 'Scanning…' : 'No signals right now — your network is running clean.'}</div>
          ) : tower.signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', fontSize: 15, background: 'var(--s3)' }}>{sevIcon(s.severity)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.title}</span>
                  <Pill color={sevPill(s.severity)}>{s.type}</Pill>
                </div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>{s.detail}</div>
                {s.action && <div style={{ marginTop: 8 }}><Btn>{s.action}</Btn></div>}
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Demand forecast</div>
            <Pill color="blue">AI</Pill>
          </div>
          {(!tower || tower.forecast.length === 0) ? (
            <div style={{ color: C.dim, fontSize: 13 }}>{loading ? 'Computing velocity…' : 'Not enough order history yet to forecast.'}</div>
          ) : tower.forecast.map((f) => (
            <div key={f.sku_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ fontSize: 11.5, color: C.dim }}>{f.qty30} last 30d → <b style={{ color: C.text }}>{f.projectedNext30}</b> next 30d</div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: f.trendPct >= 0 ? 'var(--green)' : 'var(--primary)' }}>{f.trendPct >= 0 ? '▲' : '▼'} {Math.abs(f.trendPct)}%</span>
            </div>
          ))}
        </Card>
      </div>

      {tower?.generated_at && <div style={{ fontSize: 11, color: C.dim, marginTop: 14 }}>Updated {new Date(tower.generated_at).toLocaleString('en-IN')}</div>}
    </div>
  );
}
