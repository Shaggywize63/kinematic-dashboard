'use client';
import { useState, useEffect, useCallback } from 'react';
import { Bot, Building2, MessageCircle, Moon, Network, Plus, Sun, Users, X } from 'lucide-react';
import api from '../../../lib/api';
import CitySelect from '../../../components/CitySelect';
import FieldTrackingCadencePicker from '../../../components/FieldTrackingCadencePicker';
import { AuthUser } from '../../../types';
import { getDesignationLabel, getStoredUser } from '../../../lib/auth';
import { ALL_MODULES, MODULE_GROUPS, MODULE_GROUP_LABELS } from '../../../lib/modules';
import { useTableSort, SortLabel } from '../../../lib/tableSort';
import { usePageTitle } from '../../../lib/pageTitle';
import { Badge, Button, Card, EmptyState, Eyebrow, Field, Input, PageHeader, Segmented, Select, T, useIsCompact } from '../../../components/ui';

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

/* ── Shared presentation bits ── */
const th: React.CSSProperties = { padding: '12px 14px', textAlign: 'left', fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };
/** Raised inner block (inline forms, sub-cards inside a Card). */
const block: React.CSSProperties = { background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: 20 };
/** Text-link style button for "select group" style micro-actions. */
const linkBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: T.dim, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 };

/** Checkbox chip — outlined pill that fills with the info wash when on. */
function CheckChip({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 30, padding: '0 10px', borderRadius: 999, cursor: 'pointer', background: on ? T.infoWash : T.card, border: `1px solid ${on ? T.info : T.border}`, fontSize: 12.5, fontWeight: 500, color: on ? T.text : T.dim, transition: 'background .12s ease, border-color .12s ease' }}>
      <input type="checkbox" checked={on} onChange={onChange} style={{ width: 14, height: 14, margin: 0 }} />
      {label}
    </label>
  );
}

/** Range control with a label + mono readout. */
function RangeField({ label, value, unit, min, max, step, onChange, accent }: { label: string; value: number; unit: string; min: number; max: number; step?: number; onChange: (v: number) => void; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>{label}</span>
        <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: accent || T.red, cursor: 'pointer', margin: 0 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 10.5, color: T.mute }}><span>{min} {unit}</span><span>{max} {unit}</span></div>
    </div>
  );
}

