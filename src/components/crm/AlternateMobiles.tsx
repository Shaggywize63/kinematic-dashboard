'use client';
import { useState } from 'react';

// Chip-based alternate-mobile input. The primary mobile/phone stays in its
// own dedicated field; this component manages the parallel array of extras
// (`alternate_mobiles text[]` on crm_leads / crm_contacts).

export default function AlternateMobiles({
  values,
  onChange,
  primary,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  /** When set, prevents the user from adding the primary number again. */
  primary?: string;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const normalise = (s: string) => s.replace(/\s+/g, '').trim();

  const add = () => {
    const v = normalise(draft);
    if (!v) return;
    if (v.length < 4) { setError('Too short'); return; }
    if (primary && normalise(primary) === v) { setError('Same as primary mobile'); return; }
    if (values.map(normalise).includes(v)) { setError('Already added'); return; }
    onChange([...values, v]);
    setDraft('');
    setError(null);
  };
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
        Alternate Mobile Numbers
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: values.length ? 36 : 0 }}>
        {values.map((v, i) => (
          <span key={`${v}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--s4)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px 4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
            {v}
            <button type="button" onClick={() => remove(i)} aria-label="Remove" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="+91 98xxxxxxxx"
          style={{ background: 'var(--s3)', border: `1px solid ${error ? '#E01E2C' : 'var(--border)'}`, color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 200 }}
        />
        <button type="button" onClick={add} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
        {error && <span style={{ fontSize: 11, color: '#E01E2C' }}>{error}</span>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
        The primary mobile is unique per organisation; alternates are extra reach numbers.
      </div>
    </div>
  );
}
