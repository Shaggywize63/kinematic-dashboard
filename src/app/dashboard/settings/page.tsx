'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '../../../lib/api';
import CitySelect from '../../../components/CitySelect';
import FieldTrackingCadencePicker from '../../../components/FieldTrackingCadencePicker';
import { AuthUser } from '../../../types';
import { getDesignationLabel } from '../../../lib/auth';
import { ALL_MODULES, MODULE_GROUPS, MODULE_GROUP_LABELS } from '../../../lib/modules';
import { useTableSort, SortLabel } from '../../../lib/tableSort';

const C = {
  bg: 'var(--bg)', 
  s1: 'var(--s1)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)',
  border: 'var(--border)', 
  borderL: 'var(--borderL)',
  white: 'var(--text)', 
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)',
  red: '#E01E2C', 
  redD: 'var(--redD)', 
  redB: 'rgba(224,30,44,0.20)',
  green: '#00D97E', 
  blue: '#3E9EFF',
};

const ROLE_DEFAULTS: Record<string, string[]> = {
  admin: [
    'analytics', 'live_tracking', 'broadcast', 'attendance', 'orders', 'work_activities',
    'users', 'hr', 'visit_logs', 'inventory', 'skus', 'assets', 'grievances', 'form_builder',
    'cities', 'zones', 'stores', 'activities', 'clients', 'reports', 'planograms', 'settings',
    'distribution', 'distribution_brands', 'distribution_distributors', 'distribution_pricing',
    'distribution_schemes', 'distribution_orders', 'distribution_invoicing', 'distribution_payments',
    'distribution_returns', 'distribution_ledger', 'distribution_consumer',
  ],
  sub_admin: [
    'analytics', 'live_tracking', 'broadcast', 'attendance', 'orders', 'work_activities',
    'users', 'hr', 'visit_logs', 'inventory', 'skus', 'assets', 'grievances', 'form_builder',
    'cities', 'zones', 'stores', 'activities', 'clients', 'reports', 'planograms', 'settings',
    'distribution', 'distribution_brands', 'distribution_distributors', 'distribution_pricing',
    'distribution_schemes', 'distribution_orders', 'distribution_invoicing', 'distribution_payments',
    'distribution_returns', 'distribution_ledger', 'distribution_consumer',
  ],
  city_manager: [
    'analytics', 'live_tracking', 'attendance', 'orders', 'work_activities', 'visit_logs',
    'distribution', 'distribution_orders', 'distribution_payments',
  ],
  warehouse_manager: ['inventory', 'skus', 'assets', 'distribution_invoicing', 'distribution_pricing'],
  hr: ['analytics', 'users', 'hr'],
  mis: ['analytics', 'visit_logs', 'reports', 'distribution_ledger'],
  // Clients sit at sub-admin parity (see ROLE_HIERARCHY in lib/auth.ts) so
  // they can manage their own role hierarchy + CRM configuration. Defaults
  // mirror sub_admin's module list — admins can still narrow by client when
  // creating the user via the client-modules picker.
  client: [
    'analytics', 'live_tracking', 'broadcast', 'attendance', 'orders', 'work_activities',
    'users', 'hr', 'visit_logs', 'inventory', 'skus', 'assets', 'grievances', 'form_builder',
    'cities', 'zones', 'stores', 'activities', 'clients', 'reports', 'planograms', 'settings',
    'crm', 'crm_dashboard', 'crm_leads', 'crm_contacts', 'crm_accounts', 'crm_deals',
    'crm_pipeline', 'crm_products', 'crm_activities', 'crm_tasks', 'crm_whatsapp', 'crm_reports', 'crm_settings',
  ]
};

// Type-aware column sorting for the admin/user directory (role sorts by the
// same designation label shown in the cell).
const userVal = (u: AuthUser, key: string): unknown => {
  switch (key) {
    case 'name': return u.name;
    case 'email': return u.email;
    case 'role': return getDesignationLabel(u as any);
    default: return (u as unknown as Record<string, unknown>)[key];
  }
};
// Sorting for the clients table (modules sorts by count, status by active flag).
const clientVal = (c: any, key: string): unknown => {
  switch (key) {
    case 'name': return c.name;
    case 'contact': return c.contact_person;
    case 'email': return c.email;
    case 'modules': return (c.modules || []).length;
    case 'status': return c.is_active !== false;
    default: return c[key];
  }
};


