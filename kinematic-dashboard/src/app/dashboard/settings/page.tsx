
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const C = {
  bg: '#070D18', s2: '#0E1420', s3: '#131B2A', s4: '#1A2438',
  border: '#1E2D45', borderL: '#253650',
  white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  red: '#E01E2C', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.20)',
  green: '#00D97E', greenD: 'rgba(0,217,126,0.08)', greenB: 'rgba(0,217,126,0.20)',
  blue: '#3E9EFF', blueD: 'rgba(62,158,255,0.10)',
};

const MODULES = [
  { name: 'Geo-Fence & Zones', desc: 'Manage meeting points and geofence radiuses', href: '/dashboard/other-management/zones', icon: 'M1 6l10.5 7L22 6M1 6v12a2 2 0 002 2h18a2 2 0 002-2V6 M1 6l10.5-4L22 6' },
  { name: 'City Management', desc: 'Configure active cities and regions', href: '/dashboard/other-management/cities', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { name: 'Outlet Management', desc: 'Stores, pharmacies, and distributor DB', href: '/dashboard/other-management/stores', icon: 'M3 3h18v4H3z M5 7v13h14V7 M9 7v13 M15 7v13' },
  { name: "SKU's Management", desc: 'Product catalog and units tracking', href: '/dashboard/other-management/skus', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10' },
  { name: 'Activity Management', desc: 'Standard operating procedures & events', href: '/dashboard/other-management/activities', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 12l2 2 4-4' },
  { name: 'Asset Management', desc: 'Visicoolers, POSM, and field assets', href: '/dashboard/other-management/assets', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8 M10 12h4' },
];

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || 'Not Set');
  }, []);

  const isConnected = !!apiUrl && apiUrl !== 'Not Set';

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white }}>
      <style>{`
        @keyframes pulse-green { 0% { box-shadow: 0 0 0 0 rgba(0,217,126,0.4); } 70% { box-shadow: 0 0 0 8px rgba(0,217,126,0); } 100% { box-shadow: 0 0 0 0 rgba(0,217,126,0); } }
        @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(224,30,44,0.4); } 70% { box-shadow: 0 0 0 8px rgba(224,30,44,0); } 100% { box-shadow: 0 0 0 0 rgba(224,30,44,0); } }
      `}</style>
      
      {/* ── Page header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 800, color: C.white, margin: 0 }}>Settings</h1>
          <p style={{ color: C.gray, fontSize: 13, marginTop: 4 }}>Platform configuration and system preferences</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Module Integration */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Platform Modules</div>
          <div style={{ fontSize: 14, color: C.gray, marginBottom: 24 }}>Configure core geographic, asset, and operational modules</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {MODULES.map(m => (
              <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
                <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px', cursor: 'pointer', transition: 'all .15s', height: '100%', display: 'flex', flexDirection: 'column' }}
                     onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.background = C.s4; }}
                     onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.s3; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: C.blueD, color: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon d={m.icon} />
                    </div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: C.white }}>{m.name}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.5, flex: 1 }}>{m.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* API Connection */}
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>API Connection</div>
          <div style={{ fontSize: 14, color: C.gray, marginBottom: 24 }}>System status and backend configuration</div>
          
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: isConnected ? C.greenD : C.redD, border: `1px solid ${isConnected ? C.greenB : C.redB}`, borderRadius: 12, padding: '12px 20px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? C.green : C.red, animation: isConnected ? 'pulse-green 2s infinite' : 'pulse-red 2s infinite' }}/>
            <span style={{ fontSize: 13, color: isConnected ? C.green : C.red, fontWeight: 600 }}>{isConnected ? 'System is connected and active' : 'Connect your API to see live data'}</span>
          </div>

          <div style={{ marginTop: 24, padding: 16, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>NEXT_PUBLIC_API_URL</label>
            <div style={{ fontFamily: 'monospace', fontSize: 14, color: isConnected ? C.white : C.grayd }}>{apiUrl}</div>
            {!isConnected && <div style={{ fontSize: 12, color: C.gray, marginTop: 10 }}>Set NEXT_PUBLIC_API_URL in your .env.local to your backend URL</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
