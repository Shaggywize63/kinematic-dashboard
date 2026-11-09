'use client';
// The "attach the receipt" control on a Finance expense bill: drop or choose a photo/PDF, see it attached,
// view, replace or remove it. The upload itself (and reading the amount off it) is done by the form that owns it.

import { useRef, useState } from 'react';
import { Eye, FileText, Upload, X } from 'lucide-react';
import { Button, IconButton, T } from '../ui';
import { RECEIPT_ACCEPT } from '../expenses/kit';

export interface ReceiptValue { url: string; view: string | null; name: string }

export function ReceiptField({ value, uploading, hint, onPick, onClear, onView }: {
  value: ReceiptValue | null; uploading: boolean; hint?: string; onPick: (f: File) => void; onClear: () => void; onView: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = (f?: File | null) => { if (f) onPick(f); };
  const hidden = (
    <input ref={input} type="file" accept={RECEIPT_ACCEPT} data-testid="receipt-input" aria-label="Receipt file" style={{ display: 'none' }}
      onChange={(e) => { pick(e.target.files?.[0]); e.currentTarget.value = ''; }} />
  );
  const isImg = !!value?.view && !/\.(pdf|heic|heif)(\?|#|$)/i.test(value.view);

  if (uploading) {
    return <div data-testid="receipt-uploading" style={{ padding: '14px 16px', border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.md, fontSize: 13.5, color: T.dim }}>Uploading the receipt and reading it…</div>;
  }
  if (value) {
    return (
      <div data-testid="receipt-attached" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: `1px solid ${T.border}`, borderRadius: T.radius.md, background: T.panel, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: T.radius.sm, overflow: 'hidden', background: T.raised, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mute }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {isImg ? <img src={value.view!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <FileText size={22} strokeWidth={1.5} />}
        </div>
        <div style={{ minWidth: 120, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name || 'Receipt'}</div>
          <div style={{ fontSize: 12, color: T.mute }}>Receipt attached</div>
        </div>
        {value.view && <Button size="sm" icon={<Eye size={14} strokeWidth={1.7} />} onClick={() => onView(value.view!)}>View</Button>}
        <Button size="sm" onClick={() => input.current?.click()}>Replace</Button>
        <IconButton label="Remove receipt" onClick={onClear}><X size={16} strokeWidth={1.6} /></IconButton>
        {hidden}
      </div>
    );
  }
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: T.radius.md, border: `1px dashed ${drag ? T.red : T.borderStrong}`, background: drag ? T.redWash : 'transparent', flexWrap: 'wrap' }}>
      <Upload size={20} strokeWidth={1.5} style={{ color: T.mute, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Attach the receipt</div>
        <div style={{ fontSize: 12.5, color: T.mute }}>{hint ?? 'Drop a photo or PDF here, up to 10 MB. We read the amount, vendor and GST for you.'}</div>
      </div>
      <Button size="sm" onClick={() => input.current?.click()}>Choose file</Button>
      {hidden}
    </div>
  );
}
