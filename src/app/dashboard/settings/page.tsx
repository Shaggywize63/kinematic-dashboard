'use client';
import { useState } from 'react';

const C = {
  bg: '#070D18', s2: '#0E1420', s3: '#131B2A', s4: '#1A2438',
  border: '#1E2D45', borderL: '#253650',
  white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  red: '#E01E2C', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.20)',
  green: '#00D97E', blue: '#3E9EFF',
};

const PERMISSIONS = [
  { id: 'view_analytics', label: 'Analytics & Reporting' },
  { id: 'live_tracking', label: 'Live Tracking & Map' },
  { id: 'manage_users', label: 'Manage Users & Access' },
  { id: 'manage_field_execs', label: 'Manage Field Executives' },
  { id: 'manage_attendance', label: 'Approve Attendance & Leaves' },
  { id: 'manage_routes', label: 'Create & Edit Route Plans' },
  { id: 'manage_zones', label: 'Manage Geofences & Cities' },
  { id: 'manage_inventory', label: 'Manage Warehouse & SKUs' },
  { id: 'broadcast_notifs', label: 'Send Broadcast Notifications' },
  { id: 'form_builder', label: 'Form Builder & Surveys' },
  { id: 'manage_settings', label: 'Modify System Settings' }
];

const INIT_PERMS: Record<string, string[]> = {
  admin: ['view_analytics', 'live_tracking', 'manage_users', 'manage_field_execs', 'manage_attendance', 'manage_routes', 'manage_zones', 'manage_inventory', 'broadcast_notifs', 'form_builder', 'manage_settings'],
  sub_admin: ['view_analytics', 'live_tracking', 'manage_field_execs', 'manage_attendance', 'manage_routes', 'manage_inventory', 'form_builder'],
  city_manager: ['view_analytics', 'manage_attendance', 'manage_routes', 'live_tracking'],
  warehouse_manager: ['view_analytics', 'manage_inventory'],
  hr: ['view_analytics', 'manage_attendance', 'manage_users'],
  mis: ['view_analytics', 'manage_users', 'form_builder']
};

