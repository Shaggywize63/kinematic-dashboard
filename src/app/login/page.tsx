'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { saveSession } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const router = useRouter();

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(email);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validEmail)         { setError('Please enter a valid email address.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }

    setError(''); setLoading(true);
    try {
      const res = await api.login(email, password) as {
        success: boolean;
        data: {
          user: { id: string; name: string; role: string; org_id: string; permissions: string[] };
          access_token: string;
          expires_at: number;
        };
      };
      if (res.success && res.data) {
        saveSession({
          user: res.data.user as Parameters<typeof saveSession>[0]['user'],
          access_token: res.data.access_token,
          expires_at: res.data.expires_at ?? Math.floor(Date.now() / 1000) + 86400,
        });
        router.push('/dashboard');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#080B12', padding: '24px', fontFamily: "'DM Sans', sans-serif", position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position:'absolute', top:-140, left:-140, width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(224,30,44,0.07) 0%,transparent 65%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', bottom:-80, right:-80, width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(62,158,255,0.05) 0%,transparent 65%)', pointerEvents:'none' }}/>

      <div style={{ width:'100%', maxWidth:420, animation:'fadeIn 0.4s ease both' }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ width:76, height:76, background:'#E01E2C', borderRadius:24, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:'0 24px 70px rgba(224,30,44,0.38)' }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontSize:40, fontWeight:800, color:'#fff', lineHeight:1 }}>K</span>
          </div>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:32, fontWeight:800, color:'#E8EDF8', margin:'0 0 6px' }}>Kinematic</h1>
          <p style={{ fontSize:13, color:'#7A8BA0', margin:0, letterSpacing:'0.5px' }}>Field Force Management Platform</p>
        </div>

        <div style={{ background:'#0E1420', border:'1px solid #1E2D45', borderRadius:20, padding:32 }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:700, margin:'0 0 6px' }}>Welcome back</h2>
          <p style={{ fontSize:13, color:'#7A8BA0', margin:'0 0 28px' }}>Sign in to your Kinematic account</p>

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Email */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#7A8BA0', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>
                Email Address
              </label>
              <div style={{ position:'relative' }}>
                <svg style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', opacity:0.4 }} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <input
                  type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="admin@company.com" required
                  style={{ width:'100%', background:'#131B2A', border:'1.5px solid #1E2D45', color:'#E8EDF8', borderRadius:12, padding:'12px 14px 12px 38px', fontSize:14, outline:'none', transition:'border-color 0.18s', fontFamily:"'DM Sans',sans-serif" }}
                  onFocus={e => e.currentTarget.style.borderColor='#E01E2C'}
                  onBlur={e => e.currentTarget.style.borderColor='#1E2D45'}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#7A8BA0', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>
                Password
              </label>
              <div style={{ position:'relative' }}>
                <svg style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', opacity:0.4 }} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <input
                  type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password" required
                  style={{ width:'100%', background:'#131B2A', border:'1.5px solid #1E2D45', color:'#E8EDF8', borderRadius:12, padding:'12px 42px 12px 38px', fontSize:14, outline:'none', transition:'border-color 0.18s', fontFamily:"'DM Sans',sans-serif" }}
                  onFocus={e => e.currentTarget.style.borderColor='#E01E2C'}
                  onBlur={e => e.currentTarget.style.borderColor='#1E2D45'}
                />
                <button type="button" onClick={() => setShowPass(p => !p)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', opacity:0.5, padding:2 }}>
                  {showPass ? (
                    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#E8EDF8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#E8EDF8" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.22)', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#E01E2C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontSize:12, color:'#E01E2C' }}>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit" disabled={loading || !email || !password}
              style={{ width:'100%', background: loading ? 'rgba(224,30,44,0.7)' : '#E01E2C', color:'#fff', border:'none', borderRadius:13, padding:'14px', fontSize:15, fontWeight:700, fontFamily:"'Syne',sans-serif", cursor: loading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, transition:'all 0.18s', marginTop:4, boxShadow: loading ? 'none' : '0 8px 30px rgba(224,30,44,0.3)' }}
            >
              {loading
                ? <><div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/> Signing in...</>
                : 'Sign In →'
              }
            </button>

            <p style={{ textAlign:'center', fontSize:12, color:'#4A6080', margin:0 }}>
              Forgot password?{' '}
              <span style={{ color:'#E01E2C', cursor:'pointer', fontWeight:600 }}>Contact your administrator</span>
            </p>
          </form>
        </div>

        <p style={{ textAlign:'center', marginTop:20, fontSize:11, color:'#2E445E' }}>
          Kinematic v1.0 | v8-AMBIG-FIX · Role-based access controlled by your admin
        </p>
      </div>
    </main>
  );
}
