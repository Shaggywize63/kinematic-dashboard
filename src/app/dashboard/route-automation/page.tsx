'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';

/**
 * Automated Route Plans — the manager picks an auto-assignment METHOD; the
 * backend (route-team-autoplan) distributes each day's due outlets across all
 * field executives and assigns a plan to each. The chosen method is saved
 * (org_settings 'route_autoplan.policy') and editable any time. "Manual only"
 * turns auto-assignment off; plans can always be added by hand on Route Plan.
 *
 * Wires the backend endpoints:
 *   GET  /route-plans/autoplan/methods   — method catalog + vehicle types
 *   GET  /route-plans/autoplan/policy    — current org policy
 *   PUT  /route-plans/autoplan/policy    — save the method + params
 *   POST /route-plans/autoplan/preview   — dry-run per-FE assignment
 *   POST /route-plans/autoplan/run       — generate + assign across all FEs
 */

type MethodMeta = {
  id: string;
  label: string;
  tagline: string;
  description: string;
  automatic: boolean;
  uses: Array<'max_outlets_per_fe' | 'vehicle_type' | 'max_radius_km'>;
};
type Params = { max_outlets_per_fe: number; vehicle_type: string; max_radius_km: number };
type Policy = {
  method: string;
  params: Params;
  schedule: { enabled: boolean; time: string };
  updated_at?: string | null;
  methods?: MethodMeta[];
  vehicle_types?: string[];
};
type FeDraft = {
  user_id: string; user_name: string; total_km: number; est_co2_kg: number;
  start_source: string; stops: Array<{ store_id: string; store_name: string; visit_order: number; reason: string }>;
};
type PreviewResult = {
  method: string; plan_date: string; vehicle_type: string; fes: FeDraft[];
  summary: {
    fe_count: number; considered: number; due_pool: number; assigned_outlets: number;
    unassigned_outlets: number; skipped_no_geo: number; skipped_already_planned: number; cap_per_fe: number;
  };
};
type RunResult = {
  method: string; plan_date: string; replaced: number; plans_created: number;
  summary: PreviewResult['summary'];
};

const C = {
  bg: 'var(--bg)', s2: 'var(--s2)', s3: 'var(--s3)', text: 'var(--text)',
  sec: 'var(--textSec)', tert: 'var(--textTert)', border: 'var(--border)',
  green: '#00D97E', red: '#E01E2C', blue: '#2f5fd0',
};

