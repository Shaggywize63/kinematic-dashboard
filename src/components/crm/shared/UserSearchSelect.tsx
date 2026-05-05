'use client';
import { useState, useRef, useEffect } from 'react';

export type UserOption = { id: string; name: string };

interface Props {
  options: UserOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  style?: React.CSSProperties;
}

export default function UserSearchSelect({
  options, value, onChange,
  placeholder = 'Search user…',
  emptyLabel = 'Unassigned',
  style,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--s3)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    boxSizing: 'border-box',
  };

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        value={open ? query : (selected?.name || '')}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        style={inputStyle}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1000,
          background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        }}>
          <div
            onMouseDown={() => { onChange(''); setQuery(''); setOpen(false); }}
            style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
          >
            — {emptyLabel} —
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-dim)' }}>No results for "{query}"</div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.id}
                onMouseDown={() => { onChange(o.id); setQuery(''); setOpen(false); }}
                style={{
                  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  background: value === o.id ? 'var(--primary)' : 'transparent',
                  color: value === o.id ? '#fff' : 'var(--text)',
                }}
              >
                {o.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
