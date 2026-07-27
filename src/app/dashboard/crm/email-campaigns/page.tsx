'use client';
/**
 * CRM → Email Campaigns — bulk email list (the email sibling of WhatsApp
 * Campaigns). Segment leads → a saved email template → paced, tracked send with
 * per-recipient open/click tracking and one-click unsubscribe (all reused from
 * the CRM email layer). This page lists campaigns with live progress; the wizard
 * lives at ./new and the detail/monitor at ./[id].
 *
 * Wired to /api/v1/crm/email-campaigns. Paid add-on — gated per org.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { crmEmailCampaigns, type EmailCampaign } from '../../../../lib/crmApi';
import { getStoredUser } from '../../../../lib/auth';

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF', amber: '#F5A623',
};
const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 };

const STATUS_COLOR: Record<EmailCampaign['status'], string> = {
  draft: C.gray, sending: C.amber, paused: C.grayd,
  completed: C.green, cancelled: C.grayd, failed: C.red,
};

function StatusPill({ status }: { status: EmailCampaign['status'] }) {
  const c = STATUS_COLOR[status] ?? C.gray;
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 6, color: c,
      background: 'var(--s4)', border: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {status}
    </span>
  );
}

function ProgressBar({ c: b }: { c: EmailCampaign }) {
  const total = Math.max(b.total, 1);
  const done = Math.min(b.sent + b.failed + b.skipped, total);
  const pct = Math.round((done / total) * 100);
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ height: 6, background: 'var(--s4)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: b.status === 'completed' ? C.green : C.blue, transition: 'width .3s' }} />
      </div>
      <div style={{ fontSize: 11, color: C.grayd, marginTop: 4 }}>
        {b.sent}/{b.total} sent{b.failed ? ` · ${b.failed} failed` : ''}{b.skipped ? ` · ${b.skipped} skipped` : ''}
      </div>
    </div>
  );
}

export default function EmailCampaignsPage() {
  const [rows, setRows] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ campaigns: number; emails_this_month: number } | null>(null);
  const isSuper = (typeof window !== 'undefined' ? (getStoredUser()?.role || '') : '').toLowerCase() === 'super_admin';

  const load = useCallback(async () => {
    try {
      const ent = await crmEmailCampaigns.entitlement();
      setEnabled(!!ent.data?.enabled);
      if (ent.data?.enabled) {
        const [r, u] = await Promise.all([crmEmailCampaigns.list({ limit: 100 }), crmEmailCampaigns.usage().catch(() => null)]);
        setRows(r.data ?? []);
        if (u) setUsage(u.data);
      }
      setErr(null);
    } catch (e: any) { setErr(e?.message || 'Failed to load campaigns'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Light polling so in-flight campaigns advance visibly in the list.
  useEffect(() => {
    const anySending = rows.some((r) => r.status === 'sending');
    if (!anySending) return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [rows, load]);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Email Campaigns</h1>
          <p style={{ color: C.gray, fontSize: 13, margin: 0, maxWidth: 660 }}>
            Send a saved email template to a segment of your contacts. Unsubscribed and bounced addresses are skipped automatically, opens &amp; clicks are tracked, and every email carries a one-click unsubscribe.
            {usage && <span> · <b style={{ color: C.white }}>{usage.emails_this_month}</b> sent this month.</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, whiteSpace: 'nowrap', alignItems: 'center' }}>
          {isSuper && <Link href="/dashboard/settings/email-campaigns" style={{ color: C.gray, fontSize: 12, textDecoration: 'none', marginRight: 4 }}>Manage access →</Link>}
          {enabled && <>
            <Link href="/dashboard/crm/leads/import" style={{ background: C.s3, color: C.white, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', border: `1px solid ${C.border}` }}>Import contacts</Link>
            <Link href="/dashboard/crm/email-campaigns/new" style={{ background: C.red, color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ New campaign</Link>
          </>}
        </div>
      </div>

      {err && <div style={{ ...card, borderColor: 'rgba(224,30,44,0.3)', color: C.red, fontSize: 13, marginBottom: 16 }}>{err}</div>}

      {loading ? (
        <div style={{ ...card, color: C.gray, fontSize: 13 }}>Loading…</div>
      ) : enabled === false ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Email Campaigns is a paid add-on</div>
          <div style={{ color: C.gray, fontSize: 13, maxWidth: 460, margin: '0 auto' }}>
            This feature isn&apos;t enabled for your account yet. Contact your Kinematic administrator to turn on bulk email campaigns.
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No campaigns yet</div>
          <div style={{ color: C.gray, fontSize: 13, marginBottom: 18, maxWidth: 480, margin: '0 auto 18px' }}>
            Import a list of email contacts, then send them a campaign from a saved template.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Link href="/dashboard/crm/leads/import" style={{ background: C.s3, color: C.white, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', border: `1px solid ${C.border}` }}>Import contacts</Link>
            <Link href="/dashboard/crm/email-campaigns/new" style={{ background: C.red, color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ New campaign</Link>
          </div>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {rows.map((b, i) => (
            <Link key={b.id} href={`/dashboard/crm/email-campaigns/${b.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', textDecoration: 'none', color: C.white,
                borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                  <StatusPill status={b.status} />
                </div>
                <div style={{ fontSize: 12, color: C.grayd, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.subject} · {new Date(b.created_at).toLocaleDateString()}
                </div>
              </div>
              <ProgressBar c={b} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
