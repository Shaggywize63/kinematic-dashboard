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
type FeLoc = {
  user_id: string; name: string; start_source: string; has_location: boolean; has_live: boolean;
  base: { lat: number; lng: number } | null;
  last_capture: { lat: number; lng: number; at: string } | null;
};

const SOURCE_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  live_location: { label: 'Live', bg: 'rgba(0,217,126,.14)', fg: '#00A862' },
  base_location: { label: 'Base set', bg: 'rgba(47,95,208,.14)', fg: '#2f5fd0' },
  last_capture:  { label: 'Last known', bg: 'rgba(107,114,128,.16)', fg: '#6B7280' },
  zone_meeting:  { label: 'Zone', bg: 'rgba(107,114,128,.16)', fg: '#6B7280' },
  none:          { label: 'No location', bg: 'rgba(224,30,44,.14)', fg: '#E01E2C' },
};

// One glyph per assignment method so a card signals its TYPE at a glance.
const svg = (d: React.ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const METHOD_ICON: Record<string, React.ReactNode> = {
  // cadence & priority → clock (due-by-cadence)
  cadence_priority: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v4.8l3 1.8" /></>),
  // territory → folded map
  territory: svg(<><path d="M9 4 3 6.2v14L9 18l6 2 6-2.2v-14L15 6 9 4z" /><path d="M9 4v14M15 6v14" /></>),
  // geographic clusters → grouped points
  geo_cluster: svg(<><circle cx="7" cy="8" r="2.3" /><circle cx="16" cy="7" r="2.3" /><circle cx="11" cy="16" r="2.3" /><path d="M9 9.2l5-1M8.6 10l2 4M13.4 8.7 12.4 14" strokeDasharray="1.5 2" /></>),
  // nearest field executive → crosshair / target
  nearest_fe: svg(<><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" /></>),
  // balanced workload → equal bars
  balanced_workload: svg(<><path d="M6 20V9M12 20V9M18 20V9" /><path d="M4 6h16" /></>),
  // recurring journey plan → calendar
  recurring_pjp: svg(<><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8.5 15l2.2 2.2L15 13" /></>),
  // manual → pencil
  manual: svg(<><path d="M12 20h9" /><path d="M16.4 3.6a2 2 0 0 1 2.9 2.9L7.5 18.3 3.5 19.5l1.2-4L16.4 3.6z" /></>),
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
  const [fes, setFes] = useState<FeLoc[]>([]);
  const [showFes, setShowFes] = useState(false);
  const [feDraft, setFeDraft] = useState<Record<string, { lat: string; lng: string }>>({});
  const [feSaving, setFeSaving] = useState<string | null>(null);

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

  const loadFes = useCallback(async () => {
    try {
      const r = unwrap<FeLoc[]>(await api.get<any>('/api/v1/route-plans/autoplan/field-execs'));
      setFes(Array.isArray(r) ? r : []);
    } catch { /* non-fatal — the panel just stays empty */ }
  }, []);
  useEffect(() => { loadFes(); }, [loadFes]);

  const saveFeBase = async (uid: string, body: Record<string, unknown>) => {
    setFeSaving(uid); setError(null);
    try {
      await api.put('/api/v1/route-plans/autoplan/fe-location', { user_id: uid, ...body });
      await loadFes();
      setPreview(null); // location changed — a prior preview is stale
      setFeDraft((d) => { const n = { ...d }; delete n[uid]; return n; });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to set base location');
    } finally { setFeSaving(null); }
  };

  const active = useMemo(() => methods.find((m) => m.id === method), [methods, method]);
  const noLocCount = useMemo(() => fes.filter((f) => !f.has_location).length, [fes]);
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
                    <span aria-hidden="true" style={{ display: 'inline-flex', color: sel ? C.red : C.tert, flexShrink: 0 }}>{METHOD_ICON[m.id] ?? null}</span>
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

          {/* FIELD EXECUTIVE LOCATIONS */}
          <div style={{ ...card, marginTop: 16, padding: 0, overflow: 'hidden' }}>
            <button onClick={() => setShowFes((v) => !v)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Field executive locations</span>
              {noLocCount > 0
                ? <span style={{ fontSize: 11, fontWeight: 700, color: C.red, background: 'rgba(224,30,44,.14)', borderRadius: 6, padding: '2px 8px' }}>{noLocCount} without a location</span>
                : fes.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#00A862', background: 'rgba(0,217,126,.14)', borderRadius: 6, padding: '2px 8px' }}>all set</span>}
              <span style={{ marginLeft: 'auto', color: C.tert, fontSize: 13 }}>{showFes ? '▾' : '▸'}</span>
            </button>
            {showFes && (
              <div>
                <div style={{ padding: '0 16px 10px', fontSize: 12, color: C.tert, lineHeight: 1.5 }}>
                  A rep has no coordinates until they first check in. The planner uses their live GPS, else a base you set here, else their last captured fix, else their zone. Reps with <strong style={{ color: C.sec }}>no location</strong> can still be assigned by Cadence / Territory / Recurring methods, but the map-based methods (Nearest, Clusters, Balanced) need a point — set a base or use their last known fix.
                </div>
                {fes.length === 0 && <div style={{ padding: '10px 16px 16px', fontSize: 13, color: C.tert }}>No field executives found.</div>}
                {fes.map((fe) => {
                  const badge = SOURCE_BADGE[fe.start_source] || SOURCE_BADGE.none;
                  const d = feDraft[fe.user_id] || { lat: fe.base?.lat != null ? String(fe.base.lat) : '', lng: fe.base?.lng != null ? String(fe.base.lng) : '' };
                  const editable = !fe.has_live; // live GPS overrides a base anyway
                  return (
                    <div key={fe.user_id} style={{ padding: '11px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 150, flex: 1 }}>
                        <div style={{ fontSize: 14, color: C.text }}>{fe.name}</div>
                        {fe.last_capture && <div style={{ fontSize: 11, color: C.tert }}>last seen {fe.last_capture.lat.toFixed(4)}, {fe.last_capture.lng.toFixed(4)}</div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: badge.fg, background: badge.bg, borderRadius: 6, padding: '2px 8px' }}>{badge.label}</span>
                      {editable && (
                        <>
                          <input value={d.lat} onChange={(e) => setFeDraft((m) => ({ ...m, [fe.user_id]: { ...d, lat: e.target.value } }))} placeholder="lat"
                            style={{ width: 88, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', color: C.text, fontSize: 12.5 }} />
                          <input value={d.lng} onChange={(e) => setFeDraft((m) => ({ ...m, [fe.user_id]: { ...d, lng: e.target.value } }))} placeholder="lng"
                            style={{ width: 88, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', color: C.text, fontSize: 12.5 }} />
                          <button disabled={feSaving === fe.user_id} onClick={() => saveFeBase(fe.user_id, { lat: Number(d.lat), lng: Number(d.lng) })}
                            style={{ ...btn(C.blue, feSaving === fe.user_id), padding: '7px 12px', fontSize: 12.5 }}>
                            {feSaving === fe.user_id ? 'Saving…' : 'Save base'}
                          </button>
                          {fe.last_capture && (
                            <button disabled={feSaving === fe.user_id} onClick={() => saveFeBase(fe.user_id, { use_last_capture: true })}
                              style={{ ...ghostBtn, padding: '7px 12px', fontSize: 12.5 }}>Use last known</button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
