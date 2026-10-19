'use client';
import { useRouter } from 'next/navigation';

interface Props {
  phone?: string | null;
  /** Subject the activity composer should open with. */
  prefillSubject: string;
  /** Optional entity binding so the saved activity attaches to the right
   *  parent record. Exactly one of these should be set. */
  leadId?: string;
  contactId?: string;
  dealId?: string;
  accountId?: string;
  size?: 'sm' | 'md';
  label?: string;
  /** Compact square icon (row hover actions); same dial + log-the-call behaviour. */
  iconOnly?: boolean;
}

/**
 * Blue Call pill. Click does two things in one gesture:
 *   1. Opens tel:<normalized phone> via window.location so the mobile
 *      dialer (or registered desktop handler — Skype, FaceTime, etc.) takes
 *      the dial. Browsers that ignore tel: just stay on the page; the
 *      router push below still fires, so the rep is never left stranded.
 *   2. Navigates to /dashboard/crm/activities/new with the type, subject,
 *      and parent IDs pre-filled — same exact composer prefill scheme the
 *      mobile apps now use. So no matter the surface, a call lands the rep
 *      on the same "log the call" form already populated.
 */
export default function CallButton({
  phone,
  prefillSubject,
  leadId,
  contactId,
  dealId,
  accountId,
  size = 'sm',
  label,
  iconOnly = false,
}: Props) {
  const router = useRouter();
  const normalized = normalize(phone);
  if (!normalized) return null;
  const dim = size === 'sm' ? { pad: '4px 9px', fs: 11, ic: 12 } : { pad: '8px 14px', fs: 13, ic: 14 };

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Keep tel:<phone> as the href so right-click "Copy" / cmd-click /
    // assistive tech all see it as a phone link. We just additionally hop
    // into the composer afterwards.
    const url = callComposerUrl({ subject: prefillSubject, leadId, contactId, dealId, accountId });
    // Tiny defer so the browser's tel: handler grabs the click first.
    window.setTimeout(() => router.push(url), 50);
    // Don't preventDefault — the browser must still handle tel:.
    void e;
  };

  if (iconOnly) {
    return (
      <a
        href={`tel:${normalized}`}
        onClick={onClick}
        title="Call and log the activity"
        aria-label="Call"
        className="km-iconbtn"
        style={{
          width: 28, height: 28, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ok)', textDecoration: 'none',
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
        </svg>
      </a>
    );
  }

  return (
    <a
      href={`tel:${normalized}`}
      onClick={onClick}
      title="Call and log the activity"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: dim.pad,
        background: '#1A8CF1',
        color: '#fff',
        borderRadius: 7,
        fontSize: dim.fs,
        fontWeight: 700,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <svg width={dim.ic} height={dim.ic} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
      </svg>
      {label ?? 'Call'}
    </a>
  );
}

/** The "log this call" composer, pre-filled for the record the call was made from. */
export function callComposerUrl(o: { subject: string; leadId?: string; contactId?: string; dealId?: string; accountId?: string }): string {
  const params = new URLSearchParams();
  params.set('type', 'call');
  params.set('subject', o.subject);
  if (o.leadId) params.set('lead_id', o.leadId);
  if (o.contactId) params.set('contact_id', o.contactId);
  if (o.dealId) params.set('deal_id', o.dealId);
  if (o.accountId) params.set('account_id', o.accountId);
  return `/dashboard/crm/activities/new?${params.toString()}`;
}

/** Digits-only (keeps a leading +) dial string, or null when there is no plausible number. */
export function dialableNumber(phone?: string | null): string | null {
  return normalize(phone);
}

/**
 * Strip whitespace/dashes/parens. Keep leading + and digits. Returns null
 * if there's no plausible phone number so the button can hide itself.
 */
function normalize(phone?: string | null): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  if (!raw) return null;
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (i === 0 && ch === '+') out += ch;
    else if (ch >= '0' && ch <= '9') out += ch;
  }
  const digits = out.replace(/\+/g, '').length;
  return digits >= 4 ? out : null;
}
