'use client';
import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Type, AlignLeft, Hash, IndianRupee, ToggleLeft, CalendarDays, CalendarClock,
  List, ListChecks, CircleDot, Globe, Mail, Phone, Camera, Paperclip, Link2,
  Calculator, MapPin, ChevronDown,
} from 'lucide-react';
import type { CustomField } from '../../../types/crm';
import { InlineIcon } from '../../ui/PageIcon';

type FieldType = CustomField['field_type'];
interface TypeMeta { type: FieldType; icon: LucideIcon; label: string }
interface TypeGroup { label: string; items: TypeMeta[] }

// Form-Builder-style grouping (see dashboard/form-builder's FIELD_GROUPS) so
// admins see the same visual language — icon tile + label, grouped by
// category — on both pages. One label per field_type lives here (not the
// settings page's TYPE_LABELS record) so this component is self-contained.
const FIELD_TYPE_GROUPS: TypeGroup[] = [
  { label: 'Basic', items: [
    { type: 'text', icon: Type, label: 'Text (single line)' },
    { type: 'longtext', icon: AlignLeft, label: 'Long text (paragraph)' },
    { type: 'number', icon: Hash, label: 'Number' },
    { type: 'currency', icon: IndianRupee, label: 'Currency (₹)' },
    { type: 'email', icon: Mail, label: 'Email' },
    { type: 'phone', icon: Phone, label: 'Phone (10-digit)' },
    { type: 'url', icon: Globe, label: 'URL' },
  ] },
  { label: 'Choice', items: [
    { type: 'select', icon: List, label: 'Dropdown (single)' },
    { type: 'multiselect', icon: ListChecks, label: 'Multi-select chips' },
    { type: 'radio', icon: CircleDot, label: 'Radio buttons' },
    { type: 'boolean', icon: ToggleLeft, label: 'Checkbox (yes / no)' },
  ] },
  { label: 'Date & Time', items: [
    { type: 'date', icon: CalendarDays, label: 'Date' },
    { type: 'datetime', icon: CalendarClock, label: 'Date & time' },
  ] },
  { label: 'Location', items: [
    { type: 'address', icon: MapPin, label: 'Address (Google Places)' },
  ] },
  { label: 'Media', items: [
    { type: 'image', icon: Camera, label: 'Photo / Camera' },
    { type: 'file', icon: Paperclip, label: 'File upload' },
  ] },
  { label: 'Advanced', items: [
    { type: 'lookup', icon: Link2, label: 'Linked record (lookup)' },
    { type: 'formula', icon: Calculator, label: 'Formula (computed)' },
  ] },
];
const ALL_TYPE_META = FIELD_TYPE_GROUPS.flatMap((g) => g.items);
const metaFor = (t: FieldType) => ALL_TYPE_META.find((m) => m.type === t);

/**
 * Grouped, icon-tile "Input Type" picker — the Form Builder look applied to
 * CRM custom fields. A trigger button (same footprint as the plain <select>
 * it replaces) opens a categorized panel; click a tile to pick, click away
 * or Esc to dismiss without changing anything.
 */
export default function FieldTypePicker({ value, onChange, types }: {
  value: FieldType;
  onChange: (t: FieldType) => void;
  /** Restrict the panel to only these types (an early-rollout subset). Defaults to every known type. */
  types?: FieldType[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, []);

  const allow = types ? new Set(types) : null;
  const groups = FIELD_TYPE_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !allow || allow.has(i.type)) }))
    .filter((g) => g.items.length > 0);
  const selected = metaFor(value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%', minHeight: 36, background: 'var(--field)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '0 11px', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
          boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left',
        }}
      >
        {selected && <InlineIcon icon={selected.icon} size={15} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? value}
        </span>
        <InlineIcon icon={ChevronDown} size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 1000,
            minWidth: 260, maxWidth: 320, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
            maxHeight: 360, overflowY: 'auto', boxShadow: 'var(--shadow-pop)', padding: 6,
          }}
        >
          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 8px 4px' }}>
                {g.label}
              </div>
              {g.items.map((item) => {
                const active = item.type === value;
                const Icon = item.icon;
                return (
                  <div
                    key={item.type}
                    role="option"
                    aria-selected={active}
                    onMouseDown={(e) => { e.preventDefault(); onChange(item.type); setOpen(false); }}
                    className="km-navrow"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 7, cursor: 'pointer',
                      background: active ? 'var(--s3)' : 'transparent',
                    }}
                  >
                    <span aria-hidden style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: active ? 'color-mix(in srgb, var(--primary) 16%, transparent)' : 'var(--s3)',
                      color: active ? 'var(--primary)' : 'var(--text-dim)',
                    }}>
                      <Icon size={14} strokeWidth={1.9} />
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: active ? 600 : 500 }}>{item.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
