'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { industryColor } from '../../../lib/sparkIndustries';
import { inputStyle, T } from '../../ui';

/** A small coloured dot for an industry (decorative; the name is always rendered next to it). */
export function IndustryDot({ name, size = 9 }: { name?: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      data-testid="industry-dot"
      data-color={industryColor(name)}
      style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: industryColor(name), flexShrink: 0 }}
    />
  );
}

/** A coloured industry pill for the lead header / table. Renders nothing for a blank industry. */
export function IndustryBadge({ name, style }: { name?: string | null; style?: React.CSSProperties }) {
  const label = typeof name === 'string' ? name.trim() : '';
  if (!label) return null;
  const c = industryColor(label);
  return (
    <span
      data-testid="industry-badge"
      data-color={c}
      title={`Industry: ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', padding: '2px 9px', borderRadius: 999,
        fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap', color: c,
        background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 38%, transparent)`, ...style,
      }}
    >
      <IndustryDot name={label} size={7} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </span>
  );
}

/**
 * Industry dropdown with a coloured dot beside every option and the selected value (a native <select> cannot
 * colour its options). Keyboard: Enter / Space / ↓ open, ↑ ↓ move, Enter picks, Esc closes.
 */
export default function IndustrySelect({ id, value, options, onChange, required, blankLabel = '—' }: {
  id?: string; value: string; options: string[]; onChange: (v: string) => void; required?: boolean; blankLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rows = ['', ...options];
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const openList = () => { setActive(Math.max(0, rows.indexOf(value))); setOpen(true); };
  const pick = (v: string) => { onChange(v); setOpen(false); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (open) setActive((a) => Math.max(a - 1, 0)); }
    else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); pick(rows[active] ?? ''); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} data-testid="industry-select">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-required={required || undefined}
        className="km-input"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer', paddingRight: 32 }}
      >
        {value ? <IndustryDot name={value} /> : null}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: value ? T.text : T.mute }}>{value || blankLabel}</span>
        <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 60, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 280, overflowY: 'auto', boxShadow: 'var(--shadow-pop)', padding: 4, listStyle: 'none' }}
        >
          {rows.map((o, i) => (
            <li
              key={o || '__blank'}
              role="option"
              aria-selected={o === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', cursor: 'pointer', fontSize: 13.5, color: o ? T.text : T.mute, borderRadius: 6, background: i === active ? 'var(--s3)' : 'transparent', fontWeight: o === value ? 700 : 400 }}
            >
              {o ? <IndustryDot name={o} /> : <span style={{ width: 9, flexShrink: 0 }} />}
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o || blankLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
