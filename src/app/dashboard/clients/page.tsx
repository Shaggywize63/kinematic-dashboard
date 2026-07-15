'use client';
import { useState, useEffect, useCallback } from 'react';
import { Client } from '../../../types';
import ConfirmModal from '../../../components/ConfirmModal';
import { useAuth } from '../../../hooks/useAuth';
import { ALL_MODULES, MODULE_GROUPS, MODULE_GROUP_LABELS, type ModuleGroup } from '../../../lib/modules';
import api, { setActingAs } from '../../../lib/api';
import { getStoredProjectKey, DEFAULT_PROJECT, setStoredProjectKey } from '../../../lib/projects';
import { useTableSort, SortLabel } from '../../../lib/tableSort';
import ImpersonationControl from '../../../components/ImpersonationControl';

// Uses the Next.js proxy routes (/api/v1/clients) which seed the modules table
// before forwarding to the Supabase edge function, preventing FK constraint errors.
async function clientsFetch(method: string, path: string, body?: unknown) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
  // Forward the same tenant/project headers the main api client sends. Without
  // X-Kinematic-Project the Next proxy route defaults to the Tata project and
  // sends a Kinematic session's token to the wrong Supabase ("Failed to load
  // clients"); X-Org-Id scopes the lookup the same way the rest of the app does.
  let orgId: string | null = null;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
    orgId = raw ? (JSON.parse(raw)?.org_id ?? null) : null;
  } catch { /* ignore */ }
  const project = getStoredProjectKey();
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { 'X-Org-Id': orgId } : {}),
      ...(project && project !== DEFAULT_PROJECT ? { 'X-Kinematic-Project': project } : {}),
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

// Module access list is derived from the sidebar module catalog
// (lib/modules.ts) so it is COMPLETE and stays in sync automatically — any
// module added to the sidebar in future shows up here without touching this
// file. Audit is super-admin-only and never granted to clients, so it is
// excluded from the client access selector.
const GRANTABLE_GROUPS: ModuleGroup[] = MODULE_GROUPS.filter(g => g !== 'Audit');
const MODULES: { id: string; label: string; group: ModuleGroup }[] = ALL_MODULES
  .filter(m => m.group !== 'Audit')
  .map(m => ({ id: m.id, label: m.l, group: m.group }));

// Modules that are intentionally OFF by default when a new client is onboarded.
// The customer only gets them switched on when they explicitly ask. These are:
// Conversation Analysis (crm_conversation_intel), People Directory
// (crm_people_directory), Market Intelligence (crm_lead_analytics) and Email
// (crm_email). Existing clients are unaffected — this only seeds the "Add client"
// form default.
const NEW_CLIENT_EXCLUDED_MODULES = ['crm_conversation_intel', 'crm_people_directory', 'crm_lead_analytics', 'crm_email'];
// A brand-new client starts with the standard CRM working set pre-selected
// (every CRM module except the excluded four above) rather than a blank grant.
// Derived from the module catalog so any CRM module added later is included
// automatically, and a non-empty grant means the nav never falls open to
// "show everything" for a freshly-created client.
const NEW_CLIENT_DEFAULT_MODULES = ALL_MODULES
  .filter(m => m.group === 'CRM' && !NEW_CLIENT_EXCLUDED_MODULES.includes(m.id))
  .map(m => m.id);

const BLANK = { name: '', contact_person: '', email: '', phone: '', password: '', is_active: true, modules: [] as string[], login_org_id: '', data_project_key: '', data_client_id: '', max_active_users: '' as number | '' };

