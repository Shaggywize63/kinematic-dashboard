
'use client';
import { useState, useEffect } from 'react';

const C = {
  bg: '#070D18', s2: '#0E1420', s3: '#131B2A', s4: '#1A2438',
  border: '#1E2D45', borderL: '#253650',
  white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  red: '#E01E2C', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.20)',
  green: '#00D97E', greenD: 'rgba(0,217,126,0.08)', greenB: 'rgba(0,217,126,0.20)',
  blue: '#3E9EFF', blueD: 'rgba(62,158,255,0.10)',
};

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