export default function SettingsPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editMode, setEditMode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users'|'rules'|'pref'|'clients'>('users');
  const [showClientAdd, setShowClientAdd] = useState(false);
  const [editClientId, setEditClientId] = useState<string|null>(null);
  // Pre-fill new client form with the full CRM bundle (Email, Templates, Senders,
  // People Directory, Leads, etc.) so super-admins don't need to remember to
  // tick each one. Edit mode overwrites this from the loaded client.modules.
  const DEFAULT_NEW_CLIENT_MODULES = ALL_MODULES
    .filter((m) => m.group === 'CRM')
    .map((m) => m.id);

  const [clientForm, setClientForm] = useState<{ name: string; contact_person: string; email: string; phone: string; password: string; modules: string[] }>({
    name: '', contact_person: '', email: '', phone: '', password: '', modules: DEFAULT_NEW_CLIENT_MODULES,
  });

  // Inline role creation. Lives in the User Directory tab so admins can add a
  // new org-role + scope it to a specific client without leaving the form.
  const [showRoleAdd, setShowRoleAdd] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [roleForm, setRoleForm] = useState<{ name: string; client_id: string; description: string; color: string }>({
    name: '', client_id: '', description: '', color: '#6366f1',
  });
  // Two-state theme (no 'system' anymore — OS auto-switching was the
  // root cause of "random theme changes" admins reported). Default
  // 'dark' is overwritten on mount from localStorage.
  const [theme, setTheme] = useState<'dark'|'light'>('dark');
  const [radius, setRadius] = useState(100);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '', email: '', role: 'sub_admin', password: '', 
    mobile: '', employee_id: '', zone_id: '', city: '',
    client_id: '',
    permissions: ROLE_DEFAULTS['sub_admin'],
    assigned_cities: [] as string[]
  });

  // NEW: System Settings Hooks
  const [opsRules, setOpsRules] = useState({
    shiftStart: '09:00',
    shiftEnd: '18:00',
    gracePeriod: 15,
    autoCheckout: 12,
    minAppVersion: '1.2.0',
    gpsAccuracy: 50,
    orgName: 'Kaiyo Technology Labs',
    orgSupport: 's@kinematicapp.com',
  });

  // Load org details on mount so the form reflects what's saved.
  useEffect(() => {
    (async () => {
      try {
        const r: any = await api.getMyOrg();
        const o = r?.data || r;
        if (o) {
          setOpsRules((p) => ({
            ...p,
            orgName:    o.name || p.orgName,
            orgSupport: o.settings?.support_email || p.orgSupport,
          }));
        }
      } catch {/* fail-soft: keep defaults */}
    })();
  }, []);

  // Sync Theme Initial State (now 3-way: dark / light / system).
  // 'system' tracks the OS prefers-color-scheme media query so the
  // dashboard follows whatever the user set at the OS level — and re-renders
  // when they flip it (without a refresh).
  useEffect(() => {
    // Single source of truth is localStorage + the inline boot script
    // in app/layout.tsx. This effect only mirrors the saved value into
    // the local React state so the active button highlights correctly.
    // Anything that ISN'T explicitly 'light' resolves to 'dark' —
    // legacy 'system' values, empty stores, and corrupt strings all
    // collapse to the same baseline.
    try {
      const raw = localStorage.getItem('kinematic-theme');
      setTheme(raw === 'light' ? 'light' : 'dark');
    } catch { setTheme('dark'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTheme = (t: 'dark'|'light') => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
  };

  const toggleTheme = (t: 'dark'|'light') => {
    setTheme(t);
    applyTheme(t);
    try { localStorage.setItem('kinematic-theme', t); } catch { /* ignore */ }
    // Mirror to a 1-year cookie so the server-rendered <html data-theme>
    // matches on the next hard refresh — no FOUC. Same-origin SameSite=Lax
    // means it travels on every request to the dashboard.
    try {
      document.cookie = `kinematic-theme=${t}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch { /* ignore */ }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uR, zR, cR, clR] = await Promise.all([
        api.get<any>('/api/v1/users?limit=1000'),
        api.get<any>('/api/v1/zones'),
        api.get<any>('/api/v1/cities'),
        api.get<any>('/api/v1/clients')
      ]);
      
      const pick = (r: any) => r.data?.data || r.data || r.users || r || [];
      const allUsers = pick(uR);
      
      const admins = allUsers.filter((u: any) => {
        const r = (u.role || '').toLowerCase().trim().replace(/-/g, '_');
        return ['admin', 'sub_admin', 'city_manager', 'hr', 'mis', 'warehouse_manager', 'client', 'super_admin', 'main_admin', 'master_admin'].includes(r) || r.includes('admin');
      });
      
      setUsers(admins);
      setZones(pick(zR));
      setCities(pick(cR).filter((c: any) => c.is_active));
      setClients(pick(clR));
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allCityNames = cities.map(c => c.name);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.updateMyOrg({
        name: opsRules.orgName,
        support_email: opsRules.orgSupport,
      });
      alert('Organisation details saved');
    } catch (e: any) {
      alert(`Save failed: ${e.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (u: any) => {
    setEditMode(u.id);
    setForm({
      name: u.name || '',
      email: u.email || '',
      role: u.role || 'sub_admin',
      password: '', // Hidden/Unchanged by default
      mobile: u.mobile || '',
      employee_id: u.employee_id || '',
      zone_id: u.zone_id || '',
      city: u.city || '',
      client_id: u.client_id || '',
      permissions: u.permissions || [],
      assigned_cities: u.assigned_cities || []
    });
    setShowAdd(true);
  };

  const handleSaveUser = async () => {
    if(!form.name || !form.mobile) return;
    setSaving(true);
    try {
      const payload = { 
        ...form, 
        // Sync email if blank
        email: form.email || `${form.mobile}@kinematic.app`,
        is_active: true 
      };

      if (editMode) {
        await api.patch(`/api/v1/users/${editMode}`, { 
          ...payload, 
          app_password: form.password || undefined 
        });
      } else {
        await api.post('/api/v1/users', payload);
      }
      
      setShowAdd(false);
      setEditMode(null);
      setForm({
        name: '', email: '', role: 'sub_admin', password: '', 
        mobile: '', employee_id: '', zone_id: '', city: '',
        client_id: '',
        permissions: ROLE_DEFAULTS['sub_admin'], assigned_cities: []
      });
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };


  const handleUpdateUser = async (u: AuthUser) => {
    try {
      await api.patch(`/api/v1/users/${u.id}`, { is_active: !u.is_active });
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  const resetClientForm = () => {
    setClientForm({ name: '', contact_person: '', email: '', phone: '', password: '', modules: DEFAULT_NEW_CLIENT_MODULES });
    setEditClientId(null);
    setShowClientAdd(false);
  };

  const handleEditClient = (c: any) => {
    setEditClientId(c.id);
    setClientForm({
      name: c.name || '',
      contact_person: c.contact_person || '',
      email: c.email || '',
      phone: c.phone || '',
      password: '',
      modules: c.modules || [],
    });
    setShowClientAdd(true);
  };

  const handleSaveClient = async () => {
    if (!clientForm.name) { alert('Client name is required'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: clientForm.name,
        contact_person: clientForm.contact_person || undefined,
        email: clientForm.email || undefined,
        phone: clientForm.phone || undefined,
        modules: clientForm.modules,
      };
      if (clientForm.password) payload.password = clientForm.password;
      if (editClientId) {
        await api.patch(`/api/v1/clients/${editClientId}`, payload);
      } else {
        await api.post('/api/v1/clients', payload);
      }
      resetClientForm();
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to save client');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Delete this client? Their administrator account and module access will be removed.')) return;
    try {
      await api.delete(`/api/v1/clients/${id}`);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete client');
    }
  };

  const toggleClientModule = (m: string) => {
    setClientForm((f) => ({
      ...f,
      modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m],
    }));
  };

  const resetRoleForm = () => {
    setRoleForm({ name: '', client_id: '', description: '', color: '#6366f1' });
    setShowRoleAdd(false);
  };

  const handleCreateRole = async () => {
    if (!roleForm.name.trim()) { alert('Role name is required'); return; }
    setSavingRole(true);
    try {
      // Send X-Client-Id explicitly so the new role is stamped to the picked
      // client; otherwise the auto-attached header from the global picker (or
      // null for unscoped) is used.
      const headers = roleForm.client_id ? { 'X-Client-Id': roleForm.client_id } : {};
      await api.post('/api/v1/roles', {
        name: roleForm.name.trim(),
        description: roleForm.description || null,
        color: roleForm.color || null,
      }, { headers });
      alert(`Role "${roleForm.name.trim()}" created${roleForm.client_id ? ' for the selected client' : ' at org level'}. Manage hierarchy under Role Hierarchy.`);
      resetRoleForm();
    } catch (err: any) {
      alert(err.message || 'Failed to create role');
    } finally {
      setSavingRole(false);
    }
  };

  const roleColors: Record<string, string> = { 
    admin: C.red, sub_admin: C.blue, city_manager: C.green, 
    warehouse_manager: '#F59E0B', hr: '#D946EF', mis: '#06B6D4' 
  };
  const roleLabels: Record<string, string> = {
    admin: 'Admin', sub_admin: 'Sub-Admin', city_manager: 'City Manager',
    warehouse_manager: 'Warehouse Manager', hr: 'HR', mis: 'MIS',
    client: 'Client'
  };

  const { sorted: sortedUsers, sort: usersSort, toggle: usersToggle } = useTableSort<AuthUser>(users, userVal, { key: 'name', dir: 'asc' });
  const { sorted: sortedClients, sort: clientsSort, toggle: clientsToggle } = useTableSort<any>(clients, clientVal, { key: 'name', dir: 'asc' });

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: C.white, margin: 0 }}>Settings</h1>
          <p style={{ color: C.gray, fontSize: 13, marginTop: 4 }}>System configuration, rules, and access control</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Theme — surfaced at the top so it's the first thing visible.
            (Same toggleTheme handler as the System Preferences card below;
            kept both for discoverability.) */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800 }}>Appearance</div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>Follow your OS, or pick Dark / Light. Remembered across sessions.</div>
          </div>
          <div style={{ display: 'inline-flex', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4 }}>
            {/* "System" removed — followed OS auto-switching and made the
                theme look "random" to admins. Stick to explicit choices. */}
            <button onClick={() => toggleTheme('dark')} style={{ padding: '8px 16px', borderRadius: 8, background: theme === 'dark' ? C.s4 : 'transparent', border: 'none', color: theme === 'dark' ? C.white : C.gray, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>🌙</span> Dark
            </button>
            <button onClick={() => toggleTheme('light')} style={{ padding: '8px 16px', borderRadius: 8, background: theme === 'light' ? C.s4 : 'transparent', border: 'none', color: theme === 'light' ? C.white : C.gray, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>☀️</span> Light
            </button>
          </div>
        </div>
        
        {/* Geofence Management */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Operational Environment</div>
              <div style={{ fontSize: 14, color: C.gray, marginBottom: 24 }}>Manage organization-wide rules, shift timings, and mobile app behavior.</div>
            </div>
            <button onClick={handleSaveSettings} disabled={saving} style={{ background: C.red, border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'all .15s', boxShadow: `0 4px 12px rgba(224,30,44,0.2)` }}>
              {saving ? 'Saving...' : 'Save Global Changes'}
            </button>
          </div>
          
          <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Global Radius</span>
              <span style={{ fontSize: 16, fontFamily: "'Syne', sans-serif", fontWeight: 800, color: C.red }}>{radius} m</span>
            </div>
            
            <input type="range" min="20" max="200" value={radius} onChange={e => setRadius(Number(e.target.value))} style={{ width: '100%', accentColor: C.red, cursor: 'pointer' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: C.gray, fontWeight: 600 }}><span>20 m</span><span>200 m</span></div>
          </div>

          {/* Field Tracking cadence picker — embedded sub-card.
              Sits inside Operational Environment because it's another
              "org-wide rule that drives mobile app behavior" — same
              semantic bucket as the geofence radius above. */}
          <FieldTrackingCadencePicker />
        </div>

        {/* Access Control & Permissions */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Access Control & Permissions</div>
              <div style={{ fontSize: 14, color: C.gray }}>Manage administrative staff and define granular system access.</div>
            </div>
            <a
              href="/dashboard/settings/roles"
              style={{ background: C.s3, color: C.white, border: `1px solid ${C.border}`, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >🏗️ Role Hierarchy</a>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
            <button onClick={() => setActiveTab('users')} style={{ background: activeTab === 'users' ? C.s4 : 'transparent', color: activeTab === 'users' ? C.white : C.gray, border: `1px solid ${activeTab === 'users' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>User Directory</button>
            <button onClick={() => setActiveTab('rules')} style={{ background: activeTab === 'rules' ? C.s4 : 'transparent', color: activeTab === 'rules' ? C.white : C.gray, border: `1px solid ${activeTab === 'rules' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>Operational Rules</button>
            <button onClick={() => setActiveTab('pref')} style={{ background: activeTab === 'pref' ? C.s4 : 'transparent', color: activeTab === 'pref' ? C.white : C.gray, border: `1px solid ${activeTab === 'pref' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>System Preferences</button>
            <button onClick={() => setActiveTab('clients')} style={{ background: activeTab === 'clients' ? C.s4 : 'transparent', color: activeTab === 'clients' ? C.white : C.gray, border: `1px solid ${activeTab === 'clients' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>Clients</button>
          </div>

          {activeTab === 'users' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: C.gray }}>Manage administrative accounts and their specific module permissions.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { resetRoleForm(); setShowRoleAdd(true); }} style={{ background: C.s4, border: `1px solid ${C.border}`, color: C.white, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Create Role</button>
                  <button onClick={() => { setForm({ name: '', email: '', role: 'sub_admin', password: '', mobile: '', employee_id: '', zone_id: '', city: '', client_id: '', permissions: ROLE_DEFAULTS['sub_admin'], assigned_cities: [] }); setShowAdd(true); }} style={{ background: C.red, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    + Add Administrator
                  </button>
                </div>
              </div>

              {showRoleAdd && (
                <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, color: C.white, marginBottom: 2 }}>Create Custom Role</div>
                      <div style={{ fontSize: 11, color: C.gray }}>New roles join the role hierarchy and can be reordered/parented under <a href="/dashboard/settings/roles" style={{ color: C.blue }}>Role Hierarchy</a>.</div>
                    </div>
                    <button onClick={resetRoleForm} style={{ background: 'transparent', border: 'none', color: C.gray, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Role Name *</label>
                      <input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="e.g. Regional Sales Lead" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '8px 12px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Client (optional)</label>
                      <select value={roleForm.client_id} onChange={e => setRoleForm({ ...roleForm, client_id: e.target.value })} style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '8px 12px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13, appearance: 'none' }}>
                        <option value="">— Org-level (visible to admin only)</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Description (optional)</label>
                      <input value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="What does this role do?" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '8px 12px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Color</label>
                      <input type="color" value={roleForm.color} onChange={e => setRoleForm({ ...roleForm, color: e.target.value })} style={{ width: 60, height: 36, background: C.s4, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={resetRoleForm} disabled={savingRole} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleCreateRole} disabled={savingRole} style={{ background: C.red, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: savingRole ? 'not-allowed' : 'pointer' }}>{savingRole ? 'Creating…' : 'Create Role'}</button>
                  </div>
                </div>
              )}

              {showAdd && (
                <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24, animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Full Name</label>
                      <input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} placeholder="e.g. Rahul Sharma" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Email Address</label>
                      <input value={form.email} onChange={e=>setForm({...form, email: e.target.value})} placeholder="rahul@kinematic.com" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Role</label>
                      <select value={form.role} onChange={e=>{
                        const r = e.target.value;
                        setForm({...form, role: r, permissions: ROLE_DEFAULTS[r] || []});
                      }} style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13, appearance: 'none' }}>
                        {Object.keys(roleLabels).map(k => <option key={k} value={k}>{roleLabels[k]}</option>)}
                      </select>
                    </div>
                    {form.role === 'client' && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Assign to Client</label>
                        <select value={form.client_id} onChange={e => {
                          const cid = e.target.value;
                          const client = clients.find(c => c.id === cid);
                          setForm({ ...form, client_id: cid, permissions: client?.modules || [] });
                        }} style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13, appearance: 'none' }}>
                          <option value="">Select Client</option>
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Employee ID</label>
                      <input value={form.employee_id} onChange={e=>setForm({...form, employee_id: e.target.value})} placeholder="e.g. ADM-001" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Mobile Number</label>
                      <input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} placeholder="10-digit mobile" maxLength={10} style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Login Password</label>
                      <input type="password" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} placeholder="Secure password" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                  </div>

                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.white, fontFamily: "'Syne', sans-serif" }}>Module Permissions (Pre-filled based on role)</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => setForm(p => ({ ...p, permissions: ALL_MODULES.map(m => m.id) }))} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Select all</button>
                        <button type="button" onClick={() => setForm(p => ({ ...p, permissions: [] }))} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Clear</button>
                      </div>
                    </div>
                    {MODULE_GROUPS.map(group => {
                      const groupModules = ALL_MODULES.filter(m => m.group === group);
                      const allChecked = groupModules.every(m => form.permissions.includes(m.id));
                      return (
                        <div key={group} style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: C.grayd, textTransform: 'uppercase', letterSpacing: '1px' }}>{MODULE_GROUP_LABELS[group]}</div>
                            <button type="button"
                              onClick={() => {
                                const ids = groupModules.map(m => m.id);
                                setForm(p => ({ ...p, permissions: allChecked
                                  ? p.permissions.filter(x => !ids.includes(x))
                                  : Array.from(new Set([...p.permissions, ...ids]))
                                }));
                              }}
                              style={{ background: 'transparent', border: 'none', color: C.gray, fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                              {allChecked ? 'unselect group' : 'select group'}
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            {groupModules.map(m => (
                              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.s4, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${form.permissions.includes(m.id) ? C.blue : C.border}`, transition: 'all 0.2s' }}>
                                <input type="checkbox" checked={form.permissions.includes(m.id)}
                                  onChange={e => {
                                    const next = e.target.checked ? [...form.permissions, m.id] : form.permissions.filter(p => p !== m.id);
                                    setForm(p => ({ ...p, permissions: next }));
                                  }}
                                  style={{ accentColor: C.blue }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: form.permissions.includes(m.id) ? C.white : C.gray }}>{m.l}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {form.role === 'city_manager' && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginBottom: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.white, fontFamily: "'Syne', sans-serif" }}>Assigned Cities (multi-select)</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={() => setForm(p => ({ ...p, assigned_cities: allCityNames }))} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Select all</button>
                          <button type="button" onClick={() => setForm(p => ({ ...p, assigned_cities: [] }))} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Clear</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>City Managers are scoped to the cities you select here. {form.assigned_cities.length} of {allCityNames.length} selected.</div>
                      {allCityNames.length === 0 ? (
                        <div style={{ background: C.s4, border: `1px dashed ${C.border}`, borderRadius: 8, padding: 16, textAlign: 'center', color: C.gray, fontSize: 12 }}>No cities configured. Add cities in System → Cities first.</div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                          {allCityNames.map(city => {
                            const checked = form.assigned_cities.includes(city);
                            return (
                              <label key={city} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.s4, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${checked ? C.blue : C.border}`, transition: 'all 0.2s' }}>
                                <input type="checkbox" checked={checked} onChange={() => {
                                  const next = checked ? form.assigned_cities.filter(c => c !== city) : [...form.assigned_cities, city];
                                  setForm(p => ({ ...p, assigned_cities: next }));
                                }} style={{ accentColor: C.blue }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: checked ? C.white : C.gray }}>{city}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button onClick={()=>{ setShowAdd(false); setEditMode(null); }} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSaveUser} disabled={saving} style={{ background: C.red, border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                      {saving ? 'Saving...' : editMode ? 'Update Administrator' : 'Save Administrator'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', background: C.s2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1.2fr 100px', padding: '16px 24px', background: C.s3, borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  <div><SortLabel label="Name & Employee ID" sortKey="name" sort={usersSort} onToggle={usersToggle} /></div>
                  <div><SortLabel label="Email & Mobile" sortKey="email" sort={usersSort} onToggle={usersToggle} /></div>
                  <div><SortLabel label="Role & Permissions" sortKey="role" sort={usersSort} onToggle={usersToggle} /></div>
                  <div style={{ textAlign: 'right' }}>Actions</div>
                </div>
                {loading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: C.gray }}>Loading administrators...</div>
                ) : sortedUsers.map((u, i) => (
                  <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1.2fr 100px', padding: '18px 24px', borderBottom: i < sortedUsers.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', opacity: u.is_active ? 1 : 0.5 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{u.employee_id || 'ID: ' + u.id.slice(0, 8)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: u.is_active ? C.white : C.gray }}>{u.email}</div>
                      {u.mobile && <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{u.mobile}</div>}
                    </div>
                    <div>
                      <div style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: `${roleColors[u.role] || C.gray}15`, color: roleColors[u.role] || C.gray, border: `1px solid ${roleColors[u.role] || C.gray}33`, textTransform: 'capitalize', marginBottom: 4 }}>
                        {/* Hierarchy designation via the shared helper —
                            picks org_role.name (or the flat org_role_name)
                            first, falls back to "Super Admin" / "Admin"
                            only for genuinely platform-level system roles,
                            else a dash. Never substitutes "Team Member"
                            for a user whose actual role is e.g. Consumer
                            Champion Manager. */}
                        {getDesignationLabel(u as any)}
                      </div>
                      <div style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>
                        {u.permissions?.length || 0} modules · {u.assigned_cities?.length ? `${u.assigned_cities.length} cities` : u.client_id ? `Client: ${clients.find(c => c.id === u.client_id)?.name || 'Unknown'}` : 'Global'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                      <button onClick={() => handleEditClick(u)} style={{ background: 'transparent', border: 'none', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button onClick={() => handleUpdateUser(u)} style={{ background: 'transparent', border: 'none', color: u.is_active ? C.red : C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {u.is_active ? 'Revoke' : 'Unlock'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'pref' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
              {/* Interface Appearance */}
              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Interface Appearance</div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>Pick Dark or Light. The choice persists across refreshes.</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* System mode removed — admins reported "random theme
                      changes" because the OS auto-switched between
                      light/dark. Two explicit choices only. */}
                  <button onClick={() => toggleTheme('dark')} style={{ flex: 1, padding: '14px', borderRadius: 10, background: theme === 'dark' ? C.s4 : 'transparent', border: `1px solid ${theme === 'dark' ? C.blue : C.border}`, cursor: 'pointer', transition: 'all .2s' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#0D1117', border: `2px solid ${theme === 'dark' ? C.blue : '#30363d'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🌙</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: theme === 'dark' ? C.white : C.gray }}>Dark Theme</span>
                    </div>
                  </button>
                  <button onClick={() => toggleTheme('light')} style={{ flex: 1, padding: '14px', borderRadius: 10, background: theme === 'light' ? C.s4 : 'transparent', border: `1px solid ${theme === 'light' ? C.blue : C.border}`, cursor: 'pointer', transition: 'all .2s' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#ffffff', border: `2px solid ${theme === 'light' ? C.blue : '#e1e4e8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>☀️</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: theme === 'light' ? C.white : C.gray }}>Light Theme</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Organization Profile */}
              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Organization Details</div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>Basic information about your Kinematic enterprise.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', marginBottom: 8 }}>Entity Name</label>
                    <input value={opsRules.orgName} onChange={e=>setOpsRules({...opsRules, orgName: e.target.value})} style={{ width: '100%', background: C.s2, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, fontSize: 13, outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', marginBottom: 8 }}>Primary Support Email</label>
                    <input value={opsRules.orgSupport} onChange={e=>setOpsRules({...opsRules, orgSupport: e.target.value})} style={{ width: '100%', background: C.s2, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, fontSize: 13, outline: 'none' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rules' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
              {/* Attendance & Shift Rules */}
              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Attendance & Operational Rules</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', marginBottom: 8 }}>Shift Start</label>
                      <input type="time" value={opsRules.shiftStart} onChange={e=>setOpsRules({...opsRules, shiftStart: e.target.value})} style={{ width: '100%', background: C.s2, border: `1px solid ${C.border}`, padding: '10px 12px', borderRadius: 8, color: C.white, fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', marginBottom: 8 }}>Shift End</label>
                      <input type="time" value={opsRules.shiftEnd} onChange={e=>setOpsRules({...opsRules, shiftEnd: e.target.value})} style={{ width: '100%', background: C.s2, border: `1px solid ${C.border}`, padding: '10px 12px', borderRadius: 8, color: C.white, fontSize: 13 }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase' }}>Late Grace Period</label>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.blue }}>{opsRules.gracePeriod} min</span>
                    </div>
                    <input type="range" min="0" max="60" step="5" value={opsRules.gracePeriod} onChange={e=>setOpsRules({...opsRules, gracePeriod: Number(e.target.value)})} style={{ width: '100%', accentColor: C.blue }} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase' }}>Auto Checkout Threshold</label>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.blue }}>{opsRules.autoCheckout} hrs</span>
                    </div>
                    <input type="range" min="4" max="24" step="1" value={opsRules.autoCheckout} onChange={e=>setOpsRules({...opsRules, autoCheckout: Number(e.target.value)})} style={{ width: '100%', accentColor: C.blue }} />
                  </div>
                </div>
              </div>

              {/* Mobile App Configuration */}
              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Mobile App Parameters</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', marginBottom: 8 }}>Min Required App Version</label>
                    <input value={opsRules.minAppVersion} onChange={e=>setOpsRules({...opsRules, minAppVersion: e.target.value})} placeholder="e.g. 1.2.0" style={{ width: '100%', background: C.s2, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, fontSize: 13, outline: 'none' }} />
                    <div style={{ fontSize: 10, color: C.grayd, marginTop: 6 }}>Users with versions lower than this will be prompted to update.</div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase' }}>GPS Accuracy Requirement</label>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.green }}>{opsRules.gpsAccuracy}m</span>
                    </div>
                    <input type="range" min="10" max="200" step="10" value={opsRules.gpsAccuracy} onChange={e=>setOpsRules({...opsRules, gpsAccuracy: Number(e.target.value)})} style={{ width: '100%', accentColor: C.green }} />
                  </div>
                </div>
              </div>

              {/* Tracking Sensitivity */}
              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Tracking Precision</div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>Set the deviation radius for field activity validation.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase' }}>Visit Geofence Radius</span>
                    <span style={{ fontSize: 16, fontFamily: "'Syne', sans-serif", fontWeight: 800, color: C.red }}>{radius} m</span>
                  </div>
                  <input type="range" min="20" max="200" value={radius} onChange={e => setRadius(Number(e.target.value))} style={{ width: '100%', accentColor: C.red, cursor: 'pointer' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: C.grayd, fontWeight: 600 }}><span>20 m</span><span>200 m</span></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'clients' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.gray }}>Manage client tenants. Each client can have its own administrator account and module access.</div>
                <button onClick={() => { resetClientForm(); setShowClientAdd(true); }} style={{ background: C.red, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  + Add Client
                </button>
              </div>

              {showClientAdd && (
                <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 16 }}>{editClientId ? 'Edit Client' : 'New Client'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Client Name *</label>
                      <input value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} placeholder="e.g. Acme Corp" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Contact Person</label>
                      <input value={clientForm.contact_person} onChange={e => setClientForm({ ...clientForm, contact_person: e.target.value })} placeholder="e.g. Jane Doe" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Admin Email</label>
                      <input value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} placeholder="admin@acme.com" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                      <div style={{ fontSize: 10, color: C.grayd, marginTop: 4 }}>Used to create a client-administrator login.</div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Phone</label>
                      <input value={clientForm.phone} onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} placeholder="+91 98xxxxxxxx" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>{editClientId ? 'New Password (optional)' : 'Admin Password'}</label>
                      <input type="password" value={clientForm.password} onChange={e => setClientForm({ ...clientForm, password: e.target.value })} placeholder={editClientId ? 'Leave blank to keep' : 'Required if Admin Email set'} style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>Module Access</label>
                    {MODULE_GROUPS.map((g) => {
                      const items = ALL_MODULES.filter(m => m.group === g);
                      if (items.length === 0) return null;
                      return (
                        <div key={g} style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: C.grayd, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{MODULE_GROUP_LABELS[g]}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                            {items.map(m => {
                              const on = clientForm.modules.includes(m.id);
                              return (
                                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: on ? C.red : C.s4, color: on ? '#fff' : C.white, borderRadius: 6, fontSize: 12, cursor: 'pointer', border: `1px solid ${on ? C.red : C.border}` }}>
                                  <input type="checkbox" checked={on} onChange={() => toggleClientModule(m.id)} />
                                  {m.l}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                    <button onClick={resetClientForm} disabled={saving} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.white, padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSaveClient} disabled={saving} style={{ background: C.red, border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13 }}>{saving ? 'Saving…' : editClientId ? 'Save Changes' : 'Create Client'}</button>
                  </div>
                </div>
              )}

              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                {clients.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: C.gray, fontSize: 13 }}>No clients yet. Click <strong style={{ color: C.white }}>+ Add Client</strong> to create one.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: C.s4, borderBottom: `1px solid ${C.border}` }}>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}><SortLabel label="Name" sortKey="name" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}><SortLabel label="Contact" sortKey="contact" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}><SortLabel label="Email" sortKey="email" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}><SortLabel label="Modules" sortKey="modules" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}><SortLabel label="Status" sortKey="status" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={{ padding: '10px 16px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedClients.map((c: any) => (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '12px 16px', fontSize: 13, color: C.white, fontWeight: 600 }}>{c.name}</td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: C.gray }}>{c.contact_person || '—'}</td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: C.gray }}>{c.email || '—'}</td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: C.gray }}>{(c.modules || []).length} modules</td>
                          <td style={{ padding: '12px 16px', fontSize: 12 }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: c.is_active === false ? C.redB : 'rgba(0,217,126,0.15)', color: c.is_active === false ? C.red : C.green, fontWeight: 700, fontSize: 11 }}>
                              {c.is_active === false ? 'Inactive' : 'Active'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <button onClick={() => handleEditClient(c)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.white, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', marginRight: 6 }}>Edit</button>
                            <button onClick={() => handleDeleteClient(c.id)} style={{ background: 'transparent', border: `1px solid ${C.redB}`, color: C.red, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
