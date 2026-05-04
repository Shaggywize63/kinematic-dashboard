'use client';
import { useState } from 'react';

export default function TagInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--s3)' }}>
      {value.map((t) => (
        <span key={t} style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 999, fontSize: 12, display: 'inline-flex', gap: 6 }}>
          {t}
          <button onClick={() => onChange(value.filter((x) => x !== t))} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}>×</button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="Add tag..."
        style={{ flex: 1, minWidth: 80, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13 }}
      />
    </div>
  );
}
