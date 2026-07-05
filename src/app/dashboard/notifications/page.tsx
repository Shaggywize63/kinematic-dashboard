'use client';
// Deployment V4 - Force Refresh
import { useState, useEffect, useCallback } from 'react';
import api from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import RecipientPicker from '../../../components/RecipientPicker';
import { useTableSort, SortLabel } from '../../../lib/tableSort';

const C = {
  red: '#E01E2C', 
  green: '#00D97E', 
  blue: '#3E9EFF', 
  purple: '#9B6EFF',
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  graydd: 'var(--border)',
  s1: 'var(--bg)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)',
  border: 'var(--border)', 
  white: 'var(--text)',
};

interface User { id:string; name:string; role:string; city?:string; zones?:{name:string,city?:string}; supervisor_id?:string; hierarchy_level_id?:string; }
interface City { id:string; name:string; }
interface Notif { id:string; title:string; body:string; priority:string; audience_summary:string; created_at:string; recipients_count:number; read_count:number; send_push?:boolean; }

// Type-aware column sorting reads the raw broadcast value per column key
// (read rate is derived so it compares as a numeric ratio, not a string).
const notifVal = (h: Notif, key: string): unknown => {
  switch (key) {
    case 'title': return h.title;
    case 'target': return h.audience_summary;
    case 'type': return !!h.send_push;
    case 'read': return h.recipients_count ? h.read_count / h.recipients_count : 0;
    case 'sent': return h.created_at;
    default: return (h as unknown as Record<string, unknown>)[key];
  }
};

