'use client';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { T } from '../../ui';
import { menuItemStyle, menuPanelStyle, useDismiss } from './useDismiss';

export interface RowMenuItem { label: string; icon?: ReactNode; danger?: boolean; onClick: () => void }

/** Small "⋯" overflow menu for a timeline row. */
export default function RowMenu({ items, label = 'More actions' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  if (items.length === 0) return null;
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="km-iconbtn"
        style={{ width: 28, height: 28, padding: 0, borderRadius: 6, border: 0, background: open ? 'var(--s3)' : 'transparent', color: T.mute, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <MoreHorizontal size={16} strokeWidth={1.8} />
      </button>
      {open && (
        <div role="menu" style={{ ...menuPanelStyle, right: 0, minWidth: 168 }}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="km-navrow"
              onClick={() => { setOpen(false); it.onClick(); }}
              style={{ ...menuItemStyle, color: it.danger ? T.red : T.text }}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
