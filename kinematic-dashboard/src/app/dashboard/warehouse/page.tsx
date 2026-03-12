'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

/* ─── colour palette ─── */
const C = {
  bg:'#070D18', s2:'#0E1420', s3:'#131B2A', s4:'#1A2438',
  border:'#1E2D45', borderL:'#253650',
  white:'#E8EDF8', gray:'#7A8BA0', grayd:'#2E445E', graydd:'#1A2738',
  red:'#E01E2C', redD:'rgba(224,30,44,0.08)', redB:'rgba(224,30,44,0.2)',
  green:'#00D97E', greenD:'rgba(0,217,126,0.08)',
  blue:'#3E9EFF', blueD:'rgba(62,158,255,0.10)',
  yellow:'#FFB800', yellowD:'rgba(255,184,0,0.08)',
  purple:'#9B6EFF', purpleD:'rgba(155,110,255,0.08)',
  teal:'#00C9B1', tealD:'rgba(0,201,177,0.08)',
  orange:'#FF7A30', orangeD:'rgba(255,122,48,0.08)',
};

/* ─── types ─── */
interface Warehouse {
  id: string; warehouse_code: string; name: string;
  type: string; address?: string; city?: string; state?: string;
  latitude?: number; longitude?: number; is_active: boolean;
  created_at: string;
  manager?: { id: string; name: string } | null;
  stats?: { inbound: number; outbound: number; total_moves: number };
}
interface SKU   { id: string; sku_code: string; name: string; unit?: string; }
interface Asset { id: string; asset_code: string; name: string; }
interface Movement {
  id: string; movement_type: string; quantity: number;
  from_location?: string; to_location?: string; reference_no?: string;
  notes?: string; moved_at: string;
  sku?: { id: string; sku_code: string; name: string; unit?: string } | null;
  performer?: { id: string; name: string; employee_id?: string } | null;
  asset?: { id: string; name: string; asset_code?: string } | null;
}
interface Summary {
  warehouses: Warehouse[]; total_warehouses: number; active_warehouses: number;
  total_skus: number; total_assets: number; total_movements_30d: number;
}

const WH_TYPES: Record<string, { label: string; color: string }> = {
  distribution_center: { label: 'Distribution Center', color: C.blue   },
  fulfillment_center:  { label: 'Fulfillment Center',  color: C.purple },
  dark_warehouse:      { label: 'Dark Warehouse',      color: C.gray   },
  retail_storage:      { label: 'Retail Storage',      color: C.teal   },
};

const MV_TYPES: Record<string, { label: string; color: string; sign: string }> = {
  inbound:    { label: 'Inbound',    color: C.green,  sign: '+' },
  outbound:   { label: 'Outbound',   color: C.red,    sign: '−' },
  transfer:   { label: 'Transfer',   color: C.blue,   sign: '↔' },
  adjustment: { label: 'Adjustment', color: C.yellow, sign: '±' },
  damage:     { label: 'Damage',     color: C.orange, sign: '✕' },
};

/* ─── helpers ─── */
const Spinner = () => (
  <div style={{ width:15, height:15, border:'2.5px solid rgba(255,255,255,0.18)',
    borderTopColor:'#fff', borderRadius:'50%', animation:'kspin .65s linear infinite', flexShrink:0 }}/>
);
const Label = ({ text, req }: { text:string; req?:boolean }) => (
  <div style={{ fontSize:11, fontWeight:700, color:C.gray, letterSpacing:'0.7px',
    textTransform:'uppercase' as const, marginBottom:7 }}>
    {text}{req && <span style={{ color:C.red }}> *</span>}
  </div>
);
const baseInp: React.CSSProperties = {
  width:'100%', background:C.s3, border:`1.5px solid ${C.border}`, color:C.white,
  borderRadius:11, padding:'10px 13px', fontSize:13, outline:'none',
  fontFamily:"'DM Sans',sans-serif", transition:'border-color .15s',
};
const Overlay = ({ onClose, children }: { onClose:()=>void; children:React.ReactNode }) => (
  <div onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}
    style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:500,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
      backdropFilter:'blur(6px)' }}>
    {children}
  </div>
);
const MovBadge = ({ type }: { type: string }) => {
  const mt = MV_TYPES[type] || { label: type, color: C.gray, sign: '?' };
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20,
      background:`${mt.color}18`, color:mt.color }}>
      {mt.sign} {mt.label}
    </span>
  );
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

