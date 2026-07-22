'use client';

import { useCallback, useEffect, useState } from 'react';
import { crmConsent, type ConsentRecord } from '../../lib/crmApi';

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

const PURPOSE_LABELS: Record<string, string> = {
  lead_pii: 'Personal data collection',
  marketing: 'Marketing communications',
  whatsapp: 'WhatsApp contact',
  gps_tracking: 'Location tracking',
  attendance_selfie: 'Attendance selfie',
  call_recording: 'Call recording',
  parental_guardian: 'Parental / guardian consent',
};

/**
 * Consent status + withdrawal control (DPDP §6(4)-(6)) for a subject's detail
 * page. Lists consent events from the ledger and lets staff withdraw an active
 * consent. Self-contained: drop `<ConsentCard subjectType="lead" subjectId={id} />`
 * onto any detail view.
 */
export function ConsentCard({
  subjectType,
  subjectId,
}: {
  subjectType: 'lead' | 'contact' | 'employee';
  subjectId: string;
}) {
  const [rows, setRows] = useState<ConsentRecord[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await crmConsent.list({ subject_type: subjectType, subject_id: subjectId });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load consent');
      setRows([]);
    }
  }, [subjectType, subjectId]);

  useEffect(() => {
    if (subjectId) load();
  }, [subjectId, load]);

  const withdraw = async (id: string) => {
    setBusyId(id);
    try {
      await crmConsent.withdraw({ id });
      await load();
    } catch (e) {
      setError((e as Error)?.message || 'Withdrawal failed');
    } finally {
      setBusyId(null);
    }
  };

  const cardStyle: React.CSSProperties = {
    padding: 16,
    background: 'var(--s2, #fff)',
    border: '1px solid var(--border)',
    borderRadius: 12,
  };
  const title: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 };

  return (
    <div style={cardStyle}>
      <div style={title}>Consent (DPDP)</div>
      {error && <div style={{ fontSize: 12, color: 'var(--danger, #dc2626)', marginBottom: 8 }}>{error}</div>}
      {rows === null ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No consent recorded for this record.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => {
            const active = !r.withdrawn_at && r.consented;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ color: 'var(--text)' }}>{PURPOSE_LABELS[r.purpose] || r.purpose}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {r.withdrawn_at
                      ? `Withdrawn ${new Date(r.withdrawn_at).toLocaleDateString()}`
                      : r.consented
                        ? `Given ${new Date(r.created_at).toLocaleDateString()} · ${r.method}`
                        : `Refused ${new Date(r.created_at).toLocaleDateString()}`}
                  </div>
                </div>
                {active ? (
                  <button
                    onClick={() => withdraw(r.id)}
                    disabled={busyId === r.id}
                    style={{
                      fontSize: 12,
                      padding: '4px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--danger, #dc2626)',
                      cursor: busyId === r.id ? 'default' : 'pointer',
                      opacity: busyId === r.id ? 0.6 : 1,
                    }}
                  >
                    {busyId === r.id ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {r.withdrawn_at ? 'Withdrawn' : 'Refused'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
