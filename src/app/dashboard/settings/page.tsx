'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import CitySelect from '@/components/CitySelect';
import { AuthUser } from '@/types';

const C = {
  bg: '#070D18', s2: '#0E1420', s3: '#131B2A', s4: '#1A2438',
  border: '#1E2D45', borderL: '#253650',
  white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  red: '#E01E2C', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.20)',
  green: '#00D97E', blue: '#3E9EFF',
};

const ROLE_DEFAULTS: Record<string, string[]> = {
  admin: ['analytics', 'attendance', 'route_plan', 'work_activities', 'manpower', 'visit_logs', 'inventory', 'grievances', 'form_builder', 'admin', 'broadcast'],
  sub_admin: ['analytics', 'attendance', 'route_plan', 'work_activities', 'manpower', 'inventory', 'form_builder', 'broadcast'],
  city_manager: ['analytics', 'attendance', 'route_plan'],
  warehouse_manager: ['inventory'],
  hr: ['analytics', 'attendance', 'manpower'],
  mis: ['analytics', 'manpower', 'form_builder']
};

export default function SettingsPage() {
  const [radius, setRadius] = useState(100);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'users'|'pref'>('users');
  const [theme, setTheme] = useState<'dark'|'light'>('dark');

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [showAdd, setShowAdd] = useState(false);
  
  const [form, setForm] = useState({
    name: '', email: '', role: 'sub_admin', password: '', 
    mobile: '', employee_id: '', zone_id: '', city: '',
    permissions: ROLE_DEFAULTS['sub_admin'],
    assigned_cities: [] as string[]
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uR, zR, cR] = await Promise.all([
        api.get<any>('/api/v1/users?limit=1000'),
        api.get<any>('/api/v1/zones'),
        api.get<any>('/api/v1/cities')
      ]);
      
      const pick = (r: any) => r.data?.data || r.data || r.users || r || [];
      const allUsers = pick(uR);
      
      const admins = allUsers.filter((u: any) => 
        ['admin', 'sub_admin', 'city_manager', 'hr', 'mis', 'warehouse_manager'].includes(u.role)
      );
      
      setUsers(admins);
      setZones(pick(zR));
      setCities(pick(cR).filter((c: any) => c.is_active));
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
    warehouse_manager: 'Warehouse Manager', hr: 'HR', mis: 'MIS' 
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
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Geofence Management</div>
              <div style={{ fontSize: 14, color: C.gray, marginBottom: 24 }}>Set the global allowed deviation radius for field tracking and meetings.</div>
            </div>
            <button onClick={handleSaveSettings} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}>
              {saving ? 'Saving...' : 'Save Settings'}
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
            <button onClick={() => setActiveTab('users')} style={{ background: activeTab === 'users' ? C.s4 : 'transparent', color: activeTab === 'users' ? C.white : C.gray, border: `1px solid ${activeTab === 'users' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>User Directory</button>
            <button onClick={() => setActiveTab('pref')} style={{ background: activeTab === 'pref' ? C.s4 : 'transparent', color: activeTab === 'pref' ? C.white : C.gray, border: `1px solid ${activeTab === 'pref' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>System Preferences</button>
          </div>

          {activeTab === 'users' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.gray }}>Manage administrative accounts and their specific module permissions.</div>
                <button onClick={() => { setForm({ name: '', email: '', role: 'sub_admin', password: '', mobile: '', employee_id: '', zone_id: '', city: '', permissions: ROLE_DEFAULTS['sub_admin'], assigned_cities: [] }); setShowAdd(true); }} style={{ background: C.red, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                        {u.permissions?.length || 0} modules · {u.assigned_cities?.length ? `${u.assigned_cities.length} cities` : 'Global'}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Interface Appearance</div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>Choose your preferred dashboard theme color.</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => setTheme('dark')} style={{ flex: 1, padding: '14px', borderRadius: 10, background: theme === 'dark' ? C.s4 : 'transparent', border: `1px solid ${theme === 'dark' ? C.blue : C.border}`, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0D1117', border: '2px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🌙</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: theme === 'dark' ? C.white : C.gray }}>Dark Mode</span>
                    </div>
                  </button>
                  <button onClick={() => setTheme('light')} style={{ flex: 1, padding: '14px', borderRadius: 10, background: theme === 'light' ? C.s4 : 'transparent', border: `1px solid ${theme === 'light' ? C.blue : C.border}`, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ffffff', border: '2px solid #e1e4e8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>☀️</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: theme === 'light' ? C.white : C.gray }}>Light Mode</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
