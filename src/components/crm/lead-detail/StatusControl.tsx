'use client';
import { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LeadStatusOption } from '../../../lib/crmLeadStatuses';
import { Badge, T } from '../../ui';
import { menuItemStyle, menuPanelStyle, useDismiss } from './useDismiss';

export function statusTone(s: string): 'info' | 'ok' | 'warn' | 'red' | 'neutral' {
  return s === 'converted' || s === 'qualified' ? 'ok'
    : s === 'lost' || s === 'unqualified' ? 'red'
    : s === 'working' ? 'warn'
    : s === 'new' ? 'info'
    : 'neutral';
}

// Tint a custom status colour into a Badge style (faint wash background +
// solid foreground). Undefined when no colour is configured so the Badge keeps
// its tone-based styling.
export function customBadgeStyle(color?: string) {
  if (!color) return undefined;
  return { background: `color-mix(in srgb, ${color} 15%, transparent)`, color };
}

export function StatusPill({ status, color, label }: { status?: string | null; color?: string; label?: string }) {
  const s = (status || 'new').toLowerCase();
  return <Badge tone={statusTone(s)} dot style={{ textTransform: 'capitalize', ...customBadgeStyle(color) }}>{label ?? s.replace(/_/g, ' ')}</Badge>;
}

// The statuses the lead PATCH accepts (backend crm.validators → status enum).
// `converted` / `lost` are terminal outcomes reached via the dedicated Convert /
// Mark-lost flows (they capture a reason), so they are NOT offered here — when a
// lead is in one of those we fall back to a plain read-only pill.
export const SETTABLE_STATUSES = ['new', 'working', 'nurturing', 'qualified', 'unqualified'] as const;

/** Inline status switcher: shows the current status as a pill and, on click, a menu of the settable statuses. */
export default function StatusControl({ status, onChange, custom }: { status?: string | null; onChange: (next: string) => Promise<void>; custom?: LeadStatusOption[] | null }) {
  const s = (status || 'new').toLowerCase();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const currentCustom = custom?.find((o) => o.value === s) ?? null;

  // Terminal states keep the dedicated flows in charge — render read-only. For a
  // custom set, terminal = is_lost / is_won; otherwise the built-in rule.
  const isTerminal = custom
    ? !!(currentCustom?.is_lost || currentCustom?.is_won)
    : (s === 'converted' || s === 'lost');
  if (isTerminal) return <StatusPill status={s} color={currentCustom?.color} label={currentCustom?.label} />;

  const options: Array<{ value: string; label: string; color?: string }> = custom
    ? custom.filter((o) => !(o.is_lost || o.is_won)).map((o) => ({ value: o.value, label: o.label, color: o.color }))
    : SETTABLE_STATUSES.map((v) => ({ value: v, label: v.replace(/_/g, ' '), color: undefined }));

  const pick = async (next: string) => {
    setOpen(false);
    if (next === s) return;
    setSaving(true);
    try { await onChange(next); } finally { setSaving(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change status"
        className="km-chip"
        style={{ background: 'transparent', border: 'none', padding: 0, cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <Badge tone={statusTone(s)} dot style={{ textTransform: 'capitalize', ...customBadgeStyle(currentCustom?.color) }}>{currentCustom?.label ?? s.replace(/_/g, ' ')}</Badge>
        <ChevronDown size={13} strokeWidth={2} style={{ color: T.dim, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
      </button>
      {open && (
        <div role="listbox" style={{ ...menuPanelStyle, left: 0, minWidth: 176 }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === s}
              onClick={() => pick(opt.value)}
              className="km-navrow"
              style={{ ...menuItemStyle, textTransform: 'capitalize', background: opt.value === s ? T.raised : 'transparent' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color ?? (statusTone(opt.value) === 'neutral' ? 'var(--mute)' : `var(--${statusTone(opt.value)})`), flexShrink: 0 }} />
              {opt.label}
              {opt.value === s && <span style={{ marginLeft: 'auto', color: T.dim, fontSize: 11, textTransform: 'none' }}>current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
