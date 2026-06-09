'use client';
import { useEffect, useRef, useState } from 'react';
import { ActivityTypeIcon } from './ActivityTypeIcon';

export interface ActivityTypeOption {
  value: string;
  label: string;
  /** Emoji string from the backend. Ignored for whatsapp — we render the
   *  brand SVG via <ActivityTypeIcon> instead so the green heart never
   *  comes back. */
  icon?: string | null;
}

interface Props {
  value: string;
  options: ActivityTypeOption[];
  onChange: (next: string) => void;
  style?: React.CSSProperties;
}

/**
 * Activity-type dropdown that can render JSX inside each row. We can't
 * use a native <select> here because <option> elements are text-only,
 * which forced an emoji ("💚") to stand in for the WhatsApp brand mark
 * and looked like a heart. This component renders the real WhatsApp
 * SVG (via <ActivityTypeIcon>) for the whatsapp row and the regular
 * emoji for everything else.
 */
export default function ActivityTypePicker({ value, options, onChange, style }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'var(--s3)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <Glyph opt={current} />
        <span style={{ flex: 1 }}>{current?.label ?? '—'}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: 'var(--s2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            zIndex: 100,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: selected ? 'var(--primary)' : 'transparent',
                  color: selected ? '#fff' : 'var(--text)',
                  fontSize: 13,
                }}
                onMouseEnter={(e) => {
                  if (!selected) (e.currentTarget as HTMLLIElement).style.background = 'var(--s3)';
                }}
                onMouseLeave={(e) => {
                  if (!selected) (e.currentTarget as HTMLLIElement).style.background = 'transparent';
                }}
              >
                <Glyph opt={o} />
                <span>{o.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Glyph({ opt }: { opt: ActivityTypeOption | undefined }) {
  if (!opt) return null;
  // WhatsApp always uses the SVG brand mark — never an emoji. The
  // backend may also send an empty icon string for any type; in that
  // case fall back to the typed icon (which itself only renders text
  // for non-whatsapp types).
  if (opt.value === 'whatsapp') {
    return <ActivityTypeIcon type="whatsapp" size={16} />;
  }
  if (opt.icon) {
    return <span style={{ fontSize: 15, lineHeight: 1 }}>{opt.icon}</span>;
  }
  return <ActivityTypeIcon type={opt.value} size={16} />;
}
