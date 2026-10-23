'use client';
import { useEffect, type RefObject } from 'react';

/** Close a popover on an outside press or Escape. Only listens while `open`. */
export function useDismiss(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, ref]);
}

export const menuPanelStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', zIndex: 200, minWidth: 200,
  background: 'var(--card)', border: '1px solid var(--border-l)', borderRadius: 10,
  boxShadow: 'var(--shadow-pop)', padding: 4,
};

export const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 9, minHeight: 34, padding: '0 10px', borderRadius: 7,
  background: 'transparent', border: 'none', color: 'var(--text)', textAlign: 'left', cursor: 'pointer',
  fontSize: 13, fontFamily: 'inherit',
};
