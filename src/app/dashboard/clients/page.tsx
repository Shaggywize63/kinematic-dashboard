'use client';
import { useState, useEffect, useCallback } from 'react';
import { Client } from '@/types';
import ConfirmModal from '@/components/ConfirmModal';

// Uses the Next.js proxy routes (/api/v1/clients) which seed the modules table
// before forwarding to the Supabase edge function, preventing FK constraint errors.
async function clientsFetch(method: string, path: string, body?: unknown) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw { response: { data } };
  return data;
}

const C = {
  bg: 'var(--bg)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)',
  border: 'var(--border)', 
  borderL: 'var(--borderL)',
  white: 'var(--text)', 
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  graydd: 'var(--border)',
  red: '#E01E2C', 
  redD: 'var(--redD)', 
  redB: 'rgba(224,30,44,0.2)',
  green: '#00D97E', 
  greenD: 'var(--greenD)',
  blue: '#3E9EFF', 
  blueD: 'var(--blueD)',
};

const MODULES = [
  { id: 'analytics',       label: 'Analytics & Tracking' },
  { id: 'live_tracking',   label: 'Live Tracking' },
  { id: 'broadcast',       label: 'Broadcasts' },
  { id: 'attendance',      label: 'Attendance' },
  { id: 'orders',          label: 'Route Planning (Orders)' },
  { id: 'work_activities', label: 'Work Activities' },
  { id: 'users',           label: 'Manpower Management' },
  { id: 'hr',              label: 'HR & Payroll' },
  { id: 'visit_logs',      label: 'Visit Logs' },
  { id: 'inventory',       label: 'Warehouse & Inventory' },
  { id: 'skus',            label: "SKU's Management" },
  { id: 'assets',          label: 'Asset Management' },
  { id: 'grievances',      label: 'Grievance Management' },
  { id: 'form_builder',    label: 'Form Builder' },
  { id: 'cities',          label: 'City Management' },
  { id: 'zones',           label: 'Zone Management' },
  { id: 'stores',          label: 'Outlet Management' },
  { id: 'activities',      label: 'Activity Management' },
  { id: 'clients',         label: 'Client Management' },
  { id: 'settings',        label: 'System Settings' },
];

const BLANK = { name: '', contact_person: '', email: '', phone: '', password: '', is_active: true, modules: [] as string[] };

