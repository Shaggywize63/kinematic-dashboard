'use client';

/**
 * DPDP §5 (notice) + §6 (consent) affordance for personal-data collection forms.
 *
 * Renders a short at-collection notice (linking the full Privacy Notice) plus an
 * affirmative consent control. The captured value is sent to the backend as the
 * lead-create `_consent` block and recorded in the crm_consents ledger. Reusable
 * across the lead/contact create forms (and the pattern the iOS/Android apps mirror).
 */

// Bump when the notice wording materially changes; persisted with each consent
// event so we can prove which notice the individual was shown.
export const NOTICE_VERSION = '2026-07-22';

export function DataCollectionConsent({
  checked,
  onChange,
  required = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        background: 'var(--s3)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        We collect this person&rsquo;s name, contact details and the information entered
        here to create and manage their record and to contact them, as described in our{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent, #2563eb)', textDecoration: 'underline' }}
        >
          Privacy Notice
        </a>
        . They may access, correct or erase their data, or raise a grievance, at any time.
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          The individual has been shown this notice and <strong>consents</strong> to the
          collection and processing of their personal data
          {required ? <span style={{ color: 'var(--danger, #dc2626)' }}> *</span> : null}.
        </span>
      </label>
    </div>
  );
}
