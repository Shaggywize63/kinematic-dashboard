'use client';
import { useState } from 'react';

interface Props {
  /** The text to copy (e.g. a mobile number). */
  value?: string | null;
  size?: 'sm' | 'md';
  /** Pill label; defaults to "Copy". */
  label?: string;
  /** Hover / aria text, e.g. "Copy mobile number". */
  title?: string;
}

/**
 * Neutral "copy to clipboard" pill — part of the action-pill family that sits
 * next to a phone number (Call / WhatsApp). Copies `value`, shows a brief
 * "Copied" state, and hides itself when there's nothing to copy. Falls back to
 * the legacy execCommand path when the async Clipboard API is unavailable
 * (insecure context / older browsers), so it works wherever the dashboard runs.
 */
export default function CopyButton({ value, size = 'sm', label, title = 'Copy' }: Props) {
  const [copied, setCopied] = useState(false);
  const text = (value || '').trim();
  if (!text) return null;
  const dim = size === 'sm' ? { pad: '4px 9px', fs: 11, ic: 12 } : { pad: '8px 14px', fs: 13, ic: 14 };

  const onClick = async () => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={copied ? 'Copied' : title}
      aria-label={copied ? 'Copied' : title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: dim.pad,
        background: 'var(--s3)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 7,
        fontSize: dim.fs,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}
    >
      {copied ? (
        <svg width={dim.ic} height={dim.ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width={dim.ic} height={dim.ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      )}
      {copied ? 'Copied' : (label ?? 'Copy')}
    </button>
  );
}

/** Copy to clipboard with a legacy fallback. Returns true on success. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