const Spinner = () => <div style={{ width: 15, height: 15, border: '2.5px solid rgba(255,255,255,0.18)', borderTopColor: '#fff', borderRadius: '50%', animation: 'kspin .65s linear infinite', flexShrink: 0 }} />;
const Label = ({ t, req }: { t: string; req?: boolean }) => <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: 7 }}>{t}{req && <span style={{ color: C.red }}> *</span>}</div>;
const inp: React.CSSProperties = { width: '100%', background: C.s3, border: `1.5px solid ${C.border}`, color: C.white, borderRadius: 11, padding: '10px 13px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif", transition: 'border-color .15s' };

const Overlay = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => (
  <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(6px)' }}>
    {children}
  </div>
);

export default function ClientManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [fErr, setFErr] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{show:boolean; item:Client|null}>({show:false, item:null});
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await clientsFetch('GET', '/api/v1/clients');
      const d = Array.isArray(r?.data?.data) ? r.data.data : Array.isArray(r?.data) ? r.data : [];
      setClients(d); setErr('');
    } catch (e: any) { setErr(e.message || 'Failed to load clients'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm({ ...BLANK }); setFErr(''); setShowModal(true); };
  const openEdit = (c: Client) => { 
    // Filter out any legacy module IDs that might exist in the database (e.g. master_data)
    // but are not part of the new 20-module granular architecture.
    const validIds = (c.modules || []).filter(m => MODULES.some(mod => mod.id === m));
    setEditing(c); 
    setForm({ 
      name: c.name, 
      contact_person: c.contact_person || '', 
      email: c.email || '', 
      phone: c.phone || '', 
      password: '', 
      is_active: c.is_active, 
      modules: validIds 
    }); 
    setFErr(''); 
    setShowModal(true); 
  };

  const save = async () => {
    if (!form.name.trim()) { setFErr('Client name is required'); return; }
    setSaving(true); setFErr('');
    
    // Final verification: ensure we only send recognized module IDs to the API
    const finalForm = {
      ...form,
      modules: form.modules.filter(m => MODULES.some(mod => mod.id === m))
    };

    try {
      if (editing) await clientsFetch('PATCH', `/api/v1/clients/${editing.id}`, finalForm);
      else await clientsFetch('POST', '/api/v1/clients', finalForm);
      setShowModal(false); load();
    } catch (e: any) { setFErr(e.response?.data?.error || e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if(!deleteConfirm.item) return;
    setDeleting(true);
    try {
      await clientsFetch('DELETE', `/api/v1/clients/${deleteConfirm.item.id}`);
      setDeleteConfirm({show:false, item:null});
      load();
    } catch(e:any){
      alert(e.response?.data?.error || e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const toggleModule = (id: string) => {
    setForm(p => {
      const modules = p.modules.includes(id) 
        ? p.modules.filter(m => m !== id) 
        : [...p.modules, id];
      return { ...p, modules };
    });
  };

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.contact_person || '').toLowerCase().includes(search.toLowerCase()));
  const active = clients.filter(c => c.is_active).length;

  return (
    <div>
      <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, color: C.white, marginBottom: 8 }}>Client Management</h1>
        <p style={{ color: C.gray, fontSize: 14 }}>Manage independent clients and configure their module access.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[{ l: 'Total Clients', v: clients.length, c: C.blue }, { l: 'Active', v: active, c: C.green }, { l: 'Inactive', v: clients.length - active, c: C.gray }].map((s, i) => (
          <div key={i} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>{s.l}</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.gray }} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input style={{ ...inp, paddingLeft: 38 }} placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={openAdd} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 11, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Add Client
        </button>
      </div>

      {/* Table */}
      <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 150px 110px', padding: '12px 20px', borderBottom: `1px solid ${C.border}`, gap: 12 }}>
          {['Client Name', 'Contact Person', 'Email / Phone', 'Module Access', 'Actions'].map(h => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, color: C.grayd, letterSpacing: '0.8px', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : err ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.red, fontSize: 13 }}>{err}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: C.grayd, fontSize: 13 }}>
            {search ? 'No clients match your search.' : 'No clients yet. Add your first client to enable multi-tenancy.'}
          </div>
        ) : filtered.map((c, i) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 150px 110px', padding: '16px 20px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', gap: 12, alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.background = C.s3}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.white }}>{c.name}</div>
              <div style={{ fontSize: 11, color: C.grayd, marginTop: 4 }}>ID: {c.id.split('-')[0]}...</div>
            </div>
            <div style={{ fontSize: 13, color: C.white }}>{c.contact_person || '—'}</div>
            <div style={{ fontSize: 13, color: C.gray }}>
              <div>{c.email || '—'}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{c.phone || ''}</div>
            </div>
            <div style={{ padding: '4px 8px', background: c.modules?.length ? 'rgba(62,158,255,0.1)' : 'transparent', border: `1px solid ${c.modules?.length ? 'rgba(62,158,255,0.2)' : 'transparent'}`, borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.modules?.length ? C.blue : C.grayd }}>{c.modules?.length || 0} Modules Assigned</div>
              <div style={{ fontSize: 10, color: C.grayd, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.modules?.map(m => MODULES.find(mod => mod.id === m)?.label).filter(Boolean).join(', ') || 'No access granted'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openEdit(c)} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 10, background: 'transparent', cursor: 'pointer', color: C.gray, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.color = C.blue; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.gray; }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button onClick={() => openEdit(c)} title={c.is_active?'Deactivate':'Activate'} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 10, background: 'transparent', cursor: 'pointer', color: c.is_active ? C.green : C.gray, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.is_active ? C.green : C.gray }} />
              </button>
              <button onClick={() => setDeleteConfirm({show:true, item:c})} title="Delete Client" style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 10, background: 'transparent', cursor: 'pointer', color: C.gray, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.gray; }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <Overlay onClose={() => setShowModal(false)}>
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 24, padding: 32, width: '100%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', position:'relative' }}>
            {/* Close Button (X) */}
            <button onClick={() => setShowModal(false)} style={{ position:'absolute', top:22, right:22, width:36, height:36, borderRadius:12, border:'none', background:C.s3, color:C.gray, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
              onMouseEnter={e => { e.currentTarget.style.color = C.white; e.currentTarget.style.background = C.border; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.gray; e.currentTarget.style.background = C.s3; }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>

            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{editing ? 'Edit Client' : 'Add New Client'}</div>
            <p style={{ fontSize: 13, color: C.gray, marginBottom: 28 }}>{editing ? `Update configurations for ${editing.name}` : 'Setup a new isolated client environment'}</p>
            
            {fErr && <div style={{ background: 'rgba(224,30,44,0.1)', border: '1px solid rgba(224,30,44,0.2)', borderRadius: 12, padding: '12px 16px', color: C.red, fontSize: 13, marginBottom: 20 }}>{fErr}</div>}
            
            <div style={{ marginBottom: 18 }}>
              <Label t="Client Name" req />
              <input style={inp} placeholder="e.g. Horizonn Studio" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div><Label t="Contact Person" /><input style={inp} placeholder="Name" value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} /></div>
              <div><Label t="Phone" /><input style={inp} placeholder="+91..." value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div><Label t="Email Address" /><input style={inp} placeholder="client@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label t="Login Password" req={!editing} /><input type="password" style={inp} placeholder={editing ? "(Unchanged)" : "Create password"} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <Label t="Module Access Control" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, background: C.s3, borderRadius: 16, padding: 16, border: `1px solid ${C.border}` }}>
                {MODULES.map(m => (
                  <div key={m.id} onClick={() => toggleModule(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: form.modules.includes(m.id) ? 'rgba(62,158,255,0.1)' : 'transparent', border: `1px solid ${form.modules.includes(m.id) ? C.blue : 'transparent'}`, transition: 'all .15s' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: form.modules.includes(m.id) ? C.blue : C.s4, border: `1.5px solid ${form.modules.includes(m.id) ? C.blue : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {form.modules.includes(m.id) && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4}><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>
                    <span style={{ fontSize: 12, color: form.modules.includes(m.id) ? C.white : C.gray, fontWeight: form.modules.includes(m.id) ? 600 : 500 }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '13px', border: `1px solid ${C.border}`, borderRadius: 12, background: 'transparent', color: C.gray, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: 12, background: C.red, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: "'DM Sans', sans-serif", boxShadow: `0 8px 20px ${C.redB}`, opacity: saving ? 0.7 : 1 }}>
                {saving ? <Spinner /> : editing ? 'Update Client' : 'Create Client'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      <ConfirmModal
        show={deleteConfirm.show}
        onClose={() => setDeleteConfirm({show:false, item:null})}
        onConfirm={handleDelete}
        title="Delete Client"
        message="Are you sure you want to permanently delete this client"
        itemName={deleteConfirm.item?.name}
        loading={deleting}
      />
    </div>
  );
}
