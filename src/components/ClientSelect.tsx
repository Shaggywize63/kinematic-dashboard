'use client';
import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

const C = {
  s3: 'var(--s3)', border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  blue: '#3E9EFF', red: '#E01E2C', bg: 'var(--bg)'
};

interface Client { id: string; name: string; }

export default function ClientSelect({ value, onChange, placeholder = "Select Client..." }: { value: string, onChange: (id: string, name: string) => void, placeholder?: string }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/api/v1/misc/clients').then((res: any) => {
      const d = Array.isArray(res?.data) ? res.data : [];
      setClients(d);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const click = (e: MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const selectedObj = clients.find(c => c.id === value || c.name === value);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ width:'100%', background:C.s3, border:`1px solid ${C.border}`, color: value ? C.white : C.grayd, borderRadius:11, padding:'10px 13px', fontSize:13, outline:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
      >
        <span>{selectedObj ? selectedObj.name : placeholder}</span>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.6 }}><path d="M6 9l6 6 6-6"/></svg>
      </div>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', zIndex: 100, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
            <input 
              autoFocus
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Search clients..."
              style={{ width: '100%', background: 'transparent', border: 'none', color: C.white, fontSize: 13, outline: 'none', fontFamily:"'DM Sans',sans-serif" }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px', fontSize: 12, color: C.gray, textAlign: 'center' }}>No clients found</div>
            ) : (
              filtered.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => { onChange(c.id, c.name); setOpen(false); setSearch(''); }}
                  style={{ padding: '10px 14px', fontSize: 13, color: (value === c.id) ? C.blue : C.white, background: (value === c.id) ? 'rgba(62,158,255,0.1)' : 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ fontWeight: (value === c.id) ? 700 : 500 }}>{c.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
