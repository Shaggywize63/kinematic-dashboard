'use client';
import { useRef } from 'react';
import { T } from '../../ui';
import type { LeadTab } from './types';

export interface TabDef { id: LeadTab; label: string; count?: number }

/** Accessible tab strip (roving tabindex, arrow keys, Home / End). Panels are rendered by the page. */
export default function LeadTabs({ tabs, active, onChange }: { tabs: TabDef[]; active: LeadTab; onChange: (t: LeadTab) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  };

  return (
    <div role="tablist" aria-label="Lead sections" onKeyDown={onKeyDown} style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`lead-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`lead-panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className="ld-tab"
            style={{
              position: 'relative', height: 40, padding: '0 14px', border: 0, background: 'transparent', fontFamily: 'inherit',
              fontSize: 13.5, fontWeight: 600, color: on ? T.text : T.dim, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
              borderBottom: `2px solid ${on ? T.red : 'transparent'}`, marginBottom: -1, transition: 'color .12s ease, border-color .12s ease',
            }}
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span style={{ minWidth: 20, height: 18, padding: '0 6px', borderRadius: 999, background: on ? T.redWash : 'var(--s3)', color: on ? T.red : T.mute, fontSize: 11, fontWeight: 700, fontFamily: T.mono, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
