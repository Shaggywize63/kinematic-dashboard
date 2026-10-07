'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface Props {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Shown when `options` is empty (e.g. no products added yet). */
  emptyHint?: string;
  loading?: boolean;
  id?: string;
}

/**
 * Type-ahead single-select over a list of strings — for long lists (crops,
 * products) where a native <select> is unusable. Keyboard: ↑/↓ move, Enter
 * picks, Esc closes. A stored value that is no longer in `options` (a product
 * renamed later) still shows, so editing a record never silently blanks it.
 *
 * Deliberately NOT rendered inside a <label>: a click on an option would be
 * forwarded to the input and reopen the list.
 */
export default function SearchableSelect({ options, value, onChange, placeholder = 'Search…', emptyHint, loading, id }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => { setActive(0); }, [query, open]);

  const pick = (v: string) => { onChange(v); setQuery(''); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(filtered.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (filtered[active] !== undefined) pick(filtered[active]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={open ? query : value}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={loading ? 'Loading…' : placeholder}
        autoComplete="off"
        className="km-input"
        style={{
          width: '100%', minHeight: 36, background: 'var(--field)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '7px 11px', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
          boxSizing: 'border-box', outline: 'none',
        }}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1000,
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
            maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow-pop)', padding: 4,
          }}
        >
          {value && (
            <div
              onMouseDown={(e) => { e.preventDefault(); pick(''); }}
              className="km-navrow"
              style={{ padding: '0 8px', height: 32, display: 'flex', alignItems: 'center', borderRadius: 6, fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}
            >
              — Clear —
            </div>
          )}
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-dim)' }}>
              {options.length === 0 ? (emptyHint || 'Nothing to choose from yet.') : `No results for “${query}”`}
            </div>
          ) : filtered.map((o, i) => (
            <div
              key={o}
              role="option"
              aria-selected={value === o}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              className="km-navrow"
              style={{
                padding: '0 8px', minHeight: 32, display: 'flex', alignItems: 'center', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                background: i === active ? 'var(--s3)' : 'transparent',
                color: 'var(--text)', fontWeight: value === o ? 600 : 500,
              }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
