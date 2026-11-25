import type { Metadata } from 'next';

/**
 * Public "User Data Deletion" instructions page.
 *
 * Required by Meta/Facebook App Review (Settings → Basic → User Data
 * Deletion) and good practice for GDPR Art. 17 / DPDP §12 erasure. Like
 * the privacy page it is a plain public server component with NO auth
 * gate — Meta's reviewer and any data principal must reach it without a
 * session. Keep its contact details + timelines in sync with
 * `src/app/privacy/page.tsx` and the backend compliance pack.
 */

export const metadata: Metadata = {
  title: 'Data Deletion — Kinematic',
  description:
    'How to request deletion of your personal data from the Kinematic CRM / field-force platform, including data received through Facebook / Meta Lead Ads.',
  alternates: { canonical: 'https://kinematicapp.com/data-deletion' },
  robots: { index: false, follow: true },
};

export const dynamic = 'force-static';

const EFFECTIVE = '25 November 2026';
const ENTITY = 'Kaiyo Technology Labs';
const ADDRESS =
  'F-2587, 4th Floor, Ansal Esencia, Sector 67, Gurugram, Haryana 122101, India';
const OFFICER = 'Sagar Bhargava';
const EMAIL = 's@kinematicapp.com';
const PHONE = '8802274880';
const SUBJECT = 'Data deletion request';

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'var(--font-inter)',
  padding: '48px 20px 96px',
  lineHeight: 1.6,
};
const shell: React.CSSProperties = { maxWidth: 820, margin: '0 auto' };
const h1: React.CSSProperties = {
  fontFamily: 'var(--font-manrope)',
  fontSize: 32,
  fontWeight: 800,
  margin: '0 0 6px',
  letterSpacing: '-0.02em',
};
const h2: React.CSSProperties = {
  fontFamily: 'var(--font-manrope)',
  fontSize: 20,
  fontWeight: 700,
  margin: '40px 0 10px',
  letterSpacing: '-0.01em',
};
const muted: React.CSSProperties = { color: 'var(--text-dim)', fontSize: 14 };
const p: React.CSSProperties = { margin: '0 0 12px' };
const link: React.CSSProperties = { color: 'var(--accent)', textDecoration: 'underline' };
const box: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '16px 18px',
  margin: '8px 0 4px',
  background: 'var(--k-stone, rgba(127,127,127,0.06))',
};

export default function DataDeletionPage() {
  return (
    <main style={page}>
      <div style={shell}>
        <p style={{ ...muted, marginBottom: 20 }}>
          <a href="/login" style={link}>
            &larr; Kinematic
          </a>
        </p>

        <h1 style={h1}>Data Deletion</h1>
        <p style={muted}>
          Effective {EFFECTIVE}. Operated by <strong>{ENTITY}</strong>, {ADDRESS}.
        </p>

        <p style={{ ...p, marginTop: 20 }}>
          This page explains how to request deletion of your personal data held in the
          Kinematic CRM / field-force platform (the &ldquo;Service&rdquo;), including any
          data we received about you through <strong>Facebook / Meta Lead Ads</strong>.
          You can ask us to delete your data at any time, free of charge.
        </p>

        <h2 style={h2}>How to request deletion</h2>
        <p style={p}>
          Email our Grievance Officer with the subject line{' '}
          <strong>&ldquo;{SUBJECT}&rdquo;</strong>:
        </p>
        <div style={box}>
          <p style={{ ...p, marginBottom: 6 }}>
            <strong>{OFFICER}</strong>, Grievance Officer
          </p>
          <p style={{ ...p, marginBottom: 6 }}>
            Email:{' '}
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent(SUBJECT)}`}
              style={link}
            >
              {EMAIL}
            </a>
          </p>
          <p style={{ ...p, marginBottom: 0 }}>Phone: {PHONE}</p>
        </div>
        <p style={{ ...p, marginTop: 14 }}>Please include, so we can locate and verify your record:</p>
        <ul>
          <li>The <strong>name</strong> you used, and the <strong>email and/or phone number</strong> on your record.</li>
          <li>
            If known, the <strong>Facebook lead form or ad</strong> you responded to (or the
            business you were contacting through Kinematic).
          </li>
          <li>A short line confirming you are the person whose data you want deleted.</li>
        </ul>

        <h2 style={h2}>What happens next</h2>
        <ul>
          <li>We verify your identity first, to protect your data from wrongful deletion.</li>
          <li>
            We delete or irreversibly anonymise your personal data within{' '}
            <strong>30 days</strong> of a verified request. Records placed in soft-delete are
            purged no later than <strong>90 days</strong> after deletion.
          </li>
          <li>
            We may retain the minimum data required by law (for example, tax or audit
            records) for the legally mandated period, and keep an anonymised record that the
            request was actioned.
          </li>
          <li>We confirm by email once the deletion is complete.</li>
        </ul>

        <h2 style={h2}>If your data was collected by a business using Kinematic</h2>
        <p style={p}>
          For CRM lead / contact data, our business customer (the company whose ad or form
          you responded to) is usually the <strong>data controller / data fiduciary</strong>
          and {ENTITY} acts as a <strong>processor</strong> on their instructions. We will
          action your request directly and, where required, coordinate with that business.
          You may also contact them to exercise your rights.
        </p>

        <h2 style={h2}>Facebook / Meta Lead Ads</h2>
        <p style={p}>
          Where you submitted a Facebook or Instagram lead form and that lead was delivered
          to a business through Kinematic, the process above deletes the copy held in the
          Service. Deletion in Kinematic does not remove data held by Meta itself — to
          delete data held by Facebook, use the controls in your{' '}
          <a
            href="https://www.facebook.com/settings"
            style={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook account settings
          </a>
          .
        </p>

        <p style={{ ...p, marginTop: 20 }}>
          For more on how we handle personal data, see our{' '}
          <a href="/privacy" style={link}>Privacy Policy</a>.
        </p>

        <p style={{ ...muted, marginTop: 32 }}>
          © {ENTITY}. Last updated {EFFECTIVE}.
        </p>
      </div>
    </main>
  );
}
