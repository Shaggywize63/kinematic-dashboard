'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Input, labelStyle } from '../ui';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={labelStyle}>Alternate mobile numbers</div>
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {values.map((v, i) => (
            <span key={`${v}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0 6px 0 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-jetbrains)' }}>
              {v}
              <button type="button" onClick={() => remove(i)} aria-label={`Remove ${v}`} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={12} strokeWidth={2} /></button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          value={draft}
          invalid={!!error}
          onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="+91 98xxxxxxxx"
          inputMode="tel"
          style={{ width: 220 }}
        />
        <Button type="button" onClick={add}>Add</Button>
        {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
        The primary mobile is unique per organisation; alternates are extra reach numbers.
      </div>
    </div>
  );
}