const humanizeVehicle = (v: string) =>
  v.replace(/^(\d)w/, '$1W').split('_').map((p) => (/^\dW$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The api client returns the raw { success, data } envelope (it does not unwrap
// .data on the main path), so read .data when present — matching route-priorities.
const unwrap = <T,>(r: any): T => (r && typeof r === 'object' && 'data' in r ? (r as any).data : r) as T;

const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 };
const btn = (bg: string, disabled = false): React.CSSProperties => ({
  background: disabled ? C.s3 : bg, color: disabled ? C.tert : '#fff', border: 'none', borderRadius: 8,
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
});
const ghostBtn: React.CSSProperties = {
  background: C.s3, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

export default function RouteAutomationPage() {
  const [methods, setMethods] = useState<MethodMeta[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
  const [method, setMethod] = useState<string>('cadence_priority');
  const [params, setParams] = useState<Params>({ max_outlets_per_fe: 15, vehicle_type: '2w_petrol', max_radius_km: 25 });
  const [savedMethod, setSavedMethod] = useState<string>('cadence_priority');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [planDate, setPlanDate] = useState<string>(todayISO());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [catRaw, polRaw] = await Promise.all([
        api.get<any>('/api/v1/route-plans/autoplan/methods'),
        api.get<any>('/api/v1/route-plans/autoplan/policy'),
      ]);
      const cat = unwrap<{ methods?: MethodMeta[]; vehicle_types?: string[] }>(catRaw);
      const pol = unwrap<Policy>(polRaw);
      setMethods(cat?.methods || pol?.methods || []);
      setVehicleTypes(cat?.vehicle_types || pol?.vehicle_types || []);
      if (pol) {
        setMethod(pol.method); setSavedMethod(pol.method);
        setParams({
          max_outlets_per_fe: pol.params?.max_outlets_per_fe ?? 15,
          vehicle_type: pol.params?.vehicle_type ?? '2w_petrol',
          max_radius_km: pol.params?.max_radius_km ?? 25,
        });
        setUpdatedAt(pol.updated_at ?? null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load automation settings');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => methods.find((m) => m.id === method), [methods, method]);
  const isManual = method === 'manual';
  const dirty = method !== savedMethod; // params always save with the method

  const chooseMethod = (id: string) => {
    setMethod(id); setPreview(null); setRunResult(null); setNotice(null); setError(null);
  };

  const saveMethod = async () => {
    setSaving(true); setError(null); setNotice(null);
    try {
      const body = { method, params, schedule: { enabled: false, time: '06:00' } };
      const res = unwrap<Policy>(await api.put<any>('/api/v1/route-plans/autoplan/policy', body));
      setSavedMethod(method);
      setUpdatedAt(res?.updated_at ?? new Date().toISOString());
      setNotice('Method saved as the org default.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const runPreview = async () => {
    setPreviewing(true); setError(null); setNotice(null); setRunResult(null);
    try {
      const res = unwrap<PreviewResult>(await api.post<any>('/api/v1/route-plans/autoplan/preview', { plan_date: planDate, method, params }));
      setPreview(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally { setPreviewing(false); }
  };

  const runAssign = async () => {
    setRunning(true); setError(null); setNotice(null);
    try {
      const res = unwrap<RunResult>(await api.post<any>('/api/v1/route-plans/autoplan/run', { plan_date: planDate, method, params }));
      setRunResult(res);
      setNotice(`Assigned ${res.plans_created} plan${res.plans_created === 1 ? '' : 's'} for ${planDate}${res.replaced ? ` (replaced ${res.replaced} previous auto plan${res.replaced === 1 ? '' : 's'})` : ''}.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Assignment failed');
    } finally { setRunning(false); }
  };

  const s = preview?.summary;

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--heading, inherit)', fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>Automated Route Plans</h1>
          <p style={{ fontSize: 13, color: C.sec, margin: '4px 0 0' }}>
            Choose how outlets are auto-assigned to field executives. The method is saved and can be changed any time. You can always <Link href="/dashboard/route-plan" style={{ color: C.red }}>add a plan manually</Link>.
          </p>
        </div>
        <Link href="/dashboard/route-plan" style={{ ...ghostBtn, textDecoration: 'none' }}>+ Add manually</Link>
      </div>

      {error && <div style={{ margin: '16px 0 0', fontSize: 13, color: C.red, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>{error}</div>}
      {notice && <div style={{ margin: '16px 0 0', fontSize: 13, color: C.green, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>{notice}</div>}
      {loading && <div style={{ color: C.tert, fontSize: 13, marginTop: 16 }}>Loading…</div>}

      {!loading && (
        <>
          {/* METHOD PICKER */}
          <div style={{ marginTop: 20, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.tert }}>Assignment method</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 10 }}>
            {methods.map((m) => {
              const sel = m.id === method;
              return (
                <button key={m.id} onClick={() => chooseMethod(m.id)} style={{
                  textAlign: 'left', cursor: 'pointer', background: C.s2,
                  border: `1.5px solid ${sel ? C.red : C.border}`, borderRadius: 12, padding: 14,
                  boxShadow: sel ? `0 0 0 3px rgba(224,30,44,.12)` : 'none', position: 'relative',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${sel ? C.red : C.border}`, background: sel ? C.red : 'transparent', flexShrink: 0 }} />
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{m.label}</span>
                    {!m.automatic && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: C.tert, border: `1px solid ${C.border}`, borderRadius: 6, padding: '1px 6px' }}>MANUAL</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sec, fontWeight: 600, marginBottom: 6 }}>{m.tagline}</div>
                  <div style={{ fontSize: 12, color: C.tert, lineHeight: 1.5 }}>{m.description}</div>
                </button>
              );
            })}
          </div>

          {/* CONFIG + ACTIONS */}
          <div style={{ ...card, marginTop: 16 }}>
            {isManual ? (
              <div style={{ fontSize: 13, color: C.sec }}>
                Auto-assignment is <strong>off</strong>. Save this to keep it off, or pick an automatic method above. Build plans yourself on <Link href="/dashboard/route-plan" style={{ color: C.red }}>Route Plan</Link> and set outlet cadence on <Link href="/dashboard/route-priorities" style={{ color: C.red }}>Outlet Priorities</Link>.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ fontSize: 11, color: C.tert }}>Plan date
                  <input type="date" value={planDate} onChange={(e) => { setPlanDate(e.target.value); setPreview(null); setRunResult(null); }}
                    style={{ display: 'block', marginTop: 4, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 11, color: C.tert }}>Max stops / rep
                  <input type="number" min={1} max={50} value={params.max_outlets_per_fe}
                    onChange={(e) => setParams((p) => ({ ...p, max_outlets_per_fe: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
                    style={{ display: 'block', marginTop: 4, width: 90, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 11, color: C.tert }}>Vehicle
                  <select value={params.vehicle_type} onChange={(e) => setParams((p) => ({ ...p, vehicle_type: e.target.value }))}
                    style={{ display: 'block', marginTop: 4, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13 }}>
                    {vehicleTypes.map((v) => <option key={v} value={v}>{humanizeVehicle(v)}</option>)}
                  </select>
                </label>
                {active?.uses.includes('max_radius_km') && (
                  <label style={{ fontSize: 11, color: C.tert }}>Max radius (km)
                    <input type="number" min={1} max={500} value={params.max_radius_km}
                      onChange={(e) => setParams((p) => ({ ...p, max_radius_km: Math.max(1, Math.min(500, Number(e.target.value) || 1)) }))}
                      style={{ display: 'block', marginTop: 4, width: 90, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13 }} />
                  </label>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={saveMethod} disabled={saving} style={dirty ? btn(C.blue, saving) : ghostBtn}>
                {saving ? 'Saving…' : dirty ? 'Save method' : 'Method saved'}
              </button>
              {!isManual && (
                <>
                  <button onClick={runPreview} disabled={previewing} style={{ ...ghostBtn, opacity: previewing ? 0.6 : 1 }}>
                    {previewing ? 'Previewing…' : 'Preview assignment'}
                  </button>
                  <button onClick={runAssign} disabled={running} style={btn(C.red, running)}>
                    {running ? 'Assigning…' : 'Generate & assign'}
                  </button>
                </>
              )}
              {updatedAt && <span style={{ fontSize: 11, color: C.tert, marginLeft: 'auto' }}>Saved method: <strong style={{ color: C.sec }}>{methods.find((m) => m.id === savedMethod)?.label || savedMethod}</strong></span>}
            </div>
          </div>

          {/* RUN RESULT */}
          {runResult && (
            <div style={{ ...card, marginTop: 16, borderColor: C.green }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Assigned {runResult.plans_created} plan{runResult.plans_created === 1 ? '' : 's'} for {runResult.plan_date}</div>
              <div style={{ fontSize: 12.5, color: C.sec, marginTop: 4 }}>
                {runResult.summary.assigned_outlets} outlets across {runResult.summary.fe_count} field executives
                {runResult.replaced ? ` · replaced ${runResult.replaced} previous auto plan${runResult.replaced === 1 ? '' : 's'}` : ''}
                {runResult.summary.unassigned_outlets ? ` · ${runResult.summary.unassigned_outlets} couldn't be placed (over capacity)` : ''}.
              </div>
              <Link href={`/dashboard/route-plan?date=${runResult.plan_date}`} style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-block', marginTop: 12 }}>View route plans →</Link>
            </div>
          )}

          {/* PREVIEW */}
          {preview && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                {[
                  { l: 'Field executives', v: s!.fe_count },
                  { l: 'Outlets due', v: s!.due_pool },
                  { l: 'Will be assigned', v: s!.assigned_outlets },
                  { l: 'Unassigned', v: s!.unassigned_outlets, warn: s!.unassigned_outlets > 0 },
                  { l: 'Cap / rep', v: s!.cap_per_fe },
                ].map((t) => (
                  <div key={t.l} style={{ ...card, padding: 12 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: t.warn ? C.red : C.text }}>{t.v}</div>
                    <div style={{ fontSize: 11.5, color: C.tert, marginTop: 2 }}>{t.l}</div>
                  </div>
                ))}
              </div>

              {s!.skipped_no_geo + s!.skipped_already_planned > 0 && (
                <div style={{ fontSize: 12, color: C.tert, marginTop: 8 }}>
                  Skipped {s!.skipped_already_planned} already-planned and {s!.skipped_no_geo} with no coordinates.
                </div>
              )}

              <div style={{ ...card, marginTop: 12, padding: 0, overflow: 'hidden' }}>
                {preview.fes.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.tert, fontSize: 13 }}>No outlets are due — set cadence in Outlet Priorities, or check that reps have locations.</div>}
                {preview.fes.map((fe) => (
                  <div key={fe.user_id} style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fe.user_name}</span>
                      <span style={{ fontSize: 12, color: C.sec }}>{fe.stops.length} stop{fe.stops.length === 1 ? '' : 's'}</span>
                      <span style={{ fontSize: 12, color: C.tert }}>· {fe.total_km} km · {fe.est_co2_kg} kg CO₂</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: C.tert }}>start: {fe.start_source.replace(/_/g, ' ')}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.tert, marginTop: 6, lineHeight: 1.6 }}>
                      {fe.stops.slice(0, 12).map((st, i) => (
                        <span key={st.store_id}>
                          <span style={{ color: C.sec }}>{st.visit_order}.</span> {st.store_name}
                          {st.reason === 'high_priority' && <span style={{ color: C.red }}> ★</span>}
                          {i < Math.min(fe.stops.length, 12) - 1 ? '  ·  ' : ''}
                        </span>
                      ))}
                      {fe.stops.length > 12 && <span> … +{fe.stops.length - 12} more</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.tert, marginTop: 8 }}>Preview only — nothing is saved until you press <strong>Generate &amp; assign</strong>. ★ = high priority.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
