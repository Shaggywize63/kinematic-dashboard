'use client';
import { useState } from 'react';
import type { ViewMode } from '../../../lib/crmViewPrefs';

export interface ColumnDef {
  key: string;
  label: string;
  /** Required columns (e.g. the Name link) cannot be hidden. */
  locked?: boolean;
}

interface Props {
  entityLabel: string;
  columns: ColumnDef[];
  hidden: string[];
  mode: ViewMode;
  onToggle: (key: string) => void;
  onSetMode: (mode: ViewMode) => void;
  onReset: () => void;
}

/**
 * Customize-view trigger + popover. Lets the user pick which columns
 * appear on the list and switch between a dense table view and a card
 * stack. Per-entity, per-client; persisted to localStorage via the
 * `useViewPrefs` hook.
 *
 * Responsive: on phones (≤640px, via a media query in globals.css) the
 * popover snaps to a full-width bottom sheet so it never clips off the
 * edge of the viewport.
 */
export default function ViewCustomizer({ entityLabel, columns, hidden, mode, onToggle, onSetMode, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const hiddenSet = new Set(hidden);
  const visibleCount = columns.filter((c) => !hiddenSet.has(c.key)).length;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Customize columns and layout for ${entityLabel}`}
        className="crm-view-customizer-trigger"
        style={{
          background: 'var(--s3)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '8px 14px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        ⚙ <span className="crm-view-customizer-trigger-label">Customize</span> ({visibleCount}/{columns.length})
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="crm-view-customizer-scrim"
            style={{ position: 'fixed', inset: 0, zIndex: 990 }}
          />
          <div
            className="crm-view-customizer-popover"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              minWidth: 280,
              maxWidth: 360,
              background: 'var(--s2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
              padding: 14,
              zIndex: 991,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>Layout</div>
            <div style={{ display: 'inline-flex', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, marginBottom: 14 }}>
              {(['table', 'cards'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSetMode(m)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: mode === m ? 'var(--primary)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--text-dim)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {m === 'table' ? '☰ Table' : '▦ Cards'}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>Columns</div>
            <div className="crm-view-customizer-list" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {columns.map((col) => {
                const visible = !hiddenSet.has(col.key);
                const disabled = !!col.locked;
                return (
                  <label
                    key={col.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 6,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.55 : 1,
                      background: visible ? 'var(--s3)' : 'transparent',
                      minHeight: 36,
                    }}
                    title={disabled ? 'This column cannot be hidden' : ''}
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={disabled}
                      onChange={() => !disabled && onToggle(col.key)}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14, color: 'var(--text)' }}>{col.label}</span>
                    {disabled && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>required</span>}
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={onReset}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Reset to defaults
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
