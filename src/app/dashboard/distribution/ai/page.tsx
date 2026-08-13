'use client';
/**
 * Distribution → AI Copilot & Agents (Phase 2). Agents with Suggest→Approve→Auto
 * autonomy (persisted), the Replenishment agent's live suggestions (real
 * velocity + LLM rationale), and the conversational control tower (ask KINI over
 * your live distribution data). Backed by /api/v1/distribution/ai/*.
 */
import { useCallback, useEffect, useState } from 'react';
import { palette as C, Card, PageHeader, Pill, Btn } from '../../../../components/distribution/Atoms';
import api from '../../../../lib/api';

interface Agent { key: string; name: string; icon: string; desc: string; autonomy: 'suggest' | 'approve' | 'auto' }
interface ReplItem { sku_id: string; name: string; last30: number; prior30: number; trendPct: number; suggested_qty: number }
interface ReplGroup { distributor_id: string; distributor_name: string; items: ReplItem[]; total_units: number }

const LEVELS: Array<Agent['autonomy']> = ['suggest', 'approve', 'auto'];
const LEVEL_LABEL: Record<string, string> = { suggest: 'Suggest', approve: 'Approve', auto: 'Auto' };

export default function DistributionAiPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [repl, setRepl] = useState<{ suggestions: ReplGroup[]; rationale: string } | null>(null);
  const [coverage, setCoverage] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r, c, an]: any = await Promise.all([
        api.getDistAgents(),
        api.getReplenishment().catch(() => null),
        api.getDistCoverage().catch(() => null),
        api.getDistAnomalies().catch(() => null),
      ]);
      setAgents(((a?.data ?? a)?.agents || []) as Agent[]);
      const rp = (r?.data ?? r);
      if (rp) setRepl({ suggestions: rp.suggestions || [], rationale: rp.rationale || '' });
      setCoverage((c?.data ?? c) || null);
      setAnomalies((an?.data ?? an) || null);
    } catch { /* surfaced via empty states */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setAutonomy = async (key: string, autonomy: Agent['autonomy']) => {
    setAgents((prev) => prev.map((a) => (a.key === key ? { ...a, autonomy } : a)));
    setSaving(key);
    try { await api.saveDistAgent(key, autonomy); } catch { /* revert on error */ await load(); }
    finally { setSaving(null); }
  };

  // ── Conversational control tower ─────────────────────────────────────────
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const ask = async (question?: string) => {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ(text); setAsking(true); setAnswer(null);
    try { const r: any = await api.askDistKini(text); setAnswer((r?.data ?? r)?.answer || 'No answer.'); }
    catch (e: any) { setAnswer(e?.message || 'KINI is unavailable right now.'); }
    finally { setAsking(false); }
  };
  const EXAMPLES = ['Which distributors will stock out this week?', 'Where is coverage weakest?', 'What should I reorder first?'];

  return (
    <div>
      <PageHeader title="AI Copilot & Agents" subtitle="Agents that do the work at the autonomy you choose — plus a control tower you can just ask." />

      {/* Conversational control tower */}
      <div style={{ background: 'linear-gradient(120deg, rgba(139,123,240,0.10), var(--s1))', border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', flex: 'none', background: 'conic-gradient(from 210deg, #8B7BF0, var(--green), #F59E0B, #8B7BF0)', boxShadow: '0 0 20px -4px #8B7BF0' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
            placeholder="Ask KINI about your distribution…"
            style={{ flex: 1, background: 'transparent', border: 'none', color: C.text, fontSize: 15, outline: 'none' }} />
          <Btn onClick={() => ask()} disabled={asking || !q.trim()}>{asking ? 'Thinking…' : 'Ask'}</Btn>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => ask(e)} style={{ fontSize: 12, color: C.dim, background: 'var(--s3)', border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }}>{e}</button>
          ))}
        </div>
        {answer && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 14, lineHeight: 1.55, color: C.text }}>{answer}</div>}
      </div>

      {/* Agents */}
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, fontWeight: 700, margin: '4px 2px 10px' }}>Agents</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 20 }}>
        {(loading && !agents.length ? [] : agents).map((a) => (
          <Card key={a.key} style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 16, background: 'rgba(139,123,240,0.14)', border: `1px solid ${C.border}` }}>{a.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{a.name}</div>
              {saving === a.key && <span style={{ fontSize: 11, color: C.dim, marginLeft: 'auto' }}>saving…</span>}
            </div>
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 9, minHeight: 50 }}>{a.desc}</div>
            <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden', marginTop: 12 }}>
              {LEVELS.map((lv) => (
                <button key={lv} onClick={() => setAutonomy(a.key, lv)}
                  style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '7px 4px', cursor: 'pointer', border: 'none',
                    background: a.autonomy === lv ? 'var(--primary)' : 'transparent', color: a.autonomy === lv ? '#fff' : C.dim }}>
                  {LEVEL_LABEL[lv]}
                </button>
              ))}
            </div>
            {a.key === 'perfect_store' && <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>Preview — connects to the planogram engine next.</div>}
          </Card>
        ))}
      </div>

      {/* Replenishment suggestions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 10px' }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, fontWeight: 700 }}>Replenishment agent · suggestions</div>
        <Pill color="blue">live</Pill>
        <Btn variant="ghost" onClick={load}>↻</Btn>
      </div>
      {repl?.rationale && (
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: 'var(--s1)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <div style={{ fontSize: 13.5, color: C.text }}>{repl.rationale}</div>
        </div>
      )}
      {(!repl || repl.suggestions.length === 0) ? (
        <Card style={{ color: C.dim, fontSize: 13 }}>{loading ? 'Computing sell-out velocity…' : 'Not enough recent order history to suggest replenishment yet.'}</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {repl.suggestions.map((g) => (
            <Card key={g.distributor_id} style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{g.distributor_name}</div>
                <Pill color="gray">{g.total_units.toLocaleString('en-IN')} units</Pill>
              </div>
              <div style={{ marginTop: 10 }}>
                {g.items.map((it) => (
                  <div key={it.sku_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                      <div style={{ fontSize: 11.5, color: C.dim }}>{it.last30} last 30d · <span style={{ color: it.trendPct >= 0 ? 'var(--green)' : 'var(--primary)' }}>{it.trendPct >= 0 ? '▲' : '▼'}{Math.abs(it.trendPct)}%</span></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{it.suggested_qty}</div>
                      <div style={{ fontSize: 10.5, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>suggest</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}><Btn>Approve → draft order</Btn></div>
            </Card>
          ))}
        </div>
      )}

      {/* Coverage agent */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '22px 2px 10px' }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, fontWeight: 700 }}>Coverage agent · gaps</div>
        <Pill color="blue">live</Pill>
      </div>
      {coverage?.rationale && (
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: 'var(--s1)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>🧭</span><div style={{ fontSize: 13.5, color: C.text }}>{coverage.rationale}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Dormant outlets</div>
            <Pill color="amber">{coverage?.dormant_count ?? 0}</Pill>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.dim }}>{coverage?.coverage_pct ?? 0}% covered</span>
          </div>
          {(!coverage || (coverage.dormant || []).length === 0) ? (
            <div style={{ color: C.dim, fontSize: 13, marginTop: 10 }}>{loading ? 'Scanning outlets…' : 'No dormant outlets — coverage is healthy.'}</div>
          ) : (coverage.dormant || []).slice(0, 12).map((d: any) => (
            <div key={d.outlet_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
              <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>{d.days}d</span>
            </div>
          ))}
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Never ordered</div>
            <Pill color="gray">{coverage?.never_count ?? 0}</Pill>
          </div>
          {(!coverage || (coverage.never_ordered || []).length === 0) ? (
            <div style={{ color: C.dim, fontSize: 13, marginTop: 10 }}>{loading ? '…' : 'Every mapped outlet has ordered.'}</div>
          ) : (coverage.never_ordered || []).slice(0, 12).map((d: any) => (
            <div key={d.outlet_id} style={{ padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
          ))}
        </Card>
      </div>

      {/* Anomaly agent */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '22px 2px 10px' }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, fontWeight: 700 }}>Anomaly agent · pricing leakage</div>
        <Pill color="blue">live</Pill>
        {anomalies?.total_impact > 0 && <Pill color="red">₹{Number(anomalies.total_impact).toLocaleString('en-IN')} at risk</Pill>}
      </div>
      {anomalies?.rationale && (
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: 'var(--s1)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>🕵️</span><div style={{ fontSize: 13.5, color: C.text }}>{anomalies.rationale}</div>
        </div>
      )}
      <Card style={{ padding: 16 }}>
        {(!anomalies || (anomalies.anomalies || []).length === 0) ? (
          <div style={{ color: C.dim, fontSize: 13 }}>{loading ? 'Auditing order prices…' : 'No pricing anomalies — every line is within 15% of list.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
              <thead><tr>
                {['SKU', 'Distributor', 'Billed', 'Expected', 'Δ', 'Leakage'].map((h) => (
                  <th key={h} style={{ textAlign: h === 'SKU' || h === 'Distributor' ? 'left' : 'right', padding: '8px 10px', fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(anomalies.anomalies || []).slice(0, 12).map((a: any, i: number) => (
                  <tr key={i}>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{a.sku}</td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, color: C.dim }}>{a.distributor}</td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right' }}>₹{a.unit_price}</td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: C.dim }}>₹{a.expected}</td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', color: a.dev_pct < 0 ? 'var(--primary)' : 'var(--green)', fontWeight: 700 }}>{a.dev_pct > 0 ? '+' : ''}{a.dev_pct}%</td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontWeight: 700 }}>{a.impact > 0 ? `₹${Number(a.impact).toLocaleString('en-IN')}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
