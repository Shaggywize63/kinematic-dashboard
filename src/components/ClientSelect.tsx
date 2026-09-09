'use client';
import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import api from '../lib/api';

interface Client { id: string; name: string; }

/**
 * Client picker. Two looks, one behaviour:
 *   - `field` (default) — a 36px input-style trigger for forms and filter bars.
 *   - `chip`            — the 28px pill used in the dashboard header scope row.
 */
export default function ClientSelect({ value, onChange, placeholder = 'Select client…', variant = 'field' }: {
  value: string; onChange: (id: string, name: string) => void; placeholder?: string; variant?: 'field' | 'chip';
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // noCache: bypass the SWR cache so a new client added in another tab/session
    // shows up on next picker open without a hard reload.
    api.get('/api/v1/misc/clients', { noCache: true } as RequestInit & { noCache?: boolean }).then((res: any) => {
      const d = Array.isArray(res?.data) ? res.data : [];
      setClients(d);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, []);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const selectedObj = clients.find((c) => c.id === value || c.name === value);
  const label = selectedObj ? selectedObj.name : (value ? placeholder : 'All clients');
  const chip = variant === 'chip';

  return (
    <div ref={ref} style={{ position: 'relative', width: chip ? 'auto' : '100%' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter by client"
        className={chip ? 'km-chip' : 'km-input'}
        style={chip ? {
          height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--card)',
          fontSize: 12.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 220,
          color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        } : {
          width: '100%', height: 36, background: 'var(--field)', border: '1px solid var(--border)', color: value ? 'var(--text)' : 'var(--text-mute)',
          borderRadius: 6, padding: '0 11px', fontSize: 14, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        {chip && <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: value ? 'var(--ok)' : 'var(--text-mute)', flexShrink: 0 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
        <ChevronDown size={14} strokeWidth={1.6} style={{ color: 'var(--text-mute)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 6px)', ...(chip ? { right: 0, width: 260 } : { left: 0, right: 0 }),
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', zIndex: 100, boxShadow: 'var(--shadow-pop)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <Search size={14} strokeWidth={1.6} style={{ color: 'var(--text-mute)', flexShrink: 0 }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients"
              aria-label="Search clients"
              style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', padding: 0 }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            {/* "All clients" row — clears the filter so org-admins see cross-client data. */}
            <Row selected={!value} onClick={() => { onChange('', ''); setOpen(false); setSearch(''); }} sub="Org-wide view">
              All clients
            </Row>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-dim)', textAlign: 'center' }}>No clients found</div>
            ) : filtered.map((c) => (
              <Row key={c.id} selected={value === c.id} onClick={() => { onChange(c.id, c.name); setOpen(false); setSearch(''); }}>
                {c.name}
              </Row>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ selected, onClick, children, sub }: { selected: boolean; onClick: () => void; children: React.ReactNode; sub?: string }) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="km-navrow"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', height: 32, borderRadius: 6, fontSize: 13, cursor: 'pointer',
        color: 'var(--text)', background: selected ? 'var(--s3)' : 'transparent', fontWeight: selected ? 600 : 500,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--text-mute)', flexShrink: 0 }}>{sub}</span>}
      {selected && <Check size={14} strokeWidth={1.8} style={{ color: 'var(--info)', flexShrink: 0 }} />}
    </div>
  );
}
