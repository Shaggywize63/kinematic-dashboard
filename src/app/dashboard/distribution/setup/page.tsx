'use client';
/**
 * Distribution → Network Setup. The onboarding-first front door: define your own
 * route-to-market stages (generic, not FMCG-only), then work a checklist that
 * links into the existing master pages and shows real completion. Stages persist
 * via POST /api/v1/distribution/stages and drive the Control Tower spine.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import api from '../../../../lib/api';
import { palette as C, Card, Row, PageHeader, Pill, Btn } from '../../../../components/distribution/Atoms';

interface Stage { key: string; label: string; entity?: string | null; icon?: string | null; optional?: boolean; }

const PRESETS: Stage[] = [
  { key: 'super_stockist', label: 'Super-stockist', entity: 'distributor', icon: '🏬' },
  { key: 'wholesaler', label: 'Wholesaler', entity: 'distributor', icon: '📦' },
  { key: 'sub_distributor', label: 'Sub-distributor', entity: 'distributor', icon: '🚚' },
  { key: 'fabricator', label: 'Fabricator / contractor', entity: 'outlet', icon: '🛠️' },
  { key: 'modern_trade', label: 'Modern-trade chain', entity: 'outlet', icon: '🏙️' },
];

export default function NetworkSetupPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [tower, setTower] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t]: any = await Promise.all([api.getDistStages(), api.getControlTower({ ai: '0' }).catch(() => null)]);
      const payload = (s?.data ?? s);
      setStages((payload?.stages || []) as Stage[]);
      setIsDefault(!!payload?.is_default);
      setTower((t?.data ?? t) || null);
    } catch { setStages([]); }
    finally { setLoading(false); setDirty(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const mutate = (fn: (s: Stage[]) => Stage[]) => { setStages((prev) => fn(prev)); setDirty(true); setMsg(null); };
  const rename = (i: number, label: string) => mutate((s) => s.map((x, j) => (j === i ? { ...x, label } : x)));
  const remove = (i: number) => mutate((s) => s.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => mutate((s) => {
    const j = i + dir; if (j < 0 || j >= s.length) return s;
    const next = s.slice(); [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const addPreset = (p: Stage) => mutate((s) => {
    if (s.some((x) => x.key === p.key)) return s;
    // insert before the final (end-customer) stage by convention
    const idx = Math.max(1, s.length - 1);
    const next = s.slice(); next.splice(idx, 0, { ...p }); return next;
  });
  const addCustom = () => mutate((s) => {
    const next = s.slice(); next.splice(Math.max(1, s.length - 1), 0, { key: `stage_${Date.now()}`, label: 'New stage', icon: '•' }); return next;
  });

  const save = async () => {
    if (stages.length < 2) { setMsg({ ok: false, text: 'Keep at least a source and an end customer.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const r: any = await api.saveDistStages(stages.map((s) => ({ key: s.key, label: s.label, entity: s.entity ?? null, icon: s.icon ?? null, optional: !!s.optional })));
      const payload = (r?.data ?? r);
      setStages((payload?.stages || stages) as Stage[]);
      setIsDefault(false); setDirty(false);
      setMsg({ ok: true, text: 'Saved — your Control Tower spine now uses these stages.' });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save stages.' }); }
    finally { setSaving(false); }
  };

  const sp = tower?.spine;
  const checklist = useMemo(() => ([
    { done: (sp?.brand?.count ?? 0) > 0, label: 'Add your brand & catalog', hint: sp ? `${sp.brand.count} brand · ${sp.brand.skus} SKUs` : '', href: '/dashboard/distribution/brands' },
    { done: (sp?.brand?.price_lists ?? 0) > 0, label: 'Set price lists', hint: sp ? `${sp.brand.price_lists} lists` : '', href: '/dashboard/distribution/price-lists' },
    { done: (sp?.distributor?.count ?? 0) > 0, label: 'Add distributors', hint: sp ? `${sp.distributor.count} added` : '', href: '/dashboard/distribution/distributors' },
    { done: (sp?.retailer?.count ?? 0) > 0, label: 'Map retailers & beats', hint: sp ? `${sp.retailer.count} outlets` : '', href: '/dashboard/distribution/distributors' },
    { done: (sp?.consumer?.count ?? 0) > 0, label: 'Reach end customers', hint: sp ? `${sp.consumer.count} registered` : '', href: '/dashboard/distribution/last-mile' },
  ]), [sp]);
  const pct = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);

  return (
    <div>
      <PageHeader
        title="Network Setup"
        subtitle="Define your route to market, then add your network. Everything downstream is generated from this."
        right={<Link href="/dashboard/distribution/control-tower"><Btn variant="ghost">Open Control Tower →</Btn></Link>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,320px)', gap: 16 }}>
        {/* Stage builder */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Your route to market</div>
            {isDefault && <Pill color="amber">default</Pill>}
            {dirty && <Pill color="blue">unsaved</Pill>}
          </div>
          <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 14 }}>Rename, reorder or remove stages. This is what makes the module generic — model FMCG, building-materials or D2C.</div>

          {loading ? <div style={{ color: C.dim, fontSize: 13 }}>Loading…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stages.map((s, i) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 12px' }}>
                  <span style={{ fontSize: 18 }}>{s.icon || '•'}</span>
                  <input value={s.label} onChange={(e) => rename(i, e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: 'none', color: C.text, fontSize: 14, fontWeight: 600, outline: 'none' }} />
                  <span style={{ fontSize: 11, color: C.dim }}>{i === 0 ? 'source' : i === stages.length - 1 ? 'end customer' : (s.entity || 'stage')}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up" style={arrowBtn(i === 0)}>↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === stages.length - 1} title="Move down" style={arrowBtn(i === stages.length - 1)}>↓</button>
                  <button onClick={() => remove(i)} disabled={stages.length <= 2} title="Remove" style={{ ...arrowBtn(stages.length <= 2), color: C.red }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Insert a stage</div>
            <Row style={{ gap: 8 }}>
              {PRESETS.map((p) => (
                <button key={p.key} onClick={() => addPreset(p)} disabled={stages.some((x) => x.key === p.key)}
                  style={presetBtn(stages.some((x) => x.key === p.key))}>{p.icon} {p.label}</button>
              ))}
              <button onClick={addCustom} style={presetBtn(false)}>＋ Custom</button>
            </Row>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <Btn onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save stages'}</Btn>
            {dirty && <Btn variant="ghost" onClick={load}>Reset</Btn>}
            {msg && <span style={{ fontSize: 12.5, color: msg.ok ? C.green : C.red }}>{msg.text}</span>}
          </div>
        </Card>

        {/* Setup checklist */}
        <Card>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Setup checklist</div>
          <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 12 }}>{pct}% complete</div>
          <div style={{ height: 7, borderRadius: 99, background: C.s3, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {checklist.map((c) => (
              <Link key={c.label} href={c.href} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: c.done ? 'rgba(34,197,94,0.08)' : 'transparent' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: c.done ? 'var(--green)' : 'var(--s3)', color: c.done ? '#04150F' : C.dim }}>{c.done ? '✓' : ''}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{c.label}</div>
                    {c.hint && <div style={{ fontSize: 11.5, color: C.dim }}>{c.hint}</div>}
                  </div>
                  <span style={{ color: C.dim, fontSize: 16 }}>›</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function arrowBtn(disabled: boolean): CSSProperties {
  return { background: 'transparent', border: `1px solid var(--border)`, color: 'var(--text-dim)', borderRadius: 7, width: 26, height: 26, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, fontSize: 12 };
}
function presetBtn(added: boolean): CSSProperties {
  return { background: 'var(--s3)', border: `1px dashed var(--border)`, color: added ? 'var(--text-dim)' : 'var(--text)', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, cursor: added ? 'not-allowed' : 'pointer', opacity: added ? 0.5 : 1 };
}
