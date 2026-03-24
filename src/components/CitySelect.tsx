'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

const C = {
  s3: '#131B2A', border: '#1E2D45', white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  blue: '#3E9EFF', red: '#E01E2C', bg: '#070D18'
};

interface City { id: string; name: string; state?: string; is_active: boolean; }

export default function CitySelect({ value, onChange, placeholder = "Select City..." }: { value: string, onChange: (val: string, obj: City) => void, placeholder?: string }) {
  const [cities, setCities] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Note: uses `api.get` from standard Kinematic api wrapper
    api.get('/api/v1/cities').then((res: any) => {
      const d = Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      // Only show active cities in dropdown
      setCities(d.filter((c: City) => c.is_active));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const click = (e: MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);

  const filtered = cities.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.state||'').toLowerCase().includes(search.toLowerCase()));
  const selectedObj = cities.find(c => c.name === value || c.id === value) || (value ? { id: value, name: value, state: '', is_active: true } : null);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ width:'100%', background:C.s3, border:`1.5px solid ${open ? C.blue : C.border}`, color: value ? C.white : C.grayd, borderRadius:11, padding:'10px 13px', fontSize:13, outline:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
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
              placeholder="Search cities or states..."
              style={{ width: '100%', background: 'transparent', border: 'none', color: C.white, fontSize: 13, outline: 'none', fontFamily:"'DM Sans',sans-serif" }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px', fontSize: 12, color: C.gray, textAlign: 'center' }}>No active cities found</div>
            ) : (
              filtered.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => { onChange(c.name, c); setOpen(false); setSearch(''); }}
                  style={{ padding: '10px 14px', fontSize: 13, color: (value === c.name || value === c.id) ? C.blue : C.white, background: (value === c.name || value === c.id) ? C.bg : 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = (value === c.name || value === c.id) ? C.bg : 'transparent'}
                >
                  <span style={{ fontWeight: (value === c.name || value === c.id) ? 700 : 500 }}>{c.name}</span>
                  {c.state && <span style={{ fontSize: 11, color: C.gray }}>{c.state}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