const Spinner = () => <div style={{ width: 15, height: 15, border: '2.5px solid rgba(255,255,255,0.18)', borderTopColor: '#fff', borderRadius: '50%', animation: 'kspin .65s linear infinite', flexShrink: 0 }} />;
const Label = ({ t, req }: { t: string; req?: boolean }) => <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: '0.7px', textTransform: 'uppercase', marginBottom: 7 }}>{t}{req && <span style={{ color: C.red }}> *</span>}</div>;
const inp: React.CSSProperties = { width: '100%', background: C.s3, border: `1.5px solid ${C.border}`, color: C.white, borderRadius: 11, padding: '10px 13px', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif", transition: 'border-color .15s' };

const Overlay = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => (
  <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(6px)' }}>
    {children}
  </div>
);

export default function ClientManagement() {
  const { user } = useAuth();
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  // Automated onboarding: is a dedicated Supabase project (separate DB) per
  // client available on this deployment? Drives the create-form toggle.
  const [provisionAvail, setProvisionAvail] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [provisionMode, setProvisionMode] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ projectRef: string; adminEmail: string; adminPassword?: string; projectUrl: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use the shared api client (direct to backend, with project/org headers,
      // acting-as token and 401-refresh) — the same proven path the rest of the
      // dashboard uses. Avoids the fragile extra Next-proxy hop that caused
      // "Failed to load clients".
      const r: any = await api.get('/api/v1/clients', { noCache: true } as RequestInit);
      const d = Array.isArray(r) ? r
        : Array.isArray(r?.data) ? r.data
        : Array.isArray(r?.data?.data) ? r.data.data : [];
      setClients(d); setErr('');
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'Failed to load clients'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // One-shot: does this deployment support provisioning a dedicated project per
  // client? (super-admin only; a plain 403/400 just leaves the toggle hidden.)
  useEffect(() => {
    let alive = true;
    api.provisionPreflight().then(r => { if (alive) setProvisionAvail(r); }).catch(() => { if (alive) setProvisionAvail({ ok: false }); });
    return () => { alive = false; };
  }, []);

  const openAdd = () => { setEditing(null); setForm({ ...BLANK, modules: [...NEW_CLIENT_DEFAULT_MODULES] }); setFErr(''); setProvisionMode(false); setProvisionResult(null); setShowModal(true); };
  // Super-admin "Login as client": authenticate with the client's stored
  // account credentials and swap into that real session (e.g. the live Tata
  // account). The current super-admin session is saved so the banner's Exit
  // can restore it. No manual credential entry.
  const loginAsClient = async (c: Client, env: 'production' | 'staging' = 'production') => {
    setLoggingIn(`${c.id}:${env}`);
    try {
      const res: any = await api.loginAsCredentials(c.id, env);
      const d = res?.data ?? res;
      // Save the super-admin session for Exit/restore.
      const su = {
        token: localStorage.getItem('kinematic_token'),
        refresh: localStorage.getItem('kinematic_refresh_token'),
        user: localStorage.getItem('kinematic_user'),
        project: localStorage.getItem('kinematic_supabase_project'),
        client: localStorage.getItem('kinematic_selected_client'),
      };
      localStorage.setItem('kinematic_su_session', JSON.stringify(su));
      const modules = (c as { modules?: string[] }).modules || [];
      const label = env === 'staging' ? `${c.name} (Staging)` : c.name;
      const isStaging = !!d?.staging;

      // Same-project client: no stored password — enter it by impersonating the
      // target (prod or staging) org on the EXISTING super-admin session.
      if (d?.mode === 'impersonate' && d?.org_id) {
        localStorage.removeItem('kinematic_selected_client');
        if (d.project) setStoredProjectKey(d.project);
        setActingAs({ org_id: d.org_id, client_id: d.client_id, name: label, modules, staging: isStaging, project: d.project });
        window.location.href = '/dashboard/crm/leads';
        return;
      }

      // Cross-project client: swap into the account's real returned session, then
      // scope to the target (prod or staging) org.
      if (!d?.access_token) throw new Error('No session returned');
      localStorage.setItem('kinematic_token', d.access_token);
      if (d.refresh_token) localStorage.setItem('kinematic_refresh_token', d.refresh_token);
      localStorage.removeItem('kinematic_selected_client'); // avoid stale client scope
      setStoredProjectKey(d.project || null);               // route to the account's project
      try {
        const me: any = await api.get('/api/v1/auth/me');
        const meUser = me?.data ?? me;
        if (meUser) localStorage.setItem('kinematic_user', JSON.stringify(meUser));
      } catch { /* layout will retry /auth/me */ }
      // Scope to the target org (prod vs staging) + banner + module restriction.
      setActingAs({ org_id: d.org_id, name: label, modules, staging: isStaging, project: d.project });
      window.location.href = '/dashboard/crm/leads';
    } catch (e: any) {
      setLoggingIn(null);
      alert(e?.response?.data?.error || e?.message || 'Login failed');
    }
  };
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
      modules: validIds,
      login_org_id: (c as { login_org_id?: string }).login_org_id || '',
      data_project_key: (c as { data_project_key?: string }).data_project_key || '',
      data_client_id: (c as { data_client_id?: string }).data_client_id || '',
      max_active_users: (c as { max_active_users?: number | null }).max_active_users ?? '',
    });
    setFErr('');
    setProvisionMode(false); setProvisionResult(null);
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
      if (!editing && provisionMode) {
        // Automated onboarding: create a dedicated Supabase project (separate
        // DB) + org + admin user, and link it into the control plane. Slow
        // (project spin-up ~1–2 min) so keep the modal open until it returns.
        // Idempotency key = name+timestamp so a retry after a network blip
        // doesn't create a second billable project.
        const idem = `${finalForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')}-${Date.now()}`;
        const res: any = await api.provisionClient({
          name: finalForm.name.trim(),
          contact_person: finalForm.contact_person,
          phone: finalForm.phone,
          email: finalForm.email || undefined,
          password: finalForm.password || undefined,
          modules: finalForm.modules,
        }, idem);
        const r = res?.data ?? res;
        setProvisionResult({ projectRef: r.projectRef, adminEmail: r.adminEmail, adminPassword: r.adminPassword, projectUrl: r.projectUrl });
        load();
        return; // keep modal open to show the generated credentials
      }
      if (editing) await api.patch(`/api/v1/clients/${editing.id}`, finalForm);
      else await api.post('/api/v1/clients', finalForm);
      setShowModal(false); load();
    } catch (e: any) { setFErr(e.response?.data?.error || e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if(!deleteConfirm.item) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/clients/${deleteConfirm.item.id}`);
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

  // Type-aware column sorting for the client list (client-side; the full list
  // is already loaded). Sorts by the mapped value per column key.
  const clientVal = useCallback((c: Client, key: string): unknown => {
    switch (key) {
      case 'name': return c.name;
      case 'contact_person': return c.contact_person;
      case 'email': return c.email || c.phone;
      case 'modules': return c.modules?.length || 0;
      default: return (c as unknown as Record<string, unknown>)[key];
    }
  }, []);
  const { sorted, sort, toggle } = useTableSort<Client>(filtered, clientVal, { key: 'name', dir: 'asc' });

  // One-click activate / deactivate (optimistic; reverts on error). The backend
  // PATCH /clients/:id already accepts { is_active }.
  const toggleActive = async (c: Client) => {
    const next = !c.is_active;
    setClients(prev => prev.map(x => x.id === c.id ? { ...x, is_active: next } : x));
    try {
      await clientsFetch('PATCH', `/api/v1/clients/${c.id}`, { name: c.name, is_active: next });
    } catch (e: any) {
      setClients(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !next } : x));
      setErr(e?.response?.data?.error || e?.message || 'Failed to update client status');
    }
  };

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
        {/* Master-admin only: impersonate any user (self-gates to null for
            everyone else). Sits next to "Login as client" (per-row Envs). */}
        <ImpersonationControl />
        <button onClick={openAdd} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 11, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14"/></svg>
          Add Client
        </button>
      </div>

      {/* Table */}
      <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.3fr 140px 190px', padding: '12px 20px', borderBottom: `1px solid ${C.border}`, gap: 12 }}>
          {([
            { h: 'Client Name', k: 'name' },
            { h: 'Contact Person', k: 'contact_person' },
            { h: 'Email / Phone', k: 'email' },
            { h: 'Module Access', k: 'modules' },
            { h: 'Actions', k: null },
          ] as { h: string; k: string | null }[]).map(col => (
            <div key={col.h} style={{ fontSize: 11, fontWeight: 700, color: C.grayd, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {col.k
                ? <SortLabel label={col.h} sortKey={col.k} sort={sort} onToggle={toggle} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase' }} />
                : col.h}
            </div>
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
        ) : sorted.map((c, i) => {
          const canLogin = user?.role === 'super_admin' && !!(c as { org_id?: string }).org_id;
          const expanded = expandedId === c.id;
          return (
          <div key={c.id} style={{ borderBottom: i < sorted.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1.3fr 140px 190px', padding: '16px 20px', gap: 12, alignItems: 'center' }}
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
                {canLogin && (
                  <button onClick={() => setExpandedId(expanded ? null : c.id)} title="Show environments" style={{ height: 32, padding: '0 12px', border: `1px solid ${C.blue}`, borderRadius: 10, background: 'rgba(62,158,255,0.1)', cursor: 'pointer', color: C.blue, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Envs {expanded ? '▴' : '▾'}
                  </button>
                )}
                <button onClick={() => openEdit(c)} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 10, background: 'transparent', cursor: 'pointer', color: C.gray, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.color = C.blue; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.gray; }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
                </button>
                <button onClick={() => toggleActive(c)} title={c.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                  style={{ height: 32, padding: '0 10px', border: `1px solid ${c.is_active ? 'rgba(0,217,126,0.4)' : C.border}`, borderRadius: 10, background: c.is_active ? 'rgba(0,217,126,0.1)' : 'transparent', cursor: 'pointer', color: c.is_active ? C.green : C.gray, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700 }}>
                   <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.is_active ? C.green : C.gray }} />
                   {c.is_active ? 'Active' : 'Inactive'}
                </button>
                {user?.role !== 'client' && (
                  <button onClick={() => setDeleteConfirm({show:true, item:c})} title="Delete Client" style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 10, background: 'transparent', cursor:'pointer', color: C.gray, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.gray; }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                )}
              </div>
            </div>
            {expanded && canLogin && (
              <div style={{ padding: '0 20px 16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(['production', 'staging'] as const).map(envK => (
                  <div key={envK} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: envK === 'production' ? C.green : '#F5A623' }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.white, textTransform: 'capitalize' }}>{envK} org</div>
                    {(() => { const k = `${c.id}:${envK}`; const busy = loggingIn === k; return (
                    <button onClick={() => loginAsClient(c, envK)} disabled={!!loggingIn} title={`Login to ${envK}`} style={{ height: 30, padding: '0 14px', border: `1px solid ${C.blue}`, borderRadius: 9, background: 'rgba(62,158,255,0.1)', cursor: loggingIn ? 'default' : 'pointer', color: C.blue, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: (loggingIn && !busy) ? 0.5 : 1 }}>
                      {busy
                        ? <><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animation: 'kspin 0.7s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Logging in…</>
                        : <><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg> Login</>}
                    </button>
                    ); })()}
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
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

            {/* Automated onboarding toggle — creates a dedicated Supabase
                project (separate DB) for true isolation, just like Tata. Only
                shown when the deployment is configured for it. */}
            {!editing && provisionAvail?.ok && !provisionResult && (
              <div onClick={() => setProvisionMode(v => !v)} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', marginBottom: 20, borderRadius: 12, cursor: 'pointer', background: provisionMode ? 'rgba(62,158,255,0.1)' : C.s3, border: `1px solid ${provisionMode ? C.blue : C.border}` }}>
                <div style={{ width: 18, height: 18, marginTop: 1, borderRadius: 5, flexShrink: 0, background: provisionMode ? C.blue : C.s4, border: `1.5px solid ${provisionMode ? C.blue : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {provisionMode && <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4}><path d="M20 6L9 17l-5-5"/></svg>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: provisionMode ? C.white : C.gray }}>Provision a dedicated project &amp; database</div>
                  <div style={{ fontSize: 11, color: C.grayd, marginTop: 3 }}>Creates a brand-new Supabase project (separate DB, ~$10/mo), loads the schema, and sets up the client&apos;s org + a <code>test@{(form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'') || 'client')}.com</code> admin login. Takes ~1–2 minutes.</div>
                </div>
              </div>
            )}

            {/* Provisioning result — the generated admin credentials. Shown
                once; the password is not recoverable afterwards. */}
            {provisionResult && (
              <div style={{ background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#2ecc71', marginBottom: 10 }}>✓ Client provisioned</div>
                <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.9 }}>
                  <div>Project ref: <b style={{ color: C.white }}>{provisionResult.projectRef}</b></div>
                  <div>Admin email: <b style={{ color: C.white }}>{provisionResult.adminEmail}</b></div>
                  {provisionResult.adminPassword && <div>Admin password: <b style={{ color: C.white, fontFamily: 'monospace' }}>{provisionResult.adminPassword}</b> <span style={{ color: C.grayd }}>(save it now — shown once)</span></div>}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div><Label t="Contact Person" /><input style={inp} placeholder="Name" value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} /></div>
              <div><Label t="Phone" /><input style={inp} placeholder="+91..." value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div><Label t="Email Address" /><input style={inp} placeholder="client@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label t="Login Password" req={!editing} /><input type="password" style={inp} placeholder={editing ? "(Unchanged)" : "Create password"} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
              <div><Label t="Data Project (optional)" /><input style={inp} placeholder="e.g. default (Tata) — blank = this project" value={form.data_project_key} onChange={e => setForm(p => ({ ...p, data_project_key: e.target.value.trim() }))} /></div>
              <div><Label t="Linked Client ID (target project)" /><input style={inp} placeholder="UUID of the client in that project" value={form.data_client_id} onChange={e => setForm(p => ({ ...p, data_client_id: e.target.value.trim() }))} /></div>
            </div>
            <div style={{ fontSize: 11, color: C.grayd, marginBottom: 24 }}>
              Set these to control another org&apos;s module ceiling from here. Checked modules become the maximum available in that org; unchecking decommissions a module there. Leave blank for a same-project client.
            </div>

            <div style={{ marginBottom: 24 }}>
              <Label t="Max Active Users (optional)" />
              <input
                type="number" min={1} style={{ ...inp, maxWidth: 220 }}
                placeholder="No limit"
                value={form.max_active_users === '' ? '' : String(form.max_active_users)}
                onChange={e => {
                  const v = e.target.value.trim();
                  setForm(p => ({ ...p, max_active_users: v === '' ? '' : Math.max(0, parseInt(v, 10) || 0) }));
                }}
              />
              <div style={{ fontSize: 11, color: C.grayd, marginTop: 6 }}>
                Caps how many <b>active</b> users this client&apos;s org can have. New/activated users
                beyond the limit are blocked. Blank = no limit. Staff domains (kinematicapp.com,
                horizontechstudio.com, kinematic.com, kaiyotechnologylabs.com) don&apos;t count toward it.
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <Label t="Module Access Control" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, background: C.s3, borderRadius: 16, padding: 16, border: `1px solid ${C.border}` }}>
                {GRANTABLE_GROUPS.map(group => {
                  const groupModules = MODULES.filter(m => m.group === group);
                  if (!groupModules.length) return null;
                  const groupIds = groupModules.map(m => m.id);
                  const allOn = groupIds.every(id => form.modules.includes(id));
                  const toggleGroup = () => setForm(p => {
                    const set = new Set(p.modules);
                    if (allOn) groupIds.forEach(id => set.delete(id));
                    else groupIds.forEach(id => set.add(id));
                    return { ...p, modules: [...set] };
                  });
                  return (
                    <div key={group}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: C.grayd }}>{MODULE_GROUP_LABELS[group]}</div>
                        <span onClick={toggleGroup} style={{ fontSize: 11, fontWeight: 600, color: C.blue, cursor: 'pointer' }}>{allOn ? 'Clear' : 'Select all'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {groupModules.map(m => (
                          <div key={m.id} onClick={() => toggleModule(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: form.modules.includes(m.id) ? 'rgba(62,158,255,0.1)' : 'transparent', border: `1px solid ${form.modules.includes(m.id) ? C.blue : 'transparent'}`, transition: 'all .15s' }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, background: form.modules.includes(m.id) ? C.blue : C.s4, border: `1.5px solid ${form.modules.includes(m.id) ? C.blue : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {form.modules.includes(m.id) && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4}><path d="M20 6L9 17l-5-5"/></svg>}
                            </div>
                            <span style={{ fontSize: 12, color: form.modules.includes(m.id) ? C.white : C.gray, fontWeight: form.modules.includes(m.id) ? 600 : 500 }}>{m.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {provisionResult ? (
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: 12, background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Done</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setShowModal(false)} disabled={saving} style={{ flex: 1, padding: '13px', border: `1px solid ${C.border}`, borderRadius: 12, background: 'transparent', color: C.gray, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.6 : 1 }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: 12, background: C.red, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: "'DM Sans', sans-serif", boxShadow: `0 8px 20px ${C.redB}`, opacity: saving ? 0.7 : 1 }}>
                  {saving ? <><Spinner />{provisionMode && !editing ? 'Provisioning… (~1–2 min)' : ''}</> : editing ? 'Update Client' : provisionMode ? 'Provision Project' : 'Create Client'}
                </button>
              </div>
            )}
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
