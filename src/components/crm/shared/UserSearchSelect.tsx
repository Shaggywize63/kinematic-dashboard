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
    width: '100%', height: 36, background: 'var(--field)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0 11px', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        value={open ? query : (selected?.name || '')}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        className="km-input"
        style={inputStyle}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1000,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
          maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow-pop)', padding: 4,
        }}>
          <div
            onMouseDown={() => { onChange(''); setQuery(''); setOpen(false); }}
            className="km-navrow"
            style={{ padding: '0 8px', height: 32, display: 'flex', alignItems: 'center', borderRadius: 6, fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}
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
                className="km-navrow"
                style={{
                  padding: '0 8px', height: 32, display: 'flex', alignItems: 'center', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                  background: value === o.id ? 'var(--s3)' : 'transparent',
                  color: 'var(--text)', fontWeight: value === o.id ? 600 : 500,
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