export default function SettingsPage() {
  const [radius, setRadius] = useState(100);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'users'|'roles'|'pref'>('roles');
  const [theme, setTheme] = useState<'dark'|'light'>('dark');
  const [selectedRole, setSelectedRole] = useState('sub_admin');
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>(INIT_PERMS);
  
  // Access Control Mock Data
  const [users, setUsers] = useState([
    { id: '1', name: 'Sagar Bhargava', email: 'sagar@kinematic.com', role: 'admin' },
    { id: '2', name: 'Field Lead', email: 'lead@kinematic.com', role: 'sub_admin' },
    { id: '3', name: 'Delhi Manager', email: 'delhi@kinematic.com', role: 'city_manager' },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newU, setNewU] = useState({ name: '', email: '', role: 'sub_admin' });

  const handleSaveSettings = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      alert('Settings updated successfully!');
    }, 600);
  };

  const handleAddUser = () => {
    if(!newU.name || !newU.email) return;
    setUsers([...users, { id: Date.now().toString(), ...newU }]);
    setShowAdd(false);
    setNewU({ name: '', email: '', role: 'sub_admin' });
  };

  const togglePerm = (permId: string) => {
    if (selectedRole === 'admin') return; // Admins have fixed permissions
    setRolePerms(prev => {
      const current = prev[selectedRole] || [];
      const updated = current.includes(permId) ? current.filter(p => p !== permId) : [...current, permId];
      return { ...prev, [selectedRole]: updated };
    });
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
        
        {/* Geo-Fence Management */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Geofence Management</div>
              <div style={{ fontSize: 14, color: C.gray, marginBottom: 24 }}>Manually set the global allowed deviation radius for field tracking and meetings.</div>
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
            
            <input 
              type="range" 
              min="20" 
              max="200" 
              value={radius} 
              onChange={e => setRadius(Number(e.target.value))} 
              style={{ width: '100%', accentColor: C.red, cursor: 'pointer' }} 
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: C.gray, fontWeight: 600 }}>
              <span>20 m</span>
              <span>200 m</span>
            </div>
          </div>
        </div>

        {/* Access Control & Permissions */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Access Control & Permissions</div>
              <div style={{ fontSize: 14, color: C.gray }}>Manage system users and define granular role-based access.</div>
            </div>
            <button onClick={handleSaveSettings} style={{ background: C.red, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              Save Permissions
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
            <button onClick={() => setActiveTab('roles')} style={{ background: activeTab === 'roles' ? C.s4 : 'transparent', color: activeTab === 'roles' ? C.white : C.gray, border: `1px solid ${activeTab === 'roles' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .1s' }}>Role Permissions</button>
            <button onClick={() => setActiveTab('users')} style={{ background: activeTab === 'users' ? C.s4 : 'transparent', color: activeTab === 'users' ? C.white : C.gray, border: `1px solid ${activeTab === 'users' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .1s' }}>User Directory</button>
            <button onClick={() => setActiveTab('pref')} style={{ background: activeTab === 'pref' ? C.s4 : 'transparent', color: activeTab === 'pref' ? C.white : C.gray, border: `1px solid ${activeTab === 'pref' ? C.border : 'transparent'}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .1s' }}>System Preferences</button>
          </div>

          {activeTab === 'users' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button onClick={() => setShowAdd(true)} style={{ background: C.red, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  + Add User
                </button>
              </div>

              {showAdd && (
                <div style={{ background: C.s3, border: `1px solid ${C.redB}`, borderRadius: 12, padding: 20, marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Name</label>
                    <input value={newU.name} onChange={e=>setNewU({...newU, name: e.target.value})} placeholder="e.g. Rahul Sharma" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Email</label>
                    <input value={newU.email} onChange={e=>setNewU({...newU, email: e.target.value})} placeholder="rahul@kinematic.com" style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Role</label>
                    <select value={newU.role} onChange={e=>setNewU({...newU, role: e.target.value})} style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13, appearance: 'none' }}>
                      <option value="admin">Admin</option>
                      <option value="sub_admin">Sub-Admin</option>
                      <option value="city_manager">City Manager</option>
                      <option value="warehouse_manager">Warehouse Manager</option>
                      <option value="hr">HR</option>
                      <option value="mis">MIS</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={()=>setShowAdd(false)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleAddUser} style={{ background: C.red, border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save Access</button>
                  </div>
                </div>
              )}

              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 80px', padding: '14px 20px', background: C.s3, borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  <div>Name</div>
                  <div>Email ID</div>
                  <div>Access Level</div>
                  <div style={{ textAlign: 'right' }}>Action</div>
                </div>
                {users.map((u, i) => (
                  <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 80px', padding: '16px 20px', borderBottom: i < users.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: C.s2 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{u.name}</div>
                    <div style={{ fontSize: 13, color: C.gray }}>{u.email}</div>
                    <div>
                      <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${roleColors[u.role]}15`, color: roleColors[u.role], border: `1px solid ${roleColors[u.role]}33`, textTransform: 'capitalize' }}>
                        {roleLabels[u.role]}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <button onClick={() => setUsers(users.filter(x => x.id !== u.id))} style={{ background: 'transparent', border: 'none', color: C.red, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Revoke</button>
                    </div>
                  </div>
                ))}
                {users.length === 0 && (
                  <div style={{ padding: 30, textAlign: 'center', color: C.gray, fontSize: 14 }}>
                    No users configured. Add a user to get started.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'pref' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Interface Appearance</div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>Choose your preferred dashboard theme color.</div>
                
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => setTheme('dark')} style={{ flex: 1, padding: '14px', borderRadius: 10, background: theme === 'dark' ? C.s4 : 'transparent', border: `1px solid ${theme === 'dark' ? C.blue : C.border}`, cursor: 'pointer', transition: 'all .2s' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0D1117', border: '2px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🌙</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: theme === 'dark' ? C.white : C.gray }}>Dark Mode</span>
                    </div>
                  </button>
                  <button onClick={() => setTheme('light')} style={{ flex: 1, padding: '14px', borderRadius: 10, background: theme === 'light' ? C.s4 : 'transparent', border: `1px solid ${theme === 'light' ? C.blue : C.border}`, cursor: 'pointer', transition: 'all .2s' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ffffff', border: '2px solid #e1e4e8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>☀️</div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: theme === 'light' ? C.white : C.gray }}>Light Mode</span>
                    </div>
                  </button>
                </div>
              </div>

              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Region & Timezone</div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 16 }}>Primary settings for date and time formatting.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, color: C.grayd, fontWeight: 600 }}>DEFAULT TIMEZONE</div>
                  <div style={{ background: C.s2, border: `1px solid ${C.border}`, padding: '10px 14px', borderRadius: 8, fontSize: 13, color: C.white, fontWeight: 600 }}>
                    (GMT+05:30) India Standard Time
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roles' && (
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24 }}>
              {/* Role Sidebar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.keys(roleLabels).map(role => (
                  <button key={role} onClick={() => setSelectedRole(role)} style={{ background: selectedRole === role ? C.s3 : 'transparent', border: `1px solid ${selectedRole === role ? C.border : 'transparent'}`, color: selectedRole === role ? C.white : C.gray, padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: roleColors[role] }}/>
                    {roleLabels[role]}
                  </button>
                ))}
              </div>
              
              {/* Perm Checklist */}
              <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: roleColors[selectedRole] }}/>
                  {roleLabels[selectedRole]} Permissions
                </div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 24 }}>
                  {selectedRole === 'admin' ? 'Admins have full unrestricted access to all modules.' : 'Toggle specific module access for this role.'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                  {PERMISSIONS.map(p => {
                    const hasPerm = rolePerms[selectedRole]?.includes(p.id);
                    const disabled = selectedRole === 'admin';
                    return (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: C.s2, border: `1px solid ${hasPerm ? C.borderL : C.border}`, borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all .15s' }}>
                        <input 
                          type="checkbox" 
                          checked={hasPerm} 
                          onChange={() => togglePerm(p.id)} 
                          disabled={disabled}
                          style={{ accentColor: C.red, width: 18, height: 18, cursor: disabled ? 'not-allowed' : 'pointer' }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: hasPerm ? C.white : C.gray }}>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