export default function NotificationsPage() {
  const [title,setTitle]=useState('');
  const [body,setBody]=useState('');
  const [priority,setPriority]=useState('info');
  // New composer state — a flat set of picked user UUIDs sent to
  // /notifications/send as `targeting.user_ids`. Replaces the legacy
  // city + supervisor + FE dropdowns; users pick via the tree
  // (RecipientPicker) which groups by city / hierarchy / saved group.
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [history,setHistory]=useState<Notif[]>([]);
  // Default ON so a broadcast actually reaches every recipient's phone (lock
  // screen via FCM), not just the in-app bell — otherwise users who aren't
  // currently in the app "miss" the notification. Admins can still uncheck it.
  const [sendPush,setSendPush]=useState(true);
  const [sending,setSending]=useState(false);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const { sorted, sort, toggle } = useTableSort<Notif>(history, notifVal, { key: 'sent', dir: 'desc' });

  const fetchAll = useCallback(async(p: number = 1)=>{
    try {
      const [uR, hR] = await Promise.all([
        api.get<any>('/api/v1/users?limit=500'),
        api.get<any>(`/api/v1/notifications/history?limit=10&page=${p}`),
      ]);
      const pick=(r:any)=>{
        if(Array.isArray(r))return r;
        if(Array.isArray(r?.data))return r.data;
        if(Array.isArray(r?.data?.data))return r.data.data;
        return r?.users||r?.zones||[];
      };
      setAllUsers(pick(uR));
      const hData = hR?.data?.data || hR?.data || [];
      setHistory(Array.isArray(hData) ? hData : []);
      setTotal(hR?.data?.totalCount || 0);
    } catch(e){ console.error('Fetch error:',e); }
  },[]);

  useEffect(()=>{fetchAll(page);}, [fetchAll, page]);

  const send=async()=>{
    if(!title||!body)return alert('Title and message are required');
    if(selectedIds.size===0)return alert('Pick at least one recipient.');
    setSending(true);
    try{
      await api.post('/api/v1/notifications/send',{
        title,
        body,
        priority,
        send_push:sendPush,
        targeting:{ user_ids: Array.from(selectedIds) },
      });
      alert('Sent successfully!');
      setTitle('');setBody('');setSelectedIds(new Set());
      fetchAll();
    }catch(e:any){alert(e.message||'Failed');}
    finally{setSending(false);}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this broadcast? It will be removed from all users.')) return;
    try {
      await api.delete(`/api/v1/notifications/${id}`);
      setHistory(history.filter(h => h.id !== id));
    } catch (e: any) { alert(e.message || 'Failed to delete'); }
  };

  const handleClearAll = async () => {
    if (!confirm('Clear ALL broadcast history? This cannot be undone — every row below will be removed from your org.')) return;
    try {
      await api.delete('/api/v1/notifications/history/clear');
      setHistory([]);
      setTotal(0);
      setPage(1);
    } catch (e: any) { alert(e.message || 'Failed to clear history'); }
  };

  const inp:React.CSSProperties={width:'100%',background:C.s3,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px',color:C.white,outline:'none',fontSize:14,fontFamily:'inherit'};

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24,paddingBottom:40}}>
      <div style={{display:'flex',gap:24,alignItems:'flex-start'}}>

        <div style={{flex:1,background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,padding:32}}>
          <h2 style={{fontSize:20,fontWeight:700,marginBottom:24}}>Send Notification</h2>
          <div style={{display:'flex',flexDirection:'column',gap:20}}>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
              <div>
                <label style={{fontSize:11,color:C.gray,fontWeight:600,display:'block',marginBottom:8}}>TITLE</label>
                <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Attendance Reminder" style={inp}/>
              </div>
              <div>
                <label style={{fontSize:11,color:C.gray,fontWeight:600,display:'block',marginBottom:8}}>PRIORITY</label>
                <select value={priority} onChange={e=>setPriority(e.target.value)} style={{...inp,appearance:'none'}}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{fontSize:11,color:C.gray,fontWeight:600,display:'block',marginBottom:8}}>MESSAGE</label>
              <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Write notification message..." rows={4} style={{...inp,resize:'none'}}/>
            </div>

            <div style={{height:1,background:C.border}}/>

            <div>
              <label style={{fontSize:11,color:C.gray,fontWeight:600,display:'block',marginBottom:8}}>RECIPIENTS</label>
              <RecipientPicker
                users={allUsers}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
              />
            </div>

            <label style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',padding:'12px 16px',background:C.s3,border:`1px solid ${C.border}`,borderRadius:12,marginTop:8}}>
               <input type="checkbox" checked={sendPush} onChange={e=>setSendPush(e.target.checked)} style={{width:18,height:18,accentColor:C.red,cursor:'pointer'}}/>
               <div>
                 <div style={{fontSize:14,fontWeight:600,color:C.white}}>Send as Push Notification</div>
                 <div style={{fontSize:12,color:C.gray,marginTop:2}}>Pop up on the recipient&apos;s lock screen (alerts via Firebase)</div>
               </div>
            </label>

            <button onClick={send} disabled={sending} style={{marginTop:12,width:'100%',padding:16,background:C.red,border:'none',borderRadius:12,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',opacity:sending?0.7:1}}>
              {sending?'Sending...':'Send Notification'}
            </button>
          </div>

        </div>

        <div style={{width:320,background:C.s2,border:`1px solid ${C.border}`,borderRadius:16,padding:24}}>
          <h2 style={{fontSize:16,fontWeight:700,marginBottom:20}}>Summary</h2>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <Row label="Selected" val={`${selectedIds.size} user${selectedIds.size===1?'':'s'}`} col={selectedIds.size?C.red:C.gray}/>
            <Row label="Push" val={sendPush?'Enabled':'In-app only'} col={sendPush?C.green:C.gray}/>
            <div style={{marginTop:16,padding:16,background:'rgba(224,30,44,0.06)',borderRadius:12,border:`1px solid ${C.red}22`}}>
              <div style={{fontSize:11,color:C.gray,fontWeight:600,marginBottom:4}}>AUDIENCE</div>
              <div style={{fontSize:26,fontWeight:800}}>{selectedIds.size} {selectedIds.size===1?'recipient':'recipients'}</div>
              <div style={{fontSize:11,color:C.red,marginTop:4}}>{sendPush?'In-app + push':'In-app only'}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{background:C.s2,border:`1px solid ${C.red}33`,borderRadius:16,padding:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h2 style={{fontSize:18,fontWeight:700,color:C.red,margin:0}}>Live History (LATEST 10)</h2>
          {isPlatformAdmin && history.length > 0 && (
            <button onClick={handleClearAll} style={{background:'rgba(224,30,44,0.1)',border:`1px solid ${C.red}44`,color:C.red,cursor:'pointer',fontSize:12,padding:'8px 14px',borderRadius:8,display:'inline-flex',alignItems:'center',gap:6,fontWeight:700}} title="Clear all broadcast history for this organisation">
              <span>🗑️</span> Clear all
            </button>
          )}
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead>
            <tr style={{borderBottom:`1px solid ${C.border}`,textAlign:'left',color:C.gray}}>
              <th style={{padding:'10px 12px'}}><SortLabel label="NOTIFICATION" sortKey="title" sort={sort} onToggle={toggle} /></th>
              <th style={{padding:'10px 12px'}}><SortLabel label="TARGET" sortKey="target" sort={sort} onToggle={toggle} /></th>
              <th style={{padding:'10px 12px'}}><SortLabel label="TYPE" sortKey="type" sort={sort} onToggle={toggle} /></th>
              <th style={{padding:'10px 12px'}}><SortLabel label="READ RATE" sortKey="read" sort={sort} onToggle={toggle} /></th>
              <th style={{padding:'10px 12px'}}><SortLabel label="SENT AT" sortKey="sent" sort={sort} onToggle={toggle} /></th>
              <th style={{padding:'10px 12px',textAlign:'right'}}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {history.length===0?(
              <tr><td colSpan={6} style={{textAlign:'center',padding:60,color:C.grayd}}>No notifications sent yet</td></tr>
            ):sorted.map(h=>(
              <tr key={h.id} style={{borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:'14px 12px'}}><div style={{fontWeight:600}}>{h.title}</div><div style={{fontSize:12,color:C.gray}}>{h.body}</div></td>
                <td style={{padding:'14px 12px'}}>{h.audience_summary}</td>
                <td style={{padding:'14px 12px'}}><span style={{padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:700,background:h.send_push?'rgba(224,30,44,0.12)':'rgba(122,139,160,0.12)',color:h.send_push?C.red:C.gray}}>{h.send_push?'PUSH + IN-APP':'IN-APP ONLY'}</span></td>
                <td style={{padding:'14px 12px'}}><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{flex:1,height:5,background:C.s4,borderRadius:3}}><div style={{width:`${h.recipients_count?Math.round(h.read_count/h.recipients_count*100):0}%`,height:'100%',background:C.green,borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:600}}>{h.read_count}/{h.recipients_count}</span></div></td>
                <td style={{padding:'14px 12px',color:C.gray}}>{new Date(h.created_at).toLocaleString('en-IN')}</td>
                <td style={{padding:'14px 12px',textAlign:'right'}}>
                  {isPlatformAdmin && (
                    <button onClick={()=>handleDelete(h.id)} style={{background:'rgba(224,30,44,0.1)',border:`1px solid ${C.red}44`,color:C.red,cursor:'pointer',fontSize:12,padding:'6px 12px',borderRadius:8,display:'inline-flex',alignItems:'center',gap:6,fontWeight:600}} title="Delete Broadcast">
                      <span>🗑️</span> Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total > 10 && (
          <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:16,marginTop:24,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              style={{padding:'8px 16px',background:C.s3,border:`1px solid ${C.border}`,borderRadius:8,color:page===1?C.gray:'white',cursor:page===1?'default':'pointer',fontSize:12,fontWeight:600}}
            >
              Previous
            </button>
            <span style={{fontSize:13,color:C.gray}}>Page <b>{page}</b> of {Math.ceil(total / 10)}</span>
            <button 
              disabled={page * 10 >= total}
              onClick={() => setPage(p => p + 1)}
              style={{padding:'8px 16px',background:C.s3,border:`1px solid ${C.border}`,borderRadius:8,color:page*10>=total?C.gray:'white',cursor:page*10>=total?'default':'pointer',fontSize:12,fontWeight:600}}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({label,val,col}:{label:string,val:string,col:string}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}22`}}>
      <span style={{fontSize:12,color:C.gray}}>{label}</span>
      <span style={{fontSize:13,fontWeight:700,color:col,maxWidth:'65%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{val}</span>
    </div>
  );
}
