'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '../../../lib/api';

const C = {
  red: '#E01E2C', 
  green: '#00D97E', 
  yellow: '#FFB800', 
  blue: '#3E9EFF', 
  purple: '#9B6EFF', 
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  s2: 'var(--s2)', 
  border: 'var(--border)',
};

interface Grievance {
  id: string;
  category: string;
  description: string;
  against_role?: string;
  incident_date?: string;
  is_anonymous: boolean;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  created_at: string;
  admin_remarks?: string;
  users?: { name: string; employee_id: string };
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:      { bg:'rgba(255,184,0,0.12)',   color:'#FFB800' },
  under_review: { bg:'rgba(62,158,255,0.12)',  color:'#3E9EFF' },
  resolved:     { bg:'rgba(0,217,126,0.12)',   color:'#00D97E' },
  dismissed:    { bg:'rgba(122,139,160,0.08)', color:'#7A8BA0' },
};

export default function GrievancesPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Grievance | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [remarks, setRemarks] = useState('');
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // FIXED: correct endpoint is /api/v1/grievances (not /api/v1/grievances/admin)
      const res = await api.get<any>('/api/v1/grievances');
      const d = res as any;
      setGrievances(d.data || d.grievances || (Array.isArray(d) ? d : []));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load grievances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateStatus = async () => {
    if (!selected || !newStatus) return;
    setUpdating(true);
    try {
      // FIXED: use PATCH not POST, correct endpoint is /api/v1/grievances/:id
      await api.patch(`/api/v1/grievances/${selected.id}`, { status: newStatus, admin_remarks: remarks });
      setGrievances(g => g.map(gr => gr.id === selected.id ? { ...gr, status: newStatus as any, admin_remarks: remarks } : gr));
      setSelected(null);
      setNewStatus('');
      setRemarks('');
    } catch (e: any) {
      alert(e.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const filtered = filter === 'all' ? grievances : grievances.filter(g => g.status === filter);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800 }}>Grievance Cell</div>
          <div style={{ fontSize:13, color:C.gray, marginTop:3 }}>Confidential complaints management</div>
        </div>
        <button onClick={fetchData} style={{ padding:'9px 16px', background:C.red, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.2)', borderRadius:12, padding:'12px 16px', fontSize:13, color:C.red }}>
          {error}
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {[
          { l:'Total', v:grievances.length, c:C.blue },
          { l:'Pending', v:grievances.filter(g=>g.status==='pending').length, c:C.yellow },
          { l:'Under Review', v:grievances.filter(g=>g.status==='under_review').length, c:C.blue },
          { l:'Resolved', v:grievances.filter(g=>g.status==='resolved').length, c:C.green },
        ].map((s, i) => (
          <div key={i} style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:12, color:C.gray, marginTop:6 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden' }}>
        {/* Filters */}
        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:8, flexWrap:'wrap' }}>
          {[['all','All'],['pending','Pending'],['under_review','Under Review'],['resolved','Resolved'],['dismissed','Dismissed']].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:'7px 14px', borderRadius:9, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s',
                background: filter===f ? C.red : C.s2, borderColor: filter===f ? C.red : C.border, color: filter===f ? '#fff' : C.gray }}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:C.grayd, fontSize:14 }}>Loading grievances...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:C.grayd, fontSize:14 }}>No grievances found</div>
        ) : (
          <div>
            {filtered.map((g, i) => {
              const sc = STATUS_COLORS[g.status] || STATUS_COLORS.pending;
              return (
                <div key={i} style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}40`, display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.s2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>
                        {g.is_anonymous ? '🔒 Anonymous' : (g.users?.name || 'Unknown FE')}
                      </span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:sc.bg, color:sc.color }}>
                        {g.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize:13, color:C.gray, marginBottom:3 }}>
                      {g.category}{g.against_role ? ` · Re: ${g.against_role}` : ''}
                    </div>
                    <div style={{ fontSize:11, color:C.grayd }}>
                      {new Date(g.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                    </div>
                  </div>
                  <button onClick={() => { setSelected(g); setNewStatus(g.status); setRemarks(g.admin_remarks || ''); }}
                    style={{ padding:'7px 14px', background:C.s2, border:`1px solid ${C.border}`, borderRadius:9, fontSize:12, fontWeight:600, color:C.gray, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
                    Manage
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manage modal */}
      {selected && (
        <div onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:22, width:'100%', maxWidth:520, padding:28, position:'relative' }}>
            <button onClick={() => setSelected(null)}
              style={{ position:'absolute', top:16, right:16, background:C.s2, border:`1px solid ${C.border}`, borderRadius:9, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:C.gray, fontSize:16 }}>✕</button>

            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, marginBottom:20 }}>Manage Grievance</div>

            <div style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:18, display:'flex', flexDirection:'column', gap:8, fontSize:13 }}>
              <div style={{ display:'flex', gap:8 }}><span style={{ color:C.gray, width:90, flexShrink:0 }}>From:</span><span style={{ fontWeight:600 }}>{selected.is_anonymous ? '🔒 Anonymous' : selected.users?.name}</span></div>
              <div style={{ display:'flex', gap:8 }}><span style={{ color:C.gray, width:90, flexShrink:0 }}>Category:</span><span style={{ fontWeight:600 }}>{selected.category}</span></div>
              {selected.against_role && <div style={{ display:'flex', gap:8 }}><span style={{ color:C.gray, width:90, flexShrink:0 }}>Regarding:</span><span style={{ fontWeight:600 }}>{selected.against_role}</span></div>}
              <div style={{ display:'flex', gap:8 }}><span style={{ color:C.gray, width:90, flexShrink:0 }}>Details:</span><span style={{ color:'#c8d4e8', lineHeight:1.5 }}>{selected.description}</span></div>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, color:C.gray, marginBottom:7 }}>Update Status</div>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.border}`, color:'#E8EDF8', borderRadius:10, padding:'10px 14px', fontSize:13, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, color:C.gray, marginBottom:7 }}>Admin Remarks</div>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
                placeholder="Add remarks for HR record..."
                style={{ width:'100%', background:C.s2, border:`1px solid ${C.border}`, color:'#E8EDF8', borderRadius:10, padding:'10px 14px', fontSize:13, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none' }}/>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setSelected(null)} style={{ flex:1, padding:12, background:C.s2, border:`1px solid ${C.border}`, borderRadius:10, fontSize:13, fontWeight:600, color:C.gray, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={updateStatus} disabled={updating}
                style={{ flex:1, padding:12, background:C.red, border:'none', borderRadius:10, fontSize:13, fontWeight:600, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:updating?0.6:1 }}>
                {updating ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
