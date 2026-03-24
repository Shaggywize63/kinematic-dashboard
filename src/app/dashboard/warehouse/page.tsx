'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import CitySelect from '@/components/CitySelect';

/* ── colour tokens (Kinematic design system) ── */
const C = {
  bg: '#070D18', s2: '#0E1420', s3: '#131B2A', s4: '#1A2438',
  border: '#1E2D45', borderL: '#253650',
  white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  red: '#E01E2C', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.20)',
  green: '#00D97E', greenD: 'rgba(0,217,126,0.08)',
  blue: '#3E9EFF', blueD: 'rgba(62,158,255,0.10)',
  yellow: '#FFB800', yellowD: 'rgba(255,184,0,0.08)',
  purple: '#9B6EFF', purpleD: 'rgba(155,110,255,0.08)',
  teal: '#00C9B1', tealD: 'rgba(0,201,177,0.08)',
  orange: '#FF7A30', orangeD: 'rgba(255,122,48,0.08)',
};

/* ── types ── */
interface Warehouse {
  id: string; name: string; warehouse_code: string; type: string;
  city: string; address?: string; is_active: boolean;
  manager?: { id: string; name: string } | null;
  stats?: { inbound: number; outbound: number; total_moves: number };
}
interface Movement {
  id: string; movement_type: string; quantity: number;
  from_location?: string; to_location?: string;
  reference_no?: string; notes?: string; moved_at: string;
  sku?: { id: string; sku_code: string; name: string; unit?: string } | null;
  asset?: { id: string; name: string; asset_code: string } | null;
  performer?: { id: string; name: string; employee_id?: string } | null;
}
interface SKU   { id: string; sku_code: string; name: string; unit?: string }
interface Asset { id: string; asset_code: string; name: string }
interface Summary {
  warehouses: Warehouse[];
  total_warehouses: number; active_warehouses: number;
  total_skus: number; total_assets: number; total_movements_30d: number;
}

/* ── movement type config ── */
const MV_TYPES: Record<string, { label: string; color: string; bg: string; sign: string }> = {
  inbound:    { label: 'Inbound',    color: C.green,  bg: C.greenD,  sign: '+' },
  outbound:   { label: 'Outbound',   color: C.red,    bg: C.redD,    sign: '−' },
  transfer:   { label: 'Transfer',   color: C.blue,   bg: C.blueD,   sign: '→' },
  adjustment: { label: 'Adjustment', color: C.yellow, bg: C.yellowD, sign: '±' },
  damage:     { label: 'Damage',     color: C.orange, bg: C.orangeD, sign: '!' },
};

/* ── blank forms ── */
const WH_BLANK = { name: '', warehouse_code: '', type: 'distribution', city: '', address: '', is_active: true };
const MV_BLANK = { movement_type: 'inbound', quantity: '', sku_id: '', asset_id: '', from_location: '', to_location: '', reference_no: '', notes: '', moved_at: '' };

/* ── small helpers ── */
const fmt = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const unwrap = (r: any) => r?.data ?? r;

/* ═══════════════════════════════════════════════════════════
   MODAL SHELL
═══════════════════════════════════════════════════════════ */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 16, padding: '28px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: C.white }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gray, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CONFIRM DIALOG
═══════════════════════════════════════════════════════════ */
function Confirm({ msg, onConfirm, onCancel, danger = true }: { msg: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 14, padding: 28, maxWidth: 400, width: '100%' }}>
        <p style={{ color: C.white, fontSize: 15, marginBottom: 24, lineHeight: 1.6 }}>{msg}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={btnSecStyle}>Cancel</button>
          <button onClick={onConfirm} style={danger ? btnDangerStyle : btnPrimStyle}>Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ── shared button styles ── */
const btnBase: React.CSSProperties = { border: 'none', borderRadius: 10, padding: '10px 20px', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'opacity .15s' };
const btnPrimStyle: React.CSSProperties = { ...btnBase, background: C.blue, color: '#fff' };
const btnSecStyle:  React.CSSProperties = { ...btnBase, background: C.s3, color: C.gray, border: `1px solid ${C.border}` };
const btnDangerStyle: React.CSSProperties = { ...btnBase, background: C.red, color: '#fff' };
const inputStyle: React.CSSProperties = { background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.white, fontFamily: 'DM Sans, sans-serif', fontSize: 14, width: '100%', outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: C.gray, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 };

