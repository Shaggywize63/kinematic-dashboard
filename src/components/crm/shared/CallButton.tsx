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
}: Props) {
  const router = useRouter();
  const normalized = normalize(phone);
  if (!normalized) return null;
  const dim = size === 'sm' ? { pad: '4px 9px', fs: 11, ic: 12 } : { pad: '8px 14px', fs: 13, ic: 14 };

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Keep tel:<phone> as the href so right-click "Copy" / cmd-click /
    // assistive tech all see it as a phone link. We just additionally hop
    // into the composer afterwards.
    const params = new URLSearchParams();
    params.set('type', 'call');
    params.set('subject', prefillSubject);
    if (leadId) params.set('lead_id', leadId);
    if (contactId) params.set('contact_id', contactId);
    if (dealId) params.set('deal_id', dealId);
    if (accountId) params.set('account_id', accountId);
    // Tiny defer so the browser's tel: handler grabs the click first.
    window.setTimeout(() => router.push(`/dashboard/crm/activities/new?${params.toString()}`), 50);
    // Don't preventDefault — the browser must still handle tel:.
    void e;
  };

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
