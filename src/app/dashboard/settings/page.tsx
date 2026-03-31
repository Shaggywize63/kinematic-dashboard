'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import CitySelect from '@/components/CitySelect';
import { AuthUser } from '@/types';

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
  admin: ['analytics', 'attendance', 'route_plan', 'work_activities', 'manpower', 'visit_logs', 'inventory', 'grievances', 'form_builder', 'admin', 'broadcast'],
  sub_admin: ['analytics', 'attendance', 'route_plan', 'work_activities', 'manpower', 'inventory', 'form_builder', 'broadcast'],
  city_manager: ['analytics', 'attendance', 'route_plan'],
  warehouse_manager: ['inventory'],
  hr: ['analytics', 'attendance', 'manpower'],
  mis: ['analytics', 'manpower', 'form_builder'],
  client: [] // Clients get permissions from their client profile
};

export default function SettingsPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState<'users'|'rules'|'pref'>('users');
  const [theme, setTheme] = useState<'dark'|'light'>('dark');
  const [radius, setRadius] = useState(100);
  const [error, setError] = useState('');

  // NEW: System Settings Hooks
  const [opsRules, setOpsRules] = useState({
    shiftStart: '09:00',
    shiftEnd: '18:00',
    gracePeriod: 15,
    autoCheckout: 12,
    minAppVersion: '1.2.0',
    gpsAccuracy: 50,
    orgName: 'Horizonn Tech Studio',
    orgSupport: 'support@kinematic.com'
  });

  const [form, setForm] = useState({
    name: '', email: '', role: 'sub_admin', password: '', 
    mobile: '', employee_id: '', zone_id: '', city: '',
    client_id: '',
    permissions: ROLE_DEFAULTS['sub_admin'],
    assigned_cities: [] as string[]
  });

  // Sync Theme Initial State
  useEffect(() => {
    const saved = localStorage.getItem('kinematic-theme') as 'dark'|'light' || 'dark';
    setTheme(saved);
  }, []);

  const toggleTheme = (t: 'dark'|'light') => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('kinematic-theme', t);
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
        const r = (u.role || '').toLowerCase().trim();
        return ['admin', 'sub_admin', 'city_manager', 'hr', 'mis', 'warehouse_manager', 'client', 'super_admin', 'sub-admin'].includes(r);
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

  const handleSaveSettings = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      alert('Settings updated successfully!');
    }, 600);
  };

  const handleAddUser = async () => {
    if(!form.name || !form.email) return;
    setSaving(true);
    try {
      await api.post('/api/v1/users', { ...form, is_active: true });
      setShowAdd(false);
      setForm({
        name: '', email: '', role: 'sub_admin', password: '', 
        mobile: '', employee_id: '', zone_id: '', city: '',
        client_id: '',
        permissions: ROLE_DEFAULTS['sub_admin'], assigned_cities: []
      });
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to add user');
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

  const roleColors: Record<string, string> = { 
    admin: C.red, sub_admin: C.blue, city_manager: C.green, 
    warehouse_manager: '#F59E0B', hr: '#D946EF', mis: '#06B6D4' 
  };
  const roleLabels: Record<string, string> = { 
    admin: 'Admin', sub_admin: 'Sub-Admin', city_manager: 'City Manager', 
    warehouse_manager: 'Warehouse Manager', hr: 'HR', mis: 'MIS',
    client: 'Client'
  };

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
        </div>

        {/* Access Control & Permissions */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Access Control & Permissions</div>
              <div style={{ fontSize: 14, color: C.gray }}>Manage administrative staff and define granular system access.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
            <button onClick={() => setActiveTab('users')} style={{ background: activeTab === 'users' ? C.s4 : 'transparent', color: activeTab === 'users' ? C.white : C.gray, border: `1px solid ${activeTab === 'users' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>User Directory</button>
            <button onClick={() => setActiveTab('rules')} style={{ background: activeTab === 'rules' ? C.s4 : 'transparent', color: activeTab === 'rules' ? C.white : C.gray, border: `1px solid ${activeTab === 'rules' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>Operational Rules</button>
            <button onClick={() => setActiveTab('pref')} style={{ background: activeTab === 'pref' ? C.s4 : 'transparent', color: activeTab === 'pref' ? C.white : C.gray, border: `1px solid ${activeTab === 'pref' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>System Preferences</button>
          </div>

          {activeTab === 'users' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.gray }}>Manage administrative accounts and their specific module permissions.</div>
                <button onClick={() => { setForm({ name: '', email: '', role: 'sub_admin', password: '', mobile: '', employee_id: '', zone_id: '', city: '', client_id: '', permissions: ROLE_DEFAULTS['sub_admin'], assigned_cities: [] }); setShowAdd(true); }} style={{ background: C.red, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  + Add Administrator
                </button>
              </div>

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
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.white, marginBottom: 12, fontFamily: "'Syne', sans-serif" }}>Module Permissions (Pre-filled based on role)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {[
                        {id: 'analytics', l: 'Analytics'}, {id: 'attendance', l: 'Attendance'}, {id: 'route_plan', l: 'Route Plan'},
                        {id: 'work_activities', l: 'Work Activities'}, {id: 'manpower', l: 'Manpower'}, {id: 'visit_logs', l: 'Visit Logs'},
                        {id: 'inventory', l: 'Inventory'}, {id: 'grievances', l: 'Grievances'}, {id: 'form_builder', l: 'Form Builder'},
                        {id: 'admin', l: 'Resources'}, {id: 'broadcast', l: 'Broadcast'}
                      ].map(m => (
                        <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.s4, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${form.permissions.includes(m.id) ? C.blue : C.border}`, transition: 'all 0.2s' }}>
                          <input type="checkbox" checked={form.permissions.includes(m.id)} 
                            onChange={e => {
                              const next = e.target.checked ? [...form.permissions, m.id] : form.permissions.filter(p => p !== m.id);
                              setForm(p => ({...p, permissions: next}));
                            }} 
                            style={{ accentColor: C.blue }}
                          />
                          <span style={{ fontSize: 12, fontWeight: 600, color: form.permissions.includes(m.id) ? C.white : C.gray }}>{m.l}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {form.role === 'city_manager' && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Assigned Cities (Scope)</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, background: C.s2, padding: 12, borderRadius: 10, border: `1px solid ${C.border}` }}>
                        {allCityNames.map(city => (
                          <button key={city} onClick={() => {
                            const next = form.assigned_cities.includes(city) ? form.assigned_cities.filter(c => c !== city) : [...form.assigned_cities, city];
                            setForm(p => ({...p, assigned_cities: next}));
                          }} type="button"
                            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: form.assigned_cities.includes(city) ? C.blue : C.s4, color: form.assigned_cities.includes(city) ? '#fff' : C.gray }}>
                            {city}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button onClick={()=>setShowAdd(false)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleAddUser} disabled={saving} style={{ background: C.red, border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                      {saving ? 'Saving...' : 'Save Administrator'}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', background: C.s2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1.2fr 100px', padding: '16px 24px', background: C.s3, borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  <div>Name & Employee ID</div>
                  <div>Email & Mobile</div>
                  <div>Role & Permissions</div>
                  <div style={{ textAlign: 'right' }}>Actions</div>
                </div>
                {loading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: C.gray }}>Loading administrators...</div>
                ) : users.map((u, i) => (
                  <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1.2fr 100px', padding: '18px 24px', borderBottom: i < users.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', opacity: u.is_active ? 1 : 0.5 }}>
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
                        {roleLabels[u.role] || u.role}
                      </div>
                      <div style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>
                        {u.permissions?.length || 0} modules · {u.assigned_cities?.length ? `${u.assigned_cities.length} cities` : u.client_id ? `Client: ${clients.find(c => c.id === u.client_id)?.name || 'Unknown'}` : 'Global'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>Toggle between dark and light themes for the dashboard.</div>
                <div style={{ display: 'flex', gap: 12 }}>
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

        </div>
      </div>
    </div>
  );
}
