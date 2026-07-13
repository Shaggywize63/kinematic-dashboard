import type { Metadata } from 'next';

/**
 * Public privacy / data-protection page.
 *
 * Deliberately a plain server component with NO auth gate — it must be
 * reachable by leads, field staff and the general public without a
 * session (the DPDP §5 collection notice and GDPR Art. 13/14 notice
 * link here). There is no Next middleware gating routes in this app, so
 * this page is public by virtue of not calling any session guard.
 *
 * Content mirrors the reviewed compliance pack in the backend repo
 * (`compliance/PRIVACY_POLICY.md`, `DPDP_NOTICE.md`, `SUBPROCESSORS.md`).
 * Keep the two in sync when either changes.
 *
 * Styling uses the app's theme CSS variables (--bg, --text, --border …)
 * so the page follows the visitor's light/dark preference like the rest
 * of the dashboard. No auth, no data fetch — safe to statically render.
 */

export const metadata: Metadata = {
  title: 'Privacy Policy — Kinematic',
  description:
    'How Kaiyo Technology Labs collects, uses, shares and protects personal data through the Kinematic CRM / field-force platform, and the rights you have under GDPR and India’s DPDP Act, 2023.',
};

// Static legal content — safe to pre-render at build time.
export const dynamic = 'force-static';

const EFFECTIVE = '13 July 2026';
const ENTITY = 'Kaiyo Technology Labs';
const ADDRESS =
  'F-2587, 4th Floor, Ansal Esencia, Sector 67, Gurugram, Haryana 122101, India';
const OFFICER = 'Sagar Bhargava';
const EMAIL = 's@kinematicapp.com';
const PHONE = '8802274880';

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
const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
  margin: '8px 0 4px',
};
const cell: React.CSSProperties = {
  border: '1px solid var(--border)',
  padding: '8px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
};
const th: React.CSSProperties = {
  ...cell,
  fontWeight: 700,
  background: 'var(--k-stone, rgba(127,127,127,0.06))',
};
const scrollX: React.CSSProperties = { overflowX: 'auto', maxWidth: '100%' };
const link: React.CSSProperties = { color: 'var(--accent)', textDecoration: 'underline' };

