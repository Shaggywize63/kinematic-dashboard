'use client';
import { useState } from 'react';

const C = {
  bg: '#070D18', s2: '#0E1420', s3: '#131B2A', s4: '#1A2438',
  border: '#1E2D45', borderL: '#253650',
  white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  red: '#E01E2C', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.20)',
  green: '#00D97E', blue: '#3E9EFF',
};

export default function SettingsPage() {
  const [radius, setRadius] = useState(100);
  const [saving, setSaving] = useState(false);
  
  // Access Control Mock Data
  const [users, setUsers] = useState([
    { id: '1', name: 'Sagar Bhargava', email: 'sagar@kinematic.com', role: 'admin' },
    { id: '2', name: 'Field Lead', email: 'lead@kinematic.com', role: 'sub_admin' },
    { id: '3', name: 'Delhi Manager', email: 'delhi@kinematic.com', role: 'city_manager' },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [newU, setNewU] = useState({ name: '', email: '', role: 'sub_admin' });

  const handleSaveFence = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      alert('Geofence updated successfully!');
    }, 600);
  };

  const handleAddUser = () => {
    if(!newU.name || !newU.email) return;
    setUsers([...users, { id: Date.now().toString(), ...newU }]);
    setShowAdd(false);
    setNewU({ name: '', email: '', role: 'sub_admin' });
  };

  const roleColors: Record<string, string> = {
    admin: C.red,
    sub_admin: C.blue,
    city_manager: C.green
  };
  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    sub_admin: 'Sub-Admin',
    city_manager: 'City Manager'
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 40 }}>
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
            <button onClick={handleSaveFence} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}>
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
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Permission Settings</div>
              <div style={{ fontSize: 14, color: C.gray }}>Manage access control for Admins, Sub-Admins, and City Managers.</div>
            </div>
            <button onClick={() => setShowAdd(true)} style={{ background: C.red, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
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

      </div>
    </div>
  );
}