export default function SettingsPage() {
  usePageTitle('Settings');
  const narrow = useIsCompact(900);
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

  const roleTones: Record<string, 'red' | 'info' | 'ok' | 'warn' | 'neutral'> = {
    admin: 'red', sub_admin: 'info', city_manager: 'ok',
    warehouse_manager: 'warn', hr: 'neutral', mis: 'neutral', client: 'info',
  };
  const roleLabels: Record<string, string> = {
    admin: 'Admin', sub_admin: 'Sub-Admin', city_manager: 'City Manager',
    warehouse_manager: 'Warehouse Manager', hr: 'HR', mis: 'MIS',
    client: 'Client'
  };

  const { sorted: sortedUsers, sort: usersSort, toggle: usersToggle } = useTableSort<AuthUser>(users, userVal, { key: 'name', dir: 'asc' });
  const { sorted: sortedClients, sort: clientsSort, toggle: clientsToggle } = useTableSort<any>(clients, clientVal, { key: 'name', dir: 'asc' });

  // Platform-only surfaces (AI Assistant entitlement) are super-admin gated.
  const isSuperAdmin = ((getStoredUser()?.role || '') as string).toLowerCase() === 'super_admin';

  const themeSwitch = (
    <Segmented
      value={theme}
      onChange={toggleTheme}
      options={[
        { value: 'dark', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Moon size={14} strokeWidth={1.8} /> Dark</span> },
        { value: 'light', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sun size={14} strokeWidth={1.8} /> Light</span> },
      ]}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      <PageHeader
        title="Settings"
        description="Organisation rules, access control and preferences for this workspace."
        compact={narrow}
      />

      {error && <div role="alert" style={{ background: T.redWash, border: `1px solid ${T.red}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.red }}>{error}</div>}

      {/* Theme — surfaced at the top so it's the first thing visible.
          (Same toggleTheme handler as the System Preferences card below;
          kept both for discoverability.) */}
      <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow>Appearance</Eyebrow>
          <div style={{ fontSize: 13, color: T.dim }}>Pick Dark or Light. Remembered across sessions on this browser.</div>
        </div>
        {/* "System" removed — followed OS auto-switching and made the
            theme look "random" to admins. Stick to explicit choices. */}
        {themeSwitch}
      </Card>

      {/* Geofence Management */}
      <Card padding={narrow ? 16 : 24}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Eyebrow>Operational environment</Eyebrow>
            <div style={{ fontSize: 13, color: T.dim }}>Organisation-wide rules, shift timings and mobile app behaviour.</div>
          </div>
          <Button variant="primary" onClick={handleSaveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save global changes'}</Button>
        </div>

        <div style={block}>
          <RangeField label="Global geofence radius" value={radius} unit="m" min={20} max={200} onChange={setRadius} />
        </div>

        {/* Field Tracking cadence picker — embedded sub-card.
            Sits inside Operational Environment because it's another
            "org-wide rule that drives mobile app behavior" — same
            semantic bucket as the geofence radius above. */}
        <FieldTrackingCadencePicker />
      </Card>

      {/* Access Control & Permissions */}
      <Card padding={narrow ? 16 : 24}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Eyebrow>Access control & permissions</Eyebrow>
            <div style={{ fontSize: 13, color: T.dim }}>Administrative staff, module permissions, client tenants and system rules.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isSuperAdmin && (
              <Button href="/dashboard/settings/ai-assistant" size="sm" icon={<Bot size={15} strokeWidth={1.6} />}>AI assistant access</Button>
            )}
            <Button href="/dashboard/settings/whatsapp" size="sm" icon={<MessageCircle size={15} strokeWidth={1.6} />}>WhatsApp</Button>
            <Button href="/dashboard/settings/roles" size="sm" icon={<Network size={15} strokeWidth={1.6} />}>Role hierarchy</Button>
          </div>
        </div>

        <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
          <Segmented
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'users', label: 'User directory' },
              { value: 'rules', label: 'Operational rules' },
              { value: 'pref', label: 'System preferences' },
              { value: 'clients', label: 'Clients' },
            ]}
          />
        </div>

        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: T.dim }}>Administrative accounts and their module permissions.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={() => { resetRoleForm(); setShowRoleAdd(true); }} icon={<Plus size={14} strokeWidth={2} />}>Create role</Button>
                <Button size="sm" onClick={() => { setForm({ name: '', email: '', role: 'sub_admin', password: '', mobile: '', employee_id: '', zone_id: '', city: '', client_id: '', permissions: ROLE_DEFAULTS['sub_admin'], assigned_cities: [] }); setShowAdd(true); }} icon={<Plus size={14} strokeWidth={2} />}>
                  Add administrator
                </Button>
              </div>
            </div>

            {showRoleAdd && (
              <div style={{ ...block, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Eyebrow>Create custom role</Eyebrow>
                    <div style={{ fontSize: 12.5, color: T.dim }}>New roles join the role hierarchy and can be reordered or re-parented under <a href="/dashboard/settings/roles" className="km-entity-link" style={{ fontWeight: 500 }}>Role hierarchy</a>.</div>
                  </div>
                  <button type="button" onClick={resetRoleForm} aria-label="Close" className="km-iconbtn" style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: '1px solid transparent', color: T.dim, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={16} strokeWidth={1.6} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '14px 16px' }}>
                  <Field label="Role name" required>
                    <Input value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="e.g. Regional Sales Lead" />
                  </Field>
                  <Field label="Client" hint="Leave empty for an org-level role (visible to admin only).">
                    <Select value={roleForm.client_id} onChange={e => setRoleForm({ ...roleForm, client_id: e.target.value })}>
                      <option value="">— Org-level</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Description" style={{ gridColumn: '1 / -1' }}>
                    <Input value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="What does this role do?" />
                  </Field>
                  <Field label="Colour">
                    <input type="color" value={roleForm.color} onChange={e => setRoleForm({ ...roleForm, color: e.target.value })} aria-label="Role colour" style={{ width: 56, height: 36, background: T.field, border: `1px solid ${T.border}`, borderRadius: 6, cursor: 'pointer', padding: 3 }} />
                  </Field>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button onClick={resetRoleForm} disabled={savingRole}>Cancel</Button>
                  <Button variant="primary" onClick={handleCreateRole} disabled={savingRole}>{savingRole ? 'Creating…' : 'Create role'}</Button>
                </div>
              </div>
            )}

            {showAdd && (
              <div style={{ ...block, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Eyebrow>{editMode ? 'Edit administrator' : 'New administrator'}</Eyebrow>
                  <div style={{ fontSize: 12.5, color: T.dim }}>Name and mobile are required. Module permissions are pre-filled from the role.</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '14px 16px' }}>
                  <Field label="Full name" required>
                    <Input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} placeholder="e.g. Rahul Sharma" />
                  </Field>
                  <Field label="Email address">
                    <Input value={form.email} onChange={e=>setForm({...form, email: e.target.value})} placeholder="rahul@kinematic.com" />
                  </Field>
                  <Field label="Role">
                    <Select value={form.role} onChange={e=>{
                      const r = e.target.value;
                      setForm({...form, role: r, permissions: ROLE_DEFAULTS[r] || []});
                    }}>
                      {Object.keys(roleLabels).map(k => <option key={k} value={k}>{roleLabels[k]}</option>)}
                    </Select>
                  </Field>
                  {form.role === 'client' && (
                    <Field label="Assign to client">
                      <Select value={form.client_id} onChange={e => {
                        const cid = e.target.value;
                        const client = clients.find(c => c.id === cid);
                        setForm({ ...form, client_id: cid, permissions: client?.modules || [] });
                      }}>
                        <option value="">Select client</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Field>
                  )}
                  <Field label="Employee ID">
                    <Input value={form.employee_id} onChange={e=>setForm({...form, employee_id: e.target.value})} placeholder="e.g. ADM-001" />
                  </Field>
                  <Field label="Mobile number" required>
                    <Input value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} placeholder="10-digit mobile" maxLength={10} />
                  </Field>
                  <Field label="Login password">
                    <Input type="password" value={form.password} onChange={e=>setForm({...form, password: e.target.value})} placeholder="Secure password" />
                  </Field>
                </div>

                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Eyebrow>Module permissions</Eyebrow>
                      <div style={{ fontSize: 12.5, color: T.dim }}>Pre-filled from the role — adjust per person.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setForm(p => ({ ...p, permissions: ALL_MODULES.map(m => m.id) }))}>Select all</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setForm(p => ({ ...p, permissions: [] }))}>Clear</Button>
                    </div>
                  </div>
                  {MODULE_GROUPS.map(group => {
                    const groupModules = ALL_MODULES.filter(m => m.group === group);
                    const allChecked = groupModules.every(m => form.permissions.includes(m.id));
                    return (
                      <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <Eyebrow>{MODULE_GROUP_LABELS[group]}</Eyebrow>
                          <button type="button"
                            onClick={() => {
                              const ids = groupModules.map(m => m.id);
                              setForm(p => ({ ...p, permissions: allChecked
                                ? p.permissions.filter(x => !ids.includes(x))
                                : Array.from(new Set([...p.permissions, ...ids]))
                              }));
                            }}
                            style={linkBtn}>
                            {allChecked ? 'Unselect group' : 'Select group'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {groupModules.map(m => (
                            <CheckChip key={m.id} on={form.permissions.includes(m.id)} label={m.l}
                              onChange={() => {
                                const next = form.permissions.includes(m.id) ? form.permissions.filter(p => p !== m.id) : [...form.permissions, m.id];
                                setForm(p => ({ ...p, permissions: next }));
                              }} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {form.role === 'city_manager' && (
                  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Eyebrow>Assigned cities</Eyebrow>
                        <div style={{ fontSize: 12.5, color: T.dim }}>City managers are scoped to the cities you select here. <span style={{ fontFamily: T.mono }}>{form.assigned_cities.length}/{allCityNames.length}</span> selected.</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setForm(p => ({ ...p, assigned_cities: allCityNames }))}>Select all</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setForm(p => ({ ...p, assigned_cities: [] }))}>Clear</Button>
                      </div>
                    </div>
                    {allCityNames.length === 0 ? (
                      <div style={{ background: T.card, border: `1px dashed ${T.borderStrong}`, borderRadius: 8, padding: 16, textAlign: 'center', color: T.dim, fontSize: 12.5 }}>No cities configured. Add cities in System → Cities first.</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {allCityNames.map(city => {
                          const checked = form.assigned_cities.includes(city);
                          return (
                            <CheckChip key={city} on={checked} label={city} onChange={() => {
                              const next = checked ? form.assigned_cities.filter(c => c !== city) : [...form.assigned_cities, city];
                              setForm(p => ({ ...p, assigned_cities: next }));
                            }} />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                  <Button onClick={()=>{ setShowAdd(false); setEditMode(null); }}>Cancel</Button>
                  <Button variant="primary" onClick={handleSaveUser} disabled={saving}>
                    {saving ? 'Saving…' : editMode ? 'Update administrator' : 'Save administrator'}
                  </Button>
                </div>
              </div>
            )}

            <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden', background: T.card }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={th}><SortLabel label="Name" sortKey="name" sort={usersSort} onToggle={usersToggle} /></th>
                      <th style={th}><SortLabel label="Contact" sortKey="email" sort={usersSort} onToggle={usersToggle} /></th>
                      <th style={th}><SortLabel label="Role & scope" sortKey="role" sort={usersSort} onToggle={usersToggle} /></th>
                      <th style={{ ...th, textAlign: 'right' }} aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} style={{ ...td, borderBottom: 0, padding: 32, textAlign: 'center', color: T.mute }}>Loading administrators…</td></tr>
                    ) : sortedUsers.length === 0 ? (
                      <tr><td colSpan={4} style={{ ...td, borderBottom: 0, padding: 0 }}><EmptyState icon={<Users size={20} strokeWidth={1.6} />} title="No administrators yet" description="Add an administrator to give someone access to this workspace." /></td></tr>
                    ) : sortedUsers.map((u, i) => (
                      <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.55 }}>
                        <td style={{ ...td, borderBottom: i < sortedUsers.length - 1 ? td.borderBottom : 0 }}>
                          <div style={{ fontWeight: 500 }}>{u.name}</div>
                          <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute, marginTop: 2 }}>{u.employee_id || u.id.slice(0, 8)}</div>
                        </td>
                        <td style={{ ...td, borderBottom: i < sortedUsers.length - 1 ? td.borderBottom : 0 }}>
                          <div style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{u.email}</div>
                          {u.mobile && <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute, marginTop: 2 }}>{u.mobile}</div>}
                        </td>
                        <td style={{ ...td, borderBottom: i < sortedUsers.length - 1 ? td.borderBottom : 0 }}>
                          {/* Hierarchy designation via the shared helper —
                              picks org_role.name (or the flat org_role_name)
                              first, falls back to "Super Admin" / "Admin"
                              only for genuinely platform-level system roles,
                              else a dash. Never substitutes "Team Member"
                              for a user whose actual role is e.g. Consumer
                              Champion Manager. */}
                          <Badge tone={roleTones[u.role] || 'neutral'}>{getDesignationLabel(u as any)}</Badge>
                          <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
                            {u.permissions?.length || 0} modules · {u.assigned_cities?.length ? `${u.assigned_cities.length} cities` : u.client_id ? `Client: ${clients.find(c => c.id === u.client_id)?.name || 'Unknown'}` : 'Global'}
                          </div>
                        </td>
                        <td style={{ ...td, borderBottom: i < sortedUsers.length - 1 ? td.borderBottom : 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Button size="sm" variant="ghost" onClick={() => handleEditClick(u)}>Edit</Button>
                          <Button size="sm" variant={u.is_active ? 'danger' : 'secondary'} onClick={() => handleUpdateUser(u)} style={{ marginLeft: 4 }}>
                            {u.is_active ? 'Revoke' : 'Unlock'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pref' && (
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
            {/* Interface Appearance */}
            <div style={{ ...block, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Eyebrow>Interface appearance</Eyebrow>
                <div style={{ fontSize: 13, color: T.dim }}>Pick Dark or Light. The choice persists across refreshes.</div>
              </div>
              {/* System mode removed — admins reported "random theme
                  changes" because the OS auto-switched between
                  light/dark. Two explicit choices only. */}
              <div>{themeSwitch}</div>
            </div>

            {/* Organization Profile */}
            <div style={{ ...block, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Eyebrow>Organisation details</Eyebrow>
                <div style={{ fontSize: 13, color: T.dim }}>Basic information about your Kinematic enterprise.</div>
              </div>
              <Field label="Entity name">
                <Input value={opsRules.orgName} onChange={e=>setOpsRules({...opsRules, orgName: e.target.value})} />
              </Field>
              <Field label="Primary support email">
                <Input value={opsRules.orgSupport} onChange={e=>setOpsRules({...opsRules, orgSupport: e.target.value})} />
              </Field>
            </div>
          </div>
        )}

        {activeTab === 'rules' && (
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {/* Attendance & Shift Rules */}
            <div style={{ ...block, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Eyebrow>Attendance & operational rules</Eyebrow>
                <div style={{ fontSize: 13, color: T.dim }}>Shift window and lateness thresholds.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Shift start">
                  <Input type="time" value={opsRules.shiftStart} onChange={e=>setOpsRules({...opsRules, shiftStart: e.target.value})} />
                </Field>
                <Field label="Shift end">
                  <Input type="time" value={opsRules.shiftEnd} onChange={e=>setOpsRules({...opsRules, shiftEnd: e.target.value})} />
                </Field>
              </div>
              <RangeField label="Late grace period" value={opsRules.gracePeriod} unit="min" min={0} max={60} step={5} onChange={(v) => setOpsRules({...opsRules, gracePeriod: v})} accent={T.info} />
              <RangeField label="Auto checkout threshold" value={opsRules.autoCheckout} unit="hrs" min={4} max={24} step={1} onChange={(v) => setOpsRules({...opsRules, autoCheckout: v})} accent={T.info} />
            </div>

            {/* Mobile App Configuration */}
            <div style={{ ...block, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Eyebrow>Mobile app parameters</Eyebrow>
                <div style={{ fontSize: 13, color: T.dim }}>Version gating and GPS quality for field devices.</div>
              </div>
              <Field label="Minimum required app version" hint="Users on older versions are prompted to update.">
                <Input value={opsRules.minAppVersion} onChange={e=>setOpsRules({...opsRules, minAppVersion: e.target.value})} placeholder="e.g. 1.2.0" style={{ fontFamily: T.mono }} />
              </Field>
              <RangeField label="GPS accuracy requirement" value={opsRules.gpsAccuracy} unit="m" min={10} max={200} step={10} onChange={(v) => setOpsRules({...opsRules, gpsAccuracy: v})} accent={T.ok} />
            </div>

            {/* Tracking Sensitivity */}
            <div style={{ ...block, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Eyebrow>Tracking precision</Eyebrow>
                <div style={{ fontSize: 13, color: T.dim }}>Deviation radius for field activity validation.</div>
              </div>
              <RangeField label="Visit geofence radius" value={radius} unit="m" min={20} max={200} onChange={setRadius} />
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: T.dim }}>Client tenants. Each client can have its own administrator account and module access.</div>
              <Button size="sm" onClick={() => { resetClientForm(); setShowClientAdd(true); }} icon={<Plus size={14} strokeWidth={2} />}>Add client</Button>
            </div>

            {showClientAdd && (
              <div style={{ ...block, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Eyebrow>{editClientId ? 'Edit client' : 'New client'}</Eyebrow>
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '14px 16px' }}>
                  <Field label="Client name" required>
                    <Input value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} placeholder="e.g. Acme Corp" />
                  </Field>
                  <Field label="Contact person">
                    <Input value={clientForm.contact_person} onChange={e => setClientForm({ ...clientForm, contact_person: e.target.value })} placeholder="e.g. Jane Doe" />
                  </Field>
                  <Field label="Admin email" hint="Used to create a client-administrator login.">
                    <Input value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} placeholder="admin@acme.com" />
                  </Field>
                  <Field label="Phone">
                    <Input value={clientForm.phone} onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} placeholder="+91 98xxxxxxxx" />
                  </Field>
                  <Field label={editClientId ? 'New password (optional)' : 'Admin password'}>
                    <Input type="password" value={clientForm.password} onChange={e => setClientForm({ ...clientForm, password: e.target.value })} placeholder={editClientId ? 'Leave blank to keep' : 'Required if admin email set'} />
                  </Field>
                </div>

                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Eyebrow>Module access</Eyebrow>
                    <div style={{ fontSize: 12.5, color: T.dim }}>What this client is entitled to. <span style={{ fontFamily: T.mono }}>{clientForm.modules.length}</span> selected.</div>
                  </div>
                  {MODULE_GROUPS.map((g) => {
                    const items = ALL_MODULES.filter(m => m.group === g);
                    if (items.length === 0) return null;
                    return (
                      <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Eyebrow>{MODULE_GROUP_LABELS[g]}</Eyebrow>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {items.map(m => (
                            <CheckChip key={m.id} on={clientForm.modules.includes(m.id)} label={m.l} onChange={() => toggleClientModule(m.id)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                  <Button onClick={resetClientForm} disabled={saving}>Cancel</Button>
                  <Button variant="primary" onClick={handleSaveClient} disabled={saving}>{saving ? 'Saving…' : editClientId ? 'Save changes' : 'Create client'}</Button>
                </div>
              </div>
            )}

            <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden', background: T.card }}>
              {clients.length === 0 ? (
                <EmptyState icon={<Building2 size={20} strokeWidth={1.6} />} title="No clients yet" description="Add a client tenant to give it an administrator and module access." action={<Button size="sm" onClick={() => { resetClientForm(); setShowClientAdd(true); }} icon={<Plus size={14} strokeWidth={2} />}>Add client</Button>} />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th style={th}><SortLabel label="Name" sortKey="name" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={th}><SortLabel label="Contact" sortKey="contact" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={th}><SortLabel label="Email" sortKey="email" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={{ ...th, textAlign: 'right' }}><SortLabel label="Modules" sortKey="modules" sort={clientsSort} onToggle={clientsToggle} align="right" /></th>
                        <th style={th}><SortLabel label="Status" sortKey="status" sort={clientsSort} onToggle={clientsToggle} /></th>
                        <th style={{ ...th, textAlign: 'right' }} aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedClients.map((c: any, i: number) => {
                        const last = i === sortedClients.length - 1;
                        return (
                          <tr key={c.id}>
                            <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, fontWeight: 500 }}>{c.name}</td>
                            <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, color: T.dim }}>{c.contact_person || '—'}</td>
                            <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, color: T.dim }}>{c.email || '—'}</td>
                            <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, textAlign: 'right', fontFamily: T.mono, fontSize: 12.5, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>{(c.modules || []).length}</td>
                            <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom }}>
                              <Badge tone={c.is_active === false ? 'neutral' : 'ok'} dot={c.is_active !== false}>{c.is_active === false ? 'Inactive' : 'Active'}</Badge>
                            </td>
                            <td style={{ ...td, borderBottom: last ? 0 : td.borderBottom, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <Button size="sm" variant="ghost" onClick={() => handleEditClient(c)}>Edit</Button>
                              <Button size="sm" variant="danger" onClick={() => handleDeleteClient(c.id)} style={{ marginLeft: 4 }}>Delete</Button>
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
        )}
      </Card>
    </div>
  );
}
