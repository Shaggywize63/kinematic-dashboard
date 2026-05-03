'use client';
import { useState } from 'react';

interface Props {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  placeholder?: string;
  multiline?: boolean;
}

export default function InlineEditField({ value, onSave, placeholder, multiline }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (draft === value) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(draft); setEditing(false); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{ cursor: 'pointer', borderBottom: '1px dashed var(--border-l)', color: value ? 'var(--text)' : 'var(--text-dim)' }}
      >
        {value || placeholder || 'Click to edit'}
      </span>
    );
  }

  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      value={draft}
      onChange={(e: any) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e: any) => { if (e.key === 'Enter' && !multiline) save(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
      autoFocus
      disabled={busy}
      style={{
        background: 'var(--s3)', border: '1px solid var(--border-l)', color: 'var(--text)',
        padding: '6px 10px', borderRadius: 6, fontSize: 13, width: multiline ? '100%' : 'auto',
        minHeight: multiline ? 60 : undefined, fontFamily: 'inherit',
      }}
    />
  );
}
