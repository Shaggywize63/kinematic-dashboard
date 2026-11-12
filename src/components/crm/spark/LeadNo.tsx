'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { T } from '../../ui';
import { copyToClipboard } from '../shared/CopyButton';

/**
 * A lead's reference number (e.g. SR/LD/2627-12) in monospace, optionally with a copy button.
 * Renders nothing for a lead without one, so callers never need their own empty check.
 */
export default function LeadNo({ value, copy = false, style, testId = 'lead-no' }: {
  value?: string | null; copy?: boolean; style?: React.CSSProperties; testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = (value || '').trim();
  if (!text) return null;
  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (await copyToClipboard(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, ...style }}>
      <span data-testid={testId} style={{ fontFamily: T.mono, fontSize: 12.5, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>{text}</span>
      {copy && (
        <button
          type="button"
          onClick={onCopy}
          title={copied ? 'Copied' : 'Copy lead number'}
          aria-label={copied ? 'Copied' : 'Copy lead number'}
          data-testid={`${testId}-copy`}
          className="km-iconbtn"
          style={{ width: 22, height: 22, padding: 0, border: `1px solid ${T.border}`, borderRadius: 6, background: 'var(--s3)', color: copied ? T.ok : T.dim, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          {copied ? <Check size={12} strokeWidth={2.4} aria-hidden /> : <Copy size={12} strokeWidth={2} aria-hidden />}
        </button>
      )}
    </span>
  );
}