/* ═══════════════════════════════════════════════════════════
   WAREHOUSE FORM
═══════════════════════════════════════════════════════════ */
function WarehouseForm({ initial, onSave, onClose, saving, err }: { initial: any; onSave: (f: any) => void; onClose: () => void; saving: boolean; err: string }) {
  const [f, setF] = useState(initial);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <>
      {err && <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 8, padding: '10px 14px', color: C.red, fontSize: 13, marginBottom: 16 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Warehouse Name *</label>
          <input style={inputStyle} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Delhi Hub" />
        </div>
        <div>
          <label style={labelStyle}>Warehouse Code *</label>
          <input style={inputStyle} value={f.warehouse_code} onChange={e => set('warehouse_code', e.target.value)} placeholder="e.g. WH-DEL-01" />
        </div>
        <div>
          <label style={labelStyle}>Type</label>
          <select style={inputStyle} value={f.type} onChange={e => set('type', e.target.value)}>
            <option value="distribution">Distribution</option>
            <option value="storage">Storage</option>
            <option value="transit">Transit</option>
            <option value="field">Field Point</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>City</label>
          <CitySelect value={f.city} onChange={(v, c) => set('city', v)} placeholder="e.g. New Delhi" />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Address</label>
          <input style={inputStyle} value={f.address || ''} onChange={e => set('address', e.target.value)} placeholder="Full address" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} id="wh_active" style={{ accentColor: C.green }} />
          <label htmlFor="wh_active" style={{ color: C.white, fontSize: 14, cursor: 'pointer' }}>Active</label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={btnSecStyle} onClick={onClose}>Cancel</button>
        <button style={btnPrimStyle} onClick={() => onSave(f)} disabled={saving || !f.name || !f.warehouse_code}>
          {saving ? 'Saving…' : 'Save Warehouse'}
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   MOVEMENT FORM
═══════════════════════════════════════════════════════════ */
function MovementForm({ initial, skus, assets, onSave, onClose, saving, err }: {
  initial: any; skus: SKU[]; assets: Asset[];
  onSave: (f: any) => void; onClose: () => void; saving: boolean; err: string;
}) {
  const [f, setF] = useState(initial);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const mv = MV_TYPES[f.movement_type] || MV_TYPES.inbound;

  return (
    <>
      {err && <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 8, padding: '10px 14px', color: C.red, fontSize: 13, marginBottom: 16 }}>{err}</div>}

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Movement Type *</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(MV_TYPES).map(([k, v]) => (
            <button key={k} onClick={() => set('movement_type', k)} style={{ ...btnBase, padding: '8px 14px', fontSize: 12, background: f.movement_type === k ? v.color : C.s3, color: f.movement_type === k ? '#fff' : C.gray, border: `1px solid ${f.movement_type === k ? v.color : C.border}` }}>
              {v.sign} {v.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Quantity *</label>
          <input style={inputStyle} type="number" value={f.quantity} onChange={e => set('quantity', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Reference No.</label>
          <input style={inputStyle} value={f.reference_no || ''} onChange={e => set('reference_no', e.target.value)} placeholder="e.g. ORD-001" />
        </div>
        <div>
          <label style={labelStyle}>SKU</label>
          <select style={inputStyle} value={f.sku_id || ''} onChange={e => set('sku_id', e.target.value)}>
            <option value="">— None —</option>
            {skus.map(s => <option key={s.id} value={s.id}>{s.sku_code} — {s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Asset</label>
          <select style={inputStyle} value={f.asset_id || ''} onChange={e => set('asset_id', e.target.value)}>
            <option value="">— None —</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.asset_code} — {a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>From Location</label>
          <input style={inputStyle} value={f.from_location || ''} onChange={e => set('from_location', e.target.value)} placeholder="Zone A / Rack R1" />
        </div>
        <div>
          <label style={labelStyle}>To Location</label>
          <input style={inputStyle} value={f.to_location || ''} onChange={e => set('to_location', e.target.value)} placeholder="Dispatch Bay" />
        </div>
        <div>
          <label style={labelStyle}>Moved At</label>
          <input style={inputStyle} type="datetime-local" value={f.moved_at ? f.moved_at.slice(0, 16) : ''} onChange={e => set('moved_at', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, resize: 'none' }} rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={btnSecStyle} onClick={onClose}>Cancel</button>
        <button style={{ ...btnPrimStyle, background: mv.color }} onClick={() => onSave(f)} disabled={saving || !f.quantity || !f.movement_type}>
          {saving ? 'Saving…' : 'Save Movement'}
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function WarehousePage() {
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [selWh,     setSelWh]     = useState<Warehouse | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [skus,      setSkus]      = useState<SKU[]>([]);
  const [assets,    setAssets]    = useState<Asset[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [mvLoad,    setMvLoad]    = useState(false);
  const [err,       setErr]       = useState('');

  const [mvFilter,  setMvFilter]  = useState('all');

  /* modal state */
  const [showAddWh,   setShowAddWh]   = useState(false);
  const [editWh,      setEditWh]      = useState<Warehouse | null>(null);
  const [deleteWh,    setDeleteWh]    = useState<Warehouse | null>(null);

  const [showAddMv,   setShowAddMv]   = useState(false);
  const [editMv,      setEditMv]      = useState<Movement | null>(null);
  const [deleteMv,    setDeleteMv]    = useState<Movement | null>(null);

  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState('');

  const [whForm, setWhForm] = useState<any>(WH_BLANK);
  const [mvForm, setMvForm] = useState<any>(MV_BLANK);

  /* ── fetch summary ── */
  const loadSummary = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await api.get<any>('/api/v1/warehouses/summary');
      const d: Summary = unwrap(r);
      setSummary(d);
      if (!selWh && d.warehouses?.length) setSelWh(d.warehouses[0]);
    } catch (e: any) {
      setErr(e.message || 'Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  }, [selWh]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  /* ── fetch movements when warehouse selected ── */
  const loadMovements = useCallback(async (wh: Warehouse, filter = 'all') => {
    setMvLoad(true);
    try {
      const q = filter !== 'all' ? `?type=${filter}` : '';
      const r = await api.get<any>(`/api/v1/warehouses/${wh.id}/movements${q}`);
      const d = unwrap(r);
      setMovements(Array.isArray(d) ? d : []);
    } catch { setMovements([]); }
    finally { setMvLoad(false); }
  }, []);

  useEffect(() => {
    if (selWh) loadMovements(selWh, mvFilter);
  }, [selWh, mvFilter, loadMovements]);

  /* ── load skus & assets for movement form ── */
  const loadRefs = useCallback(async () => {
    try {
      const [sR, aR] = await Promise.all([api.get<any>('/api/v1/skus'), api.get<any>('/api/v1/assets')]);
      setSkus(Array.isArray(unwrap(sR)) ? unwrap(sR) : []);
      setAssets(Array.isArray(unwrap(aR)) ? unwrap(aR) : []);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { loadRefs(); }, [loadRefs]);

  /* ════════════ WAREHOUSE CRUD ════════════ */

  const openAddWh = () => { setWhForm({ ...WH_BLANK }); setFormErr(''); setShowAddWh(true); };
  const openEditWh = (wh: Warehouse) => {
    setWhForm({ name: wh.name, warehouse_code: wh.warehouse_code, type: wh.type, city: wh.city || '', address: wh.address || '', is_active: wh.is_active });
    setFormErr(''); setEditWh(wh);
  };

  const saveWarehouse = async (f: any) => {
    setSaving(true); setFormErr('');
    try {
      const payload = { ...f, is_active: !!f.is_active };
      if (editWh) {
        await api.patch(`/api/v1/warehouses/${editWh.id}`, payload);
        setEditWh(null);
      } else {
        await api.post('/api/v1/warehouses', payload);
        setShowAddWh(false);
      }
      await loadSummary();
    } catch (e: any) {
      setFormErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteWh = async () => {
    if (!deleteWh) return;
    setSaving(true);
    try {
      await api.delete(`/api/v1/warehouses/${deleteWh.id}`);
      if (selWh?.id === deleteWh.id) setSelWh(null);
      setDeleteWh(null);
      await loadSummary();
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    } finally { setSaving(false); }
  };

  /* ════════════ MOVEMENT CRUD ════════════ */

  const openAddMv = () => { setMvForm({ ...MV_BLANK }); setFormErr(''); setShowAddMv(true); };

  const openEditMv = (mv: Movement) => {
    setMvForm({
      movement_type: mv.movement_type,
      quantity: Math.abs(mv.quantity),
      sku_id:   mv.sku?.id    || '',
      asset_id: mv.asset?.id  || '',
      from_location: mv.from_location || '',
      to_location:   mv.to_location   || '',
      reference_no:  mv.reference_no  || '',
      notes:         mv.notes         || '',
      moved_at:      mv.moved_at      || '',
    });
    setFormErr(''); setEditMv(mv);
  };

  const saveMovement = async (f: any) => {
    if (!selWh) return;
    setSaving(true); setFormErr('');
    try {
      const payload: any = {
        movement_type: f.movement_type,
        quantity:      Number(f.quantity),
        from_location: f.from_location || null,
        to_location:   f.to_location   || null,
        reference_no:  f.reference_no  || null,
        notes:         f.notes         || null,
        moved_at:      f.moved_at      || null,
      };
      if (f.sku_id)   payload.sku_id   = f.sku_id;
      if (f.asset_id) payload.asset_id = f.asset_id;

      if (editMv) {
        await api.patch(`/api/v1/warehouses/${selWh.id}/movements/${editMv.id}`, payload);
        setEditMv(null);
      } else {
        await api.post(`/api/v1/warehouses/${selWh.id}/movements`, payload);
        setShowAddMv(false);
      }
      await loadMovements(selWh, mvFilter);
    } catch (e: any) {
      setFormErr(e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const confirmDeleteMv = async () => {
    if (!deleteMv || !selWh) return;
    setSaving(true);
    try {
      await api.delete(`/api/v1/warehouses/${selWh.id}/movements/${deleteMv.id}`);
      setDeleteMv(null);
      await loadMovements(selWh, mvFilter);
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    } finally { setSaving(false); }
  };

  /* ════════════ RENDER ════════════ */

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: C.gray, fontFamily: 'DM Sans, sans-serif' }}>
      Loading warehouses…
    </div>
  );

  if (err) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 14, color: C.red, fontFamily: 'DM Sans, sans-serif' }}>
      <span>{err}</span>
      <button style={btnPrimStyle} onClick={loadSummary}>Retry</button>
    </div>
  );

  const warehouses = summary?.warehouses || [];

  return (
    <div style={{ padding: '28px 32px', fontFamily: 'DM Sans, sans-serif', color: C.white, background: C.bg, minHeight: '100vh' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: C.white, margin: 0 }}>Warehouse Management</h1>
          <p style={{ color: C.gray, fontSize: 13, marginTop: 4 }}>Stock movements, inventory tracking & warehouse control</p>
        </div>
        <button style={btnPrimStyle} onClick={openAddWh}>+ Add Warehouse</button>
      </div>

      {/* ── KPI bar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Warehouses',    val: summary?.total_warehouses    ?? 0, color: C.blue   },
          { label: 'Active',              val: summary?.active_warehouses   ?? 0, color: C.green  },
          { label: 'SKUs Tracked',        val: summary?.total_skus          ?? 0, color: C.purple },
          { label: 'Active Assets',       val: summary?.total_assets        ?? 0, color: C.teal   },
          { label: 'Movements (30d)',      val: summary?.total_movements_30d ?? 0, color: C.yellow },
        ].map((k, i) => (
          <div key={i} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, color: k.color }}>{k.val}</div>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>

        {/* ── Warehouse list ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Warehouses ({warehouses.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {warehouses.map(wh => (
              <div key={wh.id} onClick={() => setSelWh(wh)} style={{ background: selWh?.id === wh.id ? C.s3 : C.s2, border: `1px solid ${selWh?.id === wh.id ? C.blue : C.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: selWh?.id === wh.id ? C.blue : C.white, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wh.name}</div>
                    <div style={{ fontSize: 11, color: C.gray }}>{wh.warehouse_code} · {wh.city || '—'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: wh.is_active ? C.greenD : C.redD, color: wh.is_active ? C.green : C.red, marginLeft: 8, flexShrink: 0 }}>
                    {wh.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {wh.stats && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    {[
                      { l: 'In', v: wh.stats.inbound,     c: C.green  },
                      { l: 'Out', v: wh.stats.outbound,   c: C.red    },
                      { l: 'Moves', v: wh.stats.total_moves, c: C.blue },
                    ].map((s, i) => (
                      <div key={i} style={{ flex: 1, background: C.s4, borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, color: s.c }}>{s.v}</div>
                        <div style={{ fontSize: 10, color: C.gray }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* row actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                  <button style={{ ...btnSecStyle, flex: 1, padding: '6px 10px', fontSize: 11 }} onClick={() => openEditWh(wh)}>✎ Edit</button>
                  <button style={{ ...btnBase, flex: 1, padding: '6px 10px', fontSize: 11, background: C.redD, color: C.red, border: `1px solid ${C.redB}` }} onClick={() => setDeleteWh(wh)}>✕ Delete</button>
                </div>
              </div>
            ))}
            {warehouses.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: C.gray, fontSize: 13 }}>
                No warehouses yet.<br />
                <button style={{ ...btnPrimStyle, marginTop: 12, fontSize: 12 }} onClick={openAddWh}>+ Add first warehouse</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Movements panel ── */}
        <div>
          {selWh ? (
            <>
              {/* header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 700, color: C.white }}>{selWh.name}</div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{selWh.warehouse_code} · {selWh.type} · {selWh.city}</div>
                </div>
                <button style={btnPrimStyle} onClick={openAddMv}>+ Log Movement</button>
              </div>

              {/* filter tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {['all', ...Object.keys(MV_TYPES)].map(t => {
                  const mv = MV_TYPES[t];
                  const active = mvFilter === t;
                  return (
                    <button key={t} onClick={() => setMvFilter(t)} style={{ ...btnBase, padding: '6px 14px', fontSize: 12, background: active ? (mv?.color || C.blue) : C.s2, color: active ? '#fff' : C.gray, border: `1px solid ${active ? (mv?.color || C.blue) : C.border}` }}>
                      {mv ? mv.label : 'All'}
                    </button>
                  );
                })}
              </div>

              {/* movements table */}
              {mvLoad ? (
                <div style={{ textAlign: 'center', padding: '40px', color: C.gray, fontSize: 13 }}>Loading movements…</div>
              ) : movements.length === 0 ? (
                <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px', textAlign: 'center', color: C.gray, fontSize: 13 }}>
                  No movements found.
                  <button style={{ ...btnPrimStyle, marginTop: 14, fontSize: 12 }} onClick={openAddMv}>+ Log first movement</button>
                </div>
              ) : (
                <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  {/* table head */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 60px 140px 120px 1fr 110px', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.gray, letterSpacing: '0.7px', textTransform: 'uppercase' }}>
                    <span>Type</span>
                    <span>Qty</span>
                    <span>SKU / Asset</span>
                    <span>Reference</span>
                    <span>Date</span>
                    <span style={{ textAlign: 'right' }}>Actions</span>
                  </div>

                  {movements.map((mv, i) => {
                    const cfg = MV_TYPES[mv.movement_type] || MV_TYPES.inbound;
                    return (
                      <div key={mv.id} style={{ display: 'grid', gridTemplateColumns: '120px 60px 140px 120px 1fr 110px', padding: '13px 16px', borderBottom: i < movements.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', transition: 'background .12s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.s3)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                        {/* type badge */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, width: 'fit-content' }}>
                          {cfg.sign} {cfg.label}
                        </span>

                        {/* quantity */}
                        <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, color: cfg.color }}>{Math.abs(mv.quantity)}</span>

                        {/* sku / asset */}
                        <span style={{ fontSize: 12, color: C.gray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {mv.sku?.name || mv.asset?.name || <span style={{ color: C.grayd }}>—</span>}
                        </span>

                        {/* reference */}
                        <span style={{ fontSize: 12, color: C.gray }}>{mv.reference_no || <span style={{ color: C.grayd }}>—</span>}</span>

                        {/* date + performer */}
                        <div>
                          <div style={{ fontSize: 12, color: C.white }}>{fmt(mv.moved_at)}</div>
                          {mv.performer && <div style={{ fontSize: 11, color: C.gray, marginTop: 1 }}>by {mv.performer.name}</div>}
                          {(mv.from_location || mv.to_location) && (
                            <div style={{ fontSize: 10, color: C.grayd, marginTop: 2 }}>
                              {mv.from_location}{mv.from_location && mv.to_location ? ' → ' : ''}{mv.to_location}
                            </div>
                          )}
                          {mv.notes && <div style={{ fontSize: 10, color: C.grayd, marginTop: 2, fontStyle: 'italic' }}>{mv.notes}</div>}
                        </div>

                        {/* actions */}
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEditMv(mv)} title="Edit movement"
                            style={{ background: C.blueD, border: `1px solid ${C.blue}33`, borderRadius: 7, padding: '5px 10px', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            ✎ Edit
                          </button>
                          <button onClick={() => setDeleteMv(mv)} title="Delete movement"
                            style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 7, padding: '5px 10px', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '60px 32px', textAlign: 'center', color: C.gray, fontSize: 14 }}>
              Select a warehouse to view movements
            </div>
          )}
        </div>
      </div>

      {/* ════ MODALS ════ */}

      {/* Add warehouse */}
      {showAddWh && (
        <Modal title="Add Warehouse" onClose={() => setShowAddWh(false)}>
          <WarehouseForm initial={whForm} onSave={saveWarehouse} onClose={() => setShowAddWh(false)} saving={saving} err={formErr} />
        </Modal>
      )}

      {/* Edit warehouse */}
      {editWh && (
        <Modal title={`Edit — ${editWh.name}`} onClose={() => setEditWh(null)}>
          <WarehouseForm initial={whForm} onSave={saveWarehouse} onClose={() => setEditWh(null)} saving={saving} err={formErr} />
        </Modal>
      )}

      {/* Delete warehouse confirm */}
      {deleteWh && (
        <Confirm
          msg={`Delete "${deleteWh.name}"? All movement logs for this warehouse will also be deleted. This cannot be undone.`}
          onConfirm={confirmDeleteWh}
          onCancel={() => setDeleteWh(null)}
        />
      )}

      {/* Add movement */}
      {showAddMv && (
        <Modal title={`Log Movement — ${selWh?.name}`} onClose={() => setShowAddMv(false)}>
          <MovementForm initial={mvForm} skus={skus} assets={assets} onSave={saveMovement} onClose={() => setShowAddMv(false)} saving={saving} err={formErr} />
        </Modal>
      )}

      {/* Edit movement */}
      {editMv && (
        <Modal title="Edit Movement" onClose={() => setEditMv(null)}>
          <MovementForm initial={mvForm} skus={skus} assets={assets} onSave={saveMovement} onClose={() => setEditMv(null)} saving={saving} err={formErr} />
        </Modal>
      )}

      {/* Delete movement confirm */}
      {deleteMv && (
        <Confirm
          msg={`Delete this ${deleteMv.movement_type} movement of ${Math.abs(deleteMv.quantity)} units${deleteMv.reference_no ? ` (${deleteMv.reference_no})` : ''}? This cannot be undone.`}
          onConfirm={confirmDeleteMv}
          onCancel={() => setDeleteMv(null)}
        />
      )}
    </div>
  );
}
