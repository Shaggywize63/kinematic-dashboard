'use client';
// Logo picker for Finance Settings: upload a PNG/JPEG (auto-trimmed and downsized, stored inline) or paste an https link.

import { useRef, useState } from 'react';
import { Button, Field, Input, T } from '../ui';
import { LOGO_DATA_URL, prepareLogo } from '../../lib/imageLogo';

export default function LogoUpload({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const uploaded = LOGO_DATA_URL.test(value);
  const hasLogo = value.trim().length > 0;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setProblem(null);
    try { onChange(await prepareLogo(file)); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Could not use that image.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <Field label="Logo" htmlFor="fs-logo_url" error={problem ?? error}
      hint="PNG or JPEG. Extra white space around it is trimmed automatically. It appears on the invoice, the PDF and the customer link.">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div aria-label="Logo preview" style={{ width: 200, height: 64, display: 'grid', placeItems: 'center', background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.radius.sm, overflow: 'hidden', flexShrink: 0 }}>
          {hasLogo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="Current logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 12, color: '#6b7280' }}>No logo</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} id="fs-logo_url" type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={(e) => void pick(e.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Processing…' : hasLogo ? 'Replace logo' : 'Upload logo'}</Button>
          {hasLogo && <Button variant="ghost" onClick={() => { onChange(''); setProblem(null); }}>Remove</Button>}
        </div>
      </div>
      {!uploaded && (
        <Input aria-label="Logo image link" value={value} onChange={(e) => { onChange(e.target.value); setProblem(null); }} placeholder="Or paste an https:// image link" maxLength={1000} inputMode="url" style={{ marginTop: 8 }} />
      )}
    </Field>
  );
}