export default function PrivacyPage() {
  return (
    <main style={page}>
      <div style={shell}>
        <p style={{ ...muted, marginBottom: 20 }}>
          <a href="/login" style={link}>
            &larr; Kinematic
          </a>
        </p>

        <h1 style={h1}>Privacy Policy</h1>
        <p style={muted}>
          Effective {EFFECTIVE}. Controller: <strong>{ENTITY}</strong>, {ADDRESS}.
        </p>

        <p style={{ ...p, marginTop: 20 }}>
          This policy explains how {ENTITY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;)
          collects, uses, shares, and protects personal data through the Kinematic
          CRM / field-force platform (the &ldquo;Service&rdquo;), and the rights you
          have. It is written to satisfy the EU{' '}
          <strong>General Data Protection Regulation (GDPR)</strong> and India&rsquo;s{' '}
          <strong>Digital Personal Data Protection Act, 2023 (DPDP)</strong>.
        </p>

        <h2 style={h2}>1. Who this policy covers</h2>
        <ul>
          <li>
            <strong>Customers / prospects (&ldquo;leads&rdquo; and &ldquo;contacts&rdquo;)</strong>{' '}
            whose details are recorded in the CRM by our business customers&rsquo; staff.
          </li>
          <li>
            <strong>Field staff / employees</strong> of our business customers who use
            the mobile apps (attendance, location tracking, activity capture).
          </li>
          <li>
            <strong>Website / dashboard users.</strong>
          </li>
        </ul>
        <p style={p}>
          For CRM lead/contact data, our business customer is typically the{' '}
          <strong>data controller / data fiduciary</strong> and we act as a{' '}
          <strong>processor / data processor</strong> on their instructions (see the
          Data Processing Agreement). For our own account and website data we are the
          controller.
        </p>

        <h2 style={h2}>2. Personal data we process</h2>
        <div style={scrollX}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Category</th>
                <th style={th}>Examples</th>
                <th style={th}>Source</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cell}>Identity &amp; contact</td>
                <td style={cell}>Name, phone/mobile, email, company, job title</td>
                <td style={cell}>Entered by staff, imports, web forms, business-card scan</td>
              </tr>
              <tr>
                <td style={cell}>Demographic</td>
                <td style={cell}>Date of birth, gender</td>
                <td style={cell}>Entered by staff (only where the customer enables these fields)</td>
              </tr>
              <tr>
                <td style={cell}>Location</td>
                <td style={cell}>
                  Address, city/state/country, postal code; <strong>precise GPS</strong>{' '}
                  of field staff during working hours
                </td>
                <td style={cell}>Forms, device location</td>
              </tr>
              <tr>
                <td style={cell}>Images</td>
                <td style={cell}>
                  <strong>Attendance selfies</strong>, form photos
                </td>
                <td style={cell}>Mobile camera</td>
              </tr>
              <tr>
                <td style={cell}>Commercial</td>
                <td style={cell}>
                  Deals, activities, notes, call recordings &amp; transcripts,
                  engagement history
                </td>
                <td style={cell}>Generated in use</td>
              </tr>
              <tr>
                <td style={cell}>Technical</td>
                <td style={cell}>Device model, OS, IP address, app/usage logs</td>
                <td style={cell}>Automatic</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={p}>
          We <strong>minimise</strong> collection: administrators can hide built-in
          fields (e.g. date of birth, gender), and hidden fields are not stored
          server-side.
        </p>

        <h2 style={h2}>3. Purposes and lawful basis</h2>
        <div style={scrollX}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Purpose</th>
                <th style={th}>GDPR lawful basis</th>
                <th style={th}>DPDP basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cell}>Provide the CRM/field-force Service to our customer</td>
                <td style={cell}>
                  Contract (Art. 6(1)(b)); processor acting on controller instructions
                  (Art. 28)
                </td>
                <td style={cell}>Consent given to the data fiduciary / legitimate use (§4)</td>
              </tr>
              <tr>
                <td style={cell}>Employee attendance, GPS tracking &amp; selfies</td>
                <td style={cell}>
                  Legitimate interests / employment context (Art. 6(1)(f)/88) —{' '}
                  <strong>supported by a DPIA</strong>, not employee &ldquo;consent&rdquo;
                </td>
                <td style={cell}>Employment / notified purpose</td>
              </tr>
              <tr>
                <td style={cell}>
                  AI features (lead scoring, summaries, card scan, call intelligence)
                </td>
                <td style={cell}>Legitimate interests (Art. 6(1)(f)) with opt-out</td>
                <td style={cell}>Notified purpose</td>
              </tr>
              <tr>
                <td style={cell}>Security, fraud/geo-fence checks, audit logging</td>
                <td style={cell}>Legal obligation / legitimate interests</td>
                <td style={cell}>Notified purpose</td>
              </tr>
              <tr>
                <td style={cell}>Product analytics &amp; improvement</td>
                <td style={cell}>Legitimate interests</td>
                <td style={cell}>Notified purpose</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={p}>
          Where we rely on <strong>consent</strong>, you may withdraw it at any time
          (Section 8).
        </p>

        <h2 style={h2}>4. Special note on employee monitoring</h2>
        <p style={p}>
          GPS location and attendance selfies are collected{' '}
          <strong>only during working hours / on-shift</strong> for workforce-management
          purposes. Because employee consent is not considered freely given, this
          processing relies on a documented legitimate interest and a{' '}
          <strong>Data Protection Impact Assessment</strong>. Staff are notified in-app
          before tracking begins.
        </p>

        <h2 style={h2}>5. Children&rsquo;s data</h2>
        <p style={p}>
          The Service is <strong>not intended for individuals under 18</strong>. Where a
          date of birth indicates a data principal is a minor, DPDP §9 protections apply:
          we do not undertake tracking, behavioural monitoring, or targeted advertising
          of children, and processing requires verifiable parental/guardian consent.
          Administrators can hide the date-of-birth field entirely; where it is collected
          and indicates a minor, staff are instructed not to proceed without documented
          parental/guardian consent, and the account may be flagged for review.
        </p>

        <h2 style={h2}>6. Who we share data with</h2>
        <p style={p}>
          We do not sell personal data. We share it with <strong>sub-processors</strong>{' '}
          strictly to run the Service (hosting, notifications, AI, tax/e-invoice
          verification). The current list, including their locations, is in Section 13
          below. Each is bound by a data-processing agreement.
        </p>

        <h2 style={h2}>7. International transfers</h2>
        <p style={p}>
          The Service is currently hosted in{' '}
          <strong>Australia — Supabase ap-southeast-2 (Sydney)</strong>, and some
          sub-processors are located in the <strong>United States</strong>. Where we
          transfer personal data across borders we rely on Standard Contractual Clauses,
          and for Indian data we comply with DPDP §16. A copy of the safeguards is
          available on request.
        </p>

        <h2 style={h2}>8. Your rights</h2>
        <p style={p}>
          Subject to applicable law, you may: <strong>access</strong> a copy of your
          data; request <strong>correction</strong>; request <strong>erasure</strong>;
          request a <strong>portable</strong> copy; <strong>object to</strong> or{' '}
          <strong>restrict</strong> processing; and <strong>withdraw consent</strong>.
          Indian data principals also have the right to <strong>nominate</strong> and to{' '}
          <strong>grievance redressal</strong>.
        </p>
        <p style={p}>
          To exercise any right, contact{' '}
          <strong>
            {OFFICER}, <a href={`mailto:${EMAIL}`} style={link}>{EMAIL}</a>
          </strong>
          . We respond within <strong>30 days</strong> and verify your identity first.
          Requests are actioned through our data-subject-request tooling (access and
          erasure) and recorded in our audit log.
        </p>

        <h2 style={h2}>9. Retention</h2>
        <p style={p}>
          We keep personal data only as long as necessary for the purposes above and then
          delete or anonymise it per our retention schedule (indicative):
        </p>
        <ul>
          <li>Active CRM records: for the life of the customer relationship.</li>
          <li>
            Soft-deleted records: purged <strong>90 days</strong> after deletion.
          </li>
          <li>
            GPS / location history: <strong>180 days</strong>.
          </li>
          <li>
            Audit/accountability logs: <strong>365 days</strong> (or as legally required).
          </li>
          <li>
            Call recordings &amp; transcripts: <strong>180 days</strong>, subject to
            consent.
          </li>
        </ul>
        <p style={p}>Final periods are set in the Data Processing Agreement with each customer.</p>

        <h2 style={h2}>10. Security</h2>
        <p style={p}>
          We protect personal data with encryption in transit (TLS 1.2+), access
          controls, tenant isolation, rate limiting, immutable audit logging, and
          least-privilege storage. No system is perfectly secure; we operate a
          breach-response process (Section 11).
        </p>

        <h2 style={h2}>11. Breach notification</h2>
        <p style={p}>
          On a personal-data breach we will, without undue delay: notify the relevant
          supervisory authority within <strong>72 hours</strong> (GDPR Art. 33) and/or the{' '}
          <strong>Data Protection Board of India</strong> and affected data principals
          (DPDP §8(6)), and the controller where we act as processor.
        </p>

        <h2 style={h2}>12. Changes &amp; contact</h2>
        <p style={p}>
          We may update this policy; material changes will be notified. Questions or
          complaints:{' '}
          <strong>{OFFICER} (Grievance Officer)</strong>,{' '}
          <a href={`mailto:${EMAIL}`} style={link}>{EMAIL}</a>, {ADDRESS}. EU data
          subjects may also complain to their local supervisory authority; Indian data
          principals may approach the Data Protection Board of India.
        </p>

        <h2 style={h2}>13. Sub-processors</h2>
        <p style={p}>
          We use the following sub-processors to run the Service. Each is bound by a
          data-processing agreement; we notify customers of changes.
        </p>
        <div style={scrollX}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Sub-processor</th>
                <th style={th}>Service provided</th>
                <th style={th}>Region / location</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cell}>
                  <strong>Supabase</strong>
                </td>
                <td style={cell}>Managed Postgres, Auth, Storage</td>
                <td style={cell}>ap-southeast-2 (Sydney, Australia)</td>
              </tr>
              <tr>
                <td style={cell}>
                  <strong>Railway</strong>
                </td>
                <td style={cell}>Backend API hosting</td>
                <td style={cell}>United States</td>
              </tr>
              <tr>
                <td style={cell}>
                  <strong>Vercel</strong>
                </td>
                <td style={cell}>Web dashboard hosting</td>
                <td style={cell}>United States (edge/global)</td>
              </tr>
              <tr>
                <td style={cell}>
                  <strong>Google Firebase (FCM)</strong>
                </td>
                <td style={cell}>Push notifications</td>
                <td style={cell}>Google global</td>
              </tr>
              <tr>
                <td style={cell}>
                  <strong>Anthropic</strong>
                </td>
                <td style={cell}>
                  AI features (lead scoring, summaries, business-card scan, call
                  intelligence)
                </td>
                <td style={cell}>United States</td>
              </tr>
            </tbody>
          </table>
        </div>

        <hr
          style={{
            border: 0,
            borderTop: '1px solid var(--border)',
            margin: '40px 0 16px',
          }}
        />

        <h2 style={{ ...h2, marginTop: 8 }}>Collection notice (DPDP §5)</h2>
        <p style={p}>
          <strong>{ENTITY}</strong> is collecting your personal data. We collect your{' '}
          <strong>name, phone number, email, and the details you provide</strong> to
          create and manage your record in our customer&rsquo;s CRM and to contact you. If
          you are field staff, we collect your{' '}
          <strong>attendance selfie and precise location during working hours</strong> for
          workforce management and attendance verification. Your data is used only for
          these purposes, shared with the service providers listed above, and hosted in
          Australia (Supabase ap-southeast-2, Sydney); some providers are outside India.
          You may <strong>access</strong>, <strong>correct</strong>, or{' '}
          <strong>erase</strong> your data, <strong>nominate</strong> another person, and{' '}
          <strong>raise a grievance</strong> by contacting the Grievance Officer,{' '}
          <strong>{OFFICER}</strong>,{' '}
          <a href={`mailto:${EMAIL}`} style={link}>{EMAIL}</a>, {PHONE}. You may also
          complain to the Data Protection Board of India. You can{' '}
          <strong>withdraw consent</strong> at any time by emailing the Grievance Officer;
          withdrawal does not affect processing already carried out. If the person is
          under 18, we do not proceed without verifiable parental/guardian consent (DPDP
          §9).
        </p>

        <p style={{ ...muted, marginTop: 32 }}>
          © {ENTITY}. Last updated {EFFECTIVE}.
        </p>
      </div>
    </main>
  );
}