/* ═══════════════════════════════════════════════════════════ */
export default function WarehousePage() {

  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [selWh,    setSelWh]    = useState<Warehouse | null>(null);
  const [movements,setMovements]= useState<Movement[]>([]);
  const [skus,     setSkus]     = useState<SKU[]>([]);
  const [assets,   setAssets]   = useState<Asset[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [mvLoad,   setMvLoad]   = useState(false);
  const [err,      setErr]      = useState('');
  const [mvFilter, setMvFilter] = useState<string>('all');

  /* modals */
  const [showAddWh,  setShowAddWh]  = useState(false);
  const [editWh,     setEditWh]     = useState<Warehouse | null>(null);
  const [showAddMv,  setShowAddMv]  = useState(false);
  const [deleteWh,   setDeleteWh]   = useState<Warehouse | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [formErr,    setFormErr]    = useState('');

  /* warehouse form */
  const WH_BLANK = { warehouse_code:'', name:'', type:'distribution_center',
    address:'', city:'', state:'', latitude:'', longitude:'', is_active: true };
  const [whForm, setWhForm] = useState<any>(WH_BLANK);
  const setWF = (k: string, v: any) => setWhForm((p: any) => ({ ...p, [k]: v }));

  /* movement form */
  const MV_BLANK = { movement_type:'inbound', sku_id:'', asset_id:'',
    quantity:'', from_location:'', to_location:'', reference_no:'', notes:'', moved_at:'' };
  const [mvForm, setMvForm] = useState<any>(MV_BLANK);
  const setMF = (k: string, v: any) => setMvForm((p: any) => ({ ...p, [k]: v }));

  /* ── fetch summary ── */
  const loadSummary = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await api.get<any>('/api/v1/warehouses/summary');
      const d: Summary = res?.data ?? res;
      setSummary(d);
      // auto-select first warehouse
      if (!selWh && d.warehouses?.length > 0) setSelWh(d.warehouses[0]);
    } catch (e: any) { setErr(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  /* ── fetch movements for selected warehouse ── */
  const loadMovements = useCallback(async (wh: Warehouse, type?: string) => {
    setMvLoad(true);
    try {
      const q = type && type !== 'all' ? `?type=${type}` : '';
      const res = await api.get<any>(`/api/v1/warehouses/${wh.id}/movements${q}`);
      setMovements(res?.data ?? res ?? []);
    } catch { setMovements([]); }
    finally { setMvLoad(false); }
  }, []);

  /* ── fetch skus & assets for movement form ── */
  const loadFormDeps = useCallback(async () => {
    try {
      const [sRes, aRes] = await Promise.all([
        api.get<any>('/api/v1/skus'),
        api.get<any>('/api/v1/assets'),
      ]);
      setSkus(sRes?.data ?? sRes ?? []);
      setAssets(aRes?.data ?? aRes ?? []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadSummary(); loadFormDeps(); }, [loadSummary, loadFormDeps]);

  useEffect(() => {
    if (selWh) loadMovements(selWh, mvFilter === 'all' ? undefined : mvFilter);
  }, [selWh, mvFilter, loadMovements]);

  /* ── select warehouse ── */
  const selectWh = (wh: Warehouse) => {
    setSelWh(wh); setMvFilter('all');
  };

  /* ── CREATE warehouse ── */
  const handleCreateWh = async () => {
    if (!whForm.warehouse_code) { setFormErr('Warehouse code is required'); return; }
    if (!whForm.name)           { setFormErr('Name is required'); return; }
    setSaving(true); setFormErr('');
    try {
      const payload = { ...whForm,
        latitude:  whForm.latitude  ? Number(whForm.latitude)  : null,
        longitude: whForm.longitude ? Number(whForm.longitude) : null,
      };
      await api.post('/api/v1/warehouses', payload);
      setShowAddWh(false); setWhForm(WH_BLANK); loadSummary();
    } catch (e: any) { setFormErr(e?.message || 'Failed to create warehouse'); }
    finally { setSaving(false); }
  };

  /* ── UPDATE warehouse ── */
  const handleUpdateWh = async () => {
    if (!editWh) return;
    setSaving(true); setFormErr('');
    try {
      const payload = { ...whForm,
        latitude:  whForm.latitude  ? Number(whForm.latitude)  : null,
        longitude: whForm.longitude ? Number(whForm.longitude) : null,
      };
      const res = await api.patch<any>(`/api/v1/warehouses/${editWh.id}`, payload);
      const updated: Warehouse = res?.data ?? res;
      setEditWh(null);
      // update summary list and selWh if same
      setSummary(prev => {
        if (!prev) return prev;
        return { ...prev, warehouses: prev.warehouses.map(w => w.id === updated.id ? { ...w, ...updated } : w) };
      });
      if (selWh?.id === updated.id) setSelWh(prev => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) { setFormErr(e?.message || 'Failed to update'); }
    finally { setSaving(false); }
  };

  const openEdit = (wh: Warehouse) => {
    setEditWh(wh);
    setWhForm({ warehouse_code: wh.warehouse_code, name: wh.name, type: wh.type,
      address: wh.address || '', city: wh.city || '', state: wh.state || '',
      latitude: wh.latitude || '', longitude: wh.longitude || '',
      is_active: wh.is_active });
    setFormErr('');
  };

  /* ── DELETE warehouse ── */
  const handleDeleteWh = async () => {
    if (!deleteWh) return;
    setSaving(true);
    try {
      await api.delete(`/api/v1/warehouses/${deleteWh.id}`);
      setDeleteWh(null);
      if (selWh?.id === deleteWh.id) setSelWh(null);
      loadSummary();
    } catch (e: any) { setErr(e?.message || 'Failed to delete'); }
    finally { setSaving(false); }
  };

  /* ── LOG movement ── */
  const handleCreateMv = async () => {
    if (!selWh) return;
    if (!mvForm.movement_type) { setFormErr('Movement type is required'); return; }
    if (!mvForm.quantity)      { setFormErr('Quantity is required'); return; }
    setSaving(true); setFormErr('');
    try {
      const payload = { ...mvForm,
        quantity: Number(mvForm.quantity),
        sku_id:   mvForm.sku_id   || null,
        asset_id: mvForm.asset_id || null,
        moved_at: mvForm.moved_at || new Date().toISOString(),
      };
      await api.post(`/api/v1/warehouses/${selWh.id}/movements`, payload);
      setShowAddMv(false); setMvForm(MV_BLANK);
      loadMovements(selWh, mvFilter === 'all' ? undefined : mvFilter);
    } catch (e: any) { setFormErr(e?.message || 'Failed to log movement'); }
    finally { setSaving(false); }
  };

  const warehouses = summary?.warehouses ?? [];

  /* ─── RENDER ─────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes kspin  { to { transform:rotate(360deg); } }
        @keyframes kfade  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .kcard { transition:background .14s, border-color .14s; }
        .kcard:hover { background:${C.s3} !important; border-color:${C.borderL} !important; }
        .kcard.active { background:${C.s3} !important; border-color:${C.blue}60 !important; }
        .kinp:focus { border-color:${C.blue} !important; }
        .kbtn { transition:opacity .13s, transform .13s; cursor:pointer; }
        .kbtn:hover { opacity:.82; }
        .kbtn:active { transform:scale(.96); }
        .mvrow { transition:background .12s; }
        .mvrow:hover { background:${C.s3} !important; }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'kfade .3s ease' }}>

        {/* ── error banner ── */}
        {err && (
          <div style={{ background:C.redD, border:`1px solid ${C.redB}`, borderRadius:12,
            padding:'11px 16px', fontSize:13, color:C.red, display:'flex', gap:9, alignItems:'center' }}>
            ⚠ {err}
            <button onClick={()=>setErr('')} style={{ marginLeft:'auto', background:'none', border:'none', color:C.red, cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        )}

        {/* ── page header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:C.white }}>
              Warehouse Management
            </div>
            <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>
              Inventory movements · stock visibility · asset tracking
            </div>
          </div>
          <button className="kbtn" onClick={()=>{ setWhForm(WH_BLANK); setFormErr(''); setShowAddWh(true); }}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px',
              background:C.red, border:'none', borderRadius:10, color:'#fff',
              fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
              boxShadow:'0 4px 18px rgba(224,30,44,0.28)' }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Warehouse
          </button>
        </div>

        {/* ── summary stat cards ── */}
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:C.grayd, fontSize:14 }}>Loading…</div>
        ) : (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
              {[
                { l:'Warehouses',    v: summary?.total_warehouses   ?? 0, c:C.blue   },
                { l:'Active',        v: summary?.active_warehouses  ?? 0, c:C.green  },
                { l:'SKUs',          v: summary?.total_skus         ?? 0, c:C.purple },
                { l:'Active Assets', v: summary?.total_assets       ?? 0, c:C.teal   },
                { l:'Moves (30d)',   v: summary?.total_movements_30d ?? 0, c:C.yellow },
              ].map(s => (
                <div key={s.l} style={{ background:C.s2, border:`1px solid ${C.border}`,
                  borderRadius:14, padding:'16px 18px', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, left:0, bottom:0, width:3,
                    borderRadius:'3px 0 0 3px', background:s.c, opacity:.5 }}/>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, color:s.c, lineHeight:1 }}>{s.v}</div>
                  <div style={{ fontSize:11, color:C.gray, marginTop:5 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* ── main layout: warehouse list + detail panel ── */}
            <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:16, alignItems:'start' }}>

              {/* ── Warehouse List ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.grayd, letterSpacing:'0.7px',
                  textTransform:'uppercase', marginBottom:2 }}>
                  Warehouses ({warehouses.length})
                </div>
                {warehouses.length === 0 ? (
                  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:14,
                    padding:'28px 16px', textAlign:'center', color:C.grayd, fontSize:13 }}>
                    No warehouses yet.<br/>Add your first one.
                  </div>
                ) : warehouses.map(wh => {
                  const wt = WH_TYPES[wh.type] || { label: wh.type, color: C.gray };
                  const isActive = selWh?.id === wh.id;
                  return (
                    <div key={wh.id}
                      className={`kcard${isActive ? ' active' : ''}`}
                      onClick={() => selectWh(wh)}
                      style={{ background: isActive ? C.s3 : C.s2,
                        border: `1px solid ${isActive ? C.blue+'60' : C.border}`,
                        borderRadius:14, padding:14, cursor:'pointer' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:C.white }}>{wh.name}</div>
                          <div style={{ fontSize:11, color:C.grayd, marginTop:2 }}>{wh.warehouse_code}</div>
                        </div>
                        <span style={{ fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:20, flexShrink:0,
                          background: wh.is_active ? C.greenD : C.redD,
                          color: wh.is_active ? C.green : C.red }}>
                          {wh.is_active ? '● Active' : 'Inactive'}
                        </span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20,
                          background:`${wt.color}18`, color:wt.color }}>
                          {wt.label}
                        </span>
                        {wh.city && (
                          <span style={{ fontSize:10, color:C.grayd }}>📍 {wh.city}</span>
                        )}
                      </div>
                      {wh.stats && wh.stats.total_moves > 0 && (
                        <div style={{ display:'flex', gap:10, marginTop:9 }}>
                          <div style={{ flex:1, background:C.s4, borderRadius:8, padding:'6px 8px', textAlign:'center' }}>
                            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:C.green }}>{wh.stats.inbound}</div>
                            <div style={{ fontSize:9, color:C.grayd }}>In (30d)</div>
                          </div>
                          <div style={{ flex:1, background:C.s4, borderRadius:8, padding:'6px 8px', textAlign:'center' }}>
                            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:C.red }}>{wh.stats.outbound}</div>
                            <div style={{ fontSize:9, color:C.grayd }}>Out (30d)</div>
                          </div>
                          <div style={{ flex:1, background:C.s4, borderRadius:8, padding:'6px 8px', textAlign:'center' }}>
                            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:C.blue }}>{wh.stats.total_moves}</div>
                            <div style={{ fontSize:9, color:C.grayd }}>Moves</div>
                          </div>
                        </div>
                      )}
                      {/* mini action row */}
                      <div style={{ display:'flex', gap:6, marginTop:9 }}
                        onClick={e => e.stopPropagation()}>
                        <button className="kbtn" onClick={() => openEdit(wh)}
                          style={{ flex:1, padding:'6px 0', background:C.blueD,
                            border:'1px solid rgba(62,158,255,0.15)', borderRadius:8,
                            fontSize:11, fontWeight:600, color:C.blue,
                            fontFamily:"'DM Sans',sans-serif" }}>
                          Edit
                        </button>
                        <button className="kbtn" onClick={() => setDeleteWh(wh)}
                          style={{ padding:'6px 10px', background:C.redD,
                            border:'1px solid rgba(224,30,44,0.15)', borderRadius:8,
                            fontSize:11, color:C.red, fontFamily:"'DM Sans',sans-serif" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Warehouse Detail Panel ── */}
              {selWh ? (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                  {/* detail header */}
                  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                      <div>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:C.white }}>
                          {selWh.name}
                        </div>
                        <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>
                          {selWh.warehouse_code}
                          {selWh.address && ` · ${selWh.address}`}
                          {selWh.city && `, ${selWh.city}`}
                          {selWh.state && `, ${selWh.state}`}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        {(() => { const wt = WH_TYPES[selWh.type] || { label:selWh.type, color:C.gray };
                          return <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20,
                            background:`${wt.color}18`, color:wt.color }}>{wt.label}</span>; })()}
                        <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20,
                          background:selWh.is_active ? C.greenD : C.redD,
                          color:selWh.is_active ? C.green : C.red }}>
                          {selWh.is_active ? '● Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    {selWh.manager && (
                      <div style={{ fontSize:12, color:C.gray }}>
                        Manager: <span style={{ color:C.white, fontWeight:600 }}>{selWh.manager.name}</span>
                      </div>
                    )}
                  </div>

                  {/* movements panel */}
                  <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>
                    {/* panel header */}
                    <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`,
                      display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:C.white }}>
                        Inventory Movements
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        {/* filter pills */}
                        <div style={{ display:'flex', gap:5 }}>
                          {['all', ...Object.keys(MV_TYPES)].map(t => (
                            <button key={t} className="kbtn" onClick={() => setMvFilter(t)}
                              style={{ padding:'5px 10px', borderRadius:8,
                                border:`1px solid ${mvFilter===t ? (MV_TYPES[t]?.color || C.blue) : C.border}`,
                                background:mvFilter===t ? `${(MV_TYPES[t]?.color || C.blue)}18` : 'transparent',
                                color:mvFilter===t ? (MV_TYPES[t]?.color || C.blue) : C.gray,
                                fontSize:11, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
                              {t === 'all' ? 'All' : MV_TYPES[t].label}
                            </button>
                          ))}
                        </div>
                        <button className="kbtn" onClick={() => { setMvForm(MV_BLANK); setFormErr(''); setShowAddMv(true); }}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
                            background:C.red, border:'none', borderRadius:9, color:'#fff',
                            fontSize:12, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                            boxShadow:'0 3px 12px rgba(224,30,44,0.25)' }}>
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          Log Movement
                        </button>
                      </div>
                    </div>

                    {/* movements table */}
                    {mvLoad ? (
                      <div style={{ padding:'40px 0', textAlign:'center', color:C.grayd, fontSize:13 }}>
                        Loading movements…
                      </div>
                    ) : movements.length === 0 ? (
                      <div style={{ padding:'48px 0', textAlign:'center', color:C.grayd, fontSize:13 }}>
                        No movements logged{mvFilter !== 'all' ? ` of type "${MV_TYPES[mvFilter]?.label}"` : ''}.
                        <br/>
                        <span style={{ fontSize:12, color:C.graydd }}>Use "Log Movement" to record your first entry.</span>
                      </div>
                    ) : (
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                              {['Type','SKU','Qty','From','To','Ref No.','Performed By','When'].map(h => (
                                <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:10,
                                  fontWeight:700, color:C.grayd, letterSpacing:'0.6px', textTransform:'uppercase',
                                  whiteSpace:'nowrap' }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {movements.map((mv, i) => {
                              const mt = MV_TYPES[mv.movement_type] || { color:C.gray, sign:'?', label:mv.movement_type };
                              return (
                                <tr key={mv.id} className="mvrow"
                                  style={{ borderBottom: i < movements.length-1 ? `1px solid ${C.border}` : 'none',
                                    background:'transparent' }}>
                                  <td style={{ padding:'11px 16px', whiteSpace:'nowrap' }}>
                                    <MovBadge type={mv.movement_type}/>
                                  </td>
                                  <td style={{ padding:'11px 16px', fontSize:12 }}>
                                    {mv.sku
                                      ? <span style={{ color:C.white, fontWeight:600 }}>{mv.sku.name}</span>
                                      : <span style={{ color:C.grayd }}>—</span>}
                                    {mv.sku?.sku_code && <div style={{ fontSize:10, color:C.grayd }}>{mv.sku.sku_code}</div>}
                                  </td>
                                  <td style={{ padding:'11px 16px' }}>
                                    <span style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:mt.color }}>
                                      {mt.sign}{Math.abs(mv.quantity)}
                                    </span>
                                    {mv.sku?.unit && <span style={{ fontSize:10, color:C.grayd, marginLeft:3 }}>{mv.sku.unit}</span>}
                                  </td>
                                  <td style={{ padding:'11px 16px', fontSize:12, color:C.gray, maxWidth:140, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                    {mv.from_location || '—'}
                                  </td>
                                  <td style={{ padding:'11px 16px', fontSize:12, color:C.gray, maxWidth:140, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                    {mv.to_location || '—'}
                                  </td>
                                  <td style={{ padding:'11px 16px', fontSize:11, color:C.grayd, whiteSpace:'nowrap' }}>
                                    {mv.reference_no || '—'}
                                  </td>
                                  <td style={{ padding:'11px 16px', fontSize:12 }}>
                                    {mv.performer
                                      ? <span style={{ color:C.white }}>{mv.performer.name}</span>
                                      : <span style={{ color:C.grayd }}>—</span>}
                                    {mv.performer?.employee_id && <div style={{ fontSize:10, color:C.grayd }}>{mv.performer.employee_id}</div>}
                                  </td>
                                  <td style={{ padding:'11px 16px', fontSize:11, color:C.grayd, whiteSpace:'nowrap' }}>
                                    {fmtDate(mv.moved_at)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:16,
                  padding:'80px 0', textAlign:'center', color:C.grayd, fontSize:14 }}>
                  Select a warehouse to view movements
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ ADD WAREHOUSE MODAL ═══ */}
      {(showAddWh || editWh) && (
        <Overlay onClose={() => { setShowAddWh(false); setEditWh(null); }}>
          <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:22,
            width:'100%', maxWidth:540, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800 }}>
                  {editWh ? 'Edit Warehouse' : 'Add Warehouse'}
                </div>
                <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>
                  {editWh ? editWh.name : 'Create a new warehouse location'}
                </div>
              </div>
              <button onClick={() => { setShowAddWh(false); setEditWh(null); }}
                style={{ background:C.s3, border:`1px solid ${C.border}`, borderRadius:9, width:32, height:32,
                  display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:15 }}>✕</button>
            </div>

            {formErr && (
              <div style={{ background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10,
                padding:'10px 14px', fontSize:13, color:C.red, marginBottom:16 }}>
                {formErr}
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <div>
                <Label text="Warehouse Code" req/>
                <input className="kinp" style={baseInp} placeholder="WH-DEL-01"
                  value={whForm.warehouse_code} onChange={e=>setWF('warehouse_code',e.target.value)}/>
              </div>
              <div>
                <Label text="Warehouse Name" req/>
                <input className="kinp" style={baseInp} placeholder="Delhi DC"
                  value={whForm.name} onChange={e=>setWF('name',e.target.value)}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label text="Type"/>
                <select className="kinp" style={{ ...baseInp, appearance:'none' as const }}
                  value={whForm.type} onChange={e=>setWF('type',e.target.value)}>
                  {Object.entries(WH_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label text="Address"/>
                <input className="kinp" style={baseInp} placeholder="Building / Street"
                  value={whForm.address} onChange={e=>setWF('address',e.target.value)}/>
              </div>
              <div>
                <Label text="City"/>
                <input className="kinp" style={baseInp} placeholder="Gurugram"
                  value={whForm.city} onChange={e=>setWF('city',e.target.value)}/>
              </div>
              <div>
                <Label text="State"/>
                <input className="kinp" style={baseInp} placeholder="Haryana"
                  value={whForm.state} onChange={e=>setWF('state',e.target.value)}/>
              </div>
              <div>
                <Label text="Latitude"/>
                <input className="kinp" style={baseInp} type="number" step="any" placeholder="28.4595"
                  value={whForm.latitude} onChange={e=>setWF('latitude',e.target.value)}/>
              </div>
              <div>
                <Label text="Longitude"/>
                <input className="kinp" style={baseInp} type="number" step="any" placeholder="77.0266"
                  value={whForm.longitude} onChange={e=>setWF('longitude',e.target.value)}/>
              </div>
            </div>

            {/* active toggle (edit only) */}
            {editWh && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                background:C.s3, border:`1px solid ${C.border}`, borderRadius:12, padding:'13px 15px', marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Active</div>
                  <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{whForm.is_active ? 'Operational' : 'Inactive / mothballed'}</div>
                </div>
                <div onClick={() => setWF('is_active', !whForm.is_active)}
                  style={{ width:44, height:26, borderRadius:13, background:whForm.is_active?C.green:C.grayd,
                    position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:3, left:whForm.is_active?21:3, width:20, height:20,
                    borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="kbtn" onClick={() => { setShowAddWh(false); setEditWh(null); }}
                style={{ flex:1, padding:'11px', background:C.s3, border:`1px solid ${C.border}`, color:C.gray,
                  borderRadius:11, fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={editWh ? handleUpdateWh : handleCreateWh} disabled={saving}
                style={{ flex:2, padding:'11px', background:C.red, border:'none', color:'#fff', borderRadius:11,
                  fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  opacity:saving?0.7:1, boxShadow:'0 4px 18px rgba(224,30,44,0.3)' }}>
                {saving ? <><Spinner/>{editWh ? 'Saving…' : 'Creating…'}</> : (editWh ? 'Save Changes' : 'Create Warehouse')}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ═══ DELETE CONFIRM MODAL ═══ */}
      {deleteWh && (
        <Overlay onClose={() => setDeleteWh(null)}>
          <div style={{ background:C.s2, border:`1px solid ${C.redB}`, borderRadius:20,
            width:'100%', maxWidth:420, padding:28 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, marginBottom:10 }}>
              Delete Warehouse?
            </div>
            <div style={{ fontSize:14, color:C.gray, marginBottom:22, lineHeight:1.6 }}>
              Are you sure you want to delete <strong style={{ color:C.white }}>{deleteWh.name}</strong>?
              This will also delete all its inventory movements and cannot be undone.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="kbtn" onClick={() => setDeleteWh(null)}
                style={{ flex:1, padding:'11px', background:C.s3, border:`1px solid ${C.border}`, color:C.gray,
                  borderRadius:11, fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={handleDeleteWh} disabled={saving}
                style={{ flex:1, padding:'11px', background:C.red, border:'none', color:'#fff', borderRadius:11,
                  fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:saving?0.7:1 }}>
                {saving ? <><Spinner/>Deleting…</> : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ═══ LOG MOVEMENT MODAL ═══ */}
      {showAddMv && (
        <Overlay onClose={() => setShowAddMv(false)}>
          <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:22,
            width:'100%', maxWidth:520, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800 }}>Log Movement</div>
                <div style={{ fontSize:12, color:C.gray, marginTop:3 }}>
                  {selWh?.name} · record an inventory movement
                </div>
              </div>
              <button onClick={() => setShowAddMv(false)}
                style={{ background:C.s3, border:`1px solid ${C.border}`, borderRadius:9, width:32, height:32,
                  display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:15 }}>✕</button>
            </div>

            {formErr && (
              <div style={{ background:C.redD, border:`1px solid ${C.redB}`, borderRadius:10,
                padding:'10px 14px', fontSize:13, color:C.red, marginBottom:16 }}>
                {formErr}
              </div>
            )}

            {/* Movement type selector */}
            <Label text="Movement Type" req/>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {Object.entries(MV_TYPES).map(([k,v]) => (
                <button key={k} className="kbtn" onClick={() => setMF('movement_type', k)}
                  style={{ padding:'7px 12px', borderRadius:9,
                    border:`1.5px solid ${mvForm.movement_type===k ? v.color : C.border}`,
                    background:mvForm.movement_type===k ? `${v.color}18` : 'transparent',
                    color:mvForm.movement_type===k ? v.color : C.gray,
                    fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
                  {v.sign} {v.label}
                </button>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <div>
                <Label text="SKU"/>
                <select className="kinp" style={{ ...baseInp, appearance:'none' as const }}
                  value={mvForm.sku_id} onChange={e=>setMF('sku_id',e.target.value)}>
                  <option value="">No SKU</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.name} ({s.sku_code})</option>)}
                </select>
              </div>
              <div>
                <Label text="Quantity" req/>
                <input className="kinp" style={baseInp} type="number" min="1" placeholder="e.g. 50"
                  value={mvForm.quantity} onChange={e=>setMF('quantity',e.target.value)}/>
              </div>
              <div>
                <Label text="From Location"/>
                <input className="kinp" style={baseInp} placeholder="Zone A / Rack R3"
                  value={mvForm.from_location} onChange={e=>setMF('from_location',e.target.value)}/>
              </div>
              <div>
                <Label text="To Location"/>
                <input className="kinp" style={baseInp} placeholder="Zone B / Bin B4"
                  value={mvForm.to_location} onChange={e=>setMF('to_location',e.target.value)}/>
              </div>
              <div>
                <Label text="Reference No."/>
                <input className="kinp" style={baseInp} placeholder="PO-2026-001"
                  value={mvForm.reference_no} onChange={e=>setMF('reference_no',e.target.value)}/>
              </div>
              <div>
                <Label text="Asset Used"/>
                <select className="kinp" style={{ ...baseInp, appearance:'none' as const }}
                  value={mvForm.asset_id} onChange={e=>setMF('asset_id',e.target.value)}>
                  <option value="">No asset</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.asset_code})</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <Label text="Notes"/>
                <textarea className="kinp" style={{ ...baseInp, resize:'none' as const }} rows={2}
                  placeholder="Optional remarks…"
                  value={mvForm.notes} onChange={e=>setMF('notes',e.target.value)}/>
              </div>
              <div>
                <Label text="Date & Time"/>
                <input className="kinp" style={baseInp} type="datetime-local"
                  value={mvForm.moved_at} onChange={e=>setMF('moved_at',e.target.value)}/>
              </div>
            </div>

            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="kbtn" onClick={() => setShowAddMv(false)}
                style={{ flex:1, padding:'11px', background:C.s3, border:`1px solid ${C.border}`, color:C.gray,
                  borderRadius:11, fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button className="kbtn" onClick={handleCreateMv} disabled={saving}
                style={{ flex:2, padding:'11px', background:C.red, border:'none', color:'#fff', borderRadius:11,
                  fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  opacity:saving?0.7:1, boxShadow:'0 4px 18px rgba(224,30,44,0.3)' }}>
                {saving ? <><Spinner/>Logging…</> : 'Log Movement'}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
