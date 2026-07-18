'use client';
import React, { useState } from 'react';

interface Props {
  /** Current value shown when idle and seeded into the input on edit. */
  value: string;
  /** Persist the new value (PATCH one field). Throw to keep the editor open. */
  onSave: (next: string) => Promise<void>;
  displayStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
  /** Input type (text / email / tel …). */
  type?: string;
}

/**
 * Click-to-edit a single field in place. Idle: shows the value with a small
 * pencil; click it (or the value) → an input with ✓ / ✕. Enter saves, Esc
 * cancels. Saves ONLY this field via `onSave` — no full edit popup.
 */
export default function InlineEditText({
  value, onSave, displayStyle, inputStyle, placeholder, ariaLabel, type = 'text',
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  const start = () => { setDraft(value ?? ''); setEditing(true); };
  const cancel = () => { setEditing(false); setDraft(value ?? ''); };
  const commit = async () => {
    const next = draft.trim();
    if (next === (value ?? '').trim()) { setEditing(false); return; }
    setBusy(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      /* onSave surfaces its own error toast; keep the editor open to retry */
    } finally {
      setBusy(false);
    }
  };

  const iconBtn = (color: string): React.CSSProperties => ({
    background: 'transparent', border: 'none', color, cursor: busy ? 'wait' : 'pointer',
    padding: 2, fontSize: 15, lineHeight: 1, display: 'inline-flex', alignItems: 'center',
  });

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') cancel(); }}
          placeholder={placeholder}
          disabled={busy}
          style={{ background: 'var(--s3)', border: '1px solid var(--primary)', color: 'var(--text)', padding: '4px 8px', borderRadius: 6, font: 'inherit', minWidth: 120, ...inputStyle }}
        />
        <button type="button" onClick={commit} disabled={busy} title="Save (Enter)" aria-label="Save" style={iconBtn('var(--primary)')}>✓</button>
        <button type="button" onClick={cancel} disabled={busy} title="Cancel (Esc)" aria-label="Cancel" style={iconBtn('var(--text-dim)')}>✕</button>
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={displayStyle} onDoubleClick={start}>{value || placeholder || '—'}</span>
      <button
        type="button"
        onClick={start}
        aria-label={ariaLabel || 'Edit'}
        title={ariaLabel || 'Edit'}
        style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--primary)', lineHeight: 0, flexShrink: 0, opacity: 0.75 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </button>
    </span>
  );
}
