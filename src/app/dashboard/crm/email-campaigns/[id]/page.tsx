'use client';
/**
 * CRM → Email Campaigns → [id]. Detail + monitor.
 * Live status, lifecycle actions (launch / pause / resume / cancel), delivery +
 * engagement analytics (sent / delivered / opened / clicked / bounced /
 * unsubscribed / failed / skipped) and a recipients table with CSV export.
 * Polls while sending so progress advances on screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  crmEmailCampaigns,
  type EmailCampaign, type EmailCampaignRecipient, type EmailCampaignAnalytics,
} from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import { downloadBlob } from '../../../../../lib/financeFormat';

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF', amber: '#F5A623',
};
const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 };

const STATUS_COLOR: Record<EmailCampaign['status'], string> = {
  draft: C.gray, sending: C.amber, paused: C.grayd, completed: C.green, cancelled: C.grayd, failed: C.red,
};
const REC_COLOR: Record<EmailCampaignRecipient['status'], string> = {
  queued: C.grayd, sending: C.amber, sent: C.green, failed: C.red, skipped: C.gray,
};

// Authenticated CSV download. Goes through api.download so the request carries
// EVERY tenant header (Authorization, X-Org-Id, X-Client-Id and — critically —
// X-Kinematic-Project), refreshes an expired token, and reports a failed export
// instead of saving the error body as a ".csv". The old hand-rolled fetch sent
// only the token + org, so for a campaign in a non-default project the server
// looked in the wrong database and the download silently produced nothing.
async function downloadCsv(path: string, filename: string) {
  try {
    downloadBlob(await api.download(path), filename);
  } catch (e) {
    alert(e instanceof Error && e.message ? `Export failed: ${e.message}` : 'Export failed');
  }
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ background: 'var(--s4)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.white }}>{value}</div>
      <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function EmailCampaignDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [c, setC] = useState<EmailCampaign | null>(null);
  const [analytics, setAnalytics] = useState<EmailCampaignAnalytics | null>(null);
  const [recipients, setRecipients] = useState<EmailCampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  // Recipient list filter: '' = everyone, 'failed' = only the ones whose send failed (the ones a resend would retry).
  const [statusFilter, setStatusFilter] = useState<'' | 'failed'>('');

  const load = useCallback(async () => {
    try {
      const [camp, an, recs] = await Promise.all([
        crmEmailCampaigns.get(id),
        crmEmailCampaigns.analytics(id).catch(() => null),
        crmEmailCampaigns.recipients(id, { limit: 200, ...(statusFilter ? { status: statusFilter } : {}) }).catch(() => null),
      ]);
      setC(camp.data);
      if (an) setAnalytics(an.data);
      if (recs) setRecipients(recs.data ?? []);
      setErr('');
    } catch (e: any) { setErr(e?.message || 'Failed to load campaign'); }
    finally { setLoading(false); }
  }, [id, statusFilter]);
  useEffect(() => { load(); }, [load]);

  // Poll while in flight so counts advance live.
  useEffect(() => {
    if (c?.status !== 'sending') return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [c?.status, load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e: any) { setErr(e?.message || 'Action failed'); }
    finally { setBusy(false); }
  };

  // Recipients whose send failed RIGHT NOW (bounced / unsubscribed / delivered ones are not counted and not retried).
  const failedCount = analytics?.totals?.failed ?? c?.failed ?? 0;

  const resendFailed = async () => {
    const plural = failedCount === 1 ? '' : 's';
    if (!confirm(`Resend this email to the ${failedCount.toLocaleString()} recipient${plural} it failed to reach?\n\nRecipients who already received it, bounced or unsubscribed will not be sent again.`)) return;
    setBusy(true); setErr(''); setNotice('');
    try {
      const r = await crmEmailCampaigns.resendFailed(id);
      const n = r.data?.requeued ?? failedCount;
      setNotice(`Resending to ${n.toLocaleString()} failed recipient${n === 1 ? '' : 's'} — the numbers below update as it sends.`);
      await load();
    } catch (e: any) { setErr(e?.message || 'Could not resend'); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{ ...card, color: C.gray, fontSize: 13 }}>Loading…</div>;
  if (!c) return <div style={{ ...card, color: C.red, fontSize: 13 }}>{err || 'Campaign not found'}</div>;

  const t = analytics?.totals;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 60, maxWidth: 960 }}>
      <Link href="/dashboard/crm/email-campaigns" style={{ color: C.gray, fontSize: 12, textDecoration: 'none' }}>← Email Campaigns</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, margin: '8px 0 20px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 23, fontWeight: 800, margin: 0 }}>{c.name}</h1>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 6, color: STATUS_COLOR[c.status], background: 'var(--s4)', border: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.status}</span>
          </div>
          <div style={{ fontSize: 13, color: C.gray }}>{c.subject}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {c.status === 'draft' && <button onClick={() => act(() => crmEmailCampaigns.launch(id))} disabled={busy} style={{ background: C.red, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer' }}>Send now</button>}
          {c.status === 'sending' && <button onClick={() => act(() => crmEmailCampaigns.pause(id))} disabled={busy} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Pause</button>}
          {c.status === 'paused' && <button onClick={() => act(() => crmEmailCampaigns.resume(id))} disabled={busy} style={{ background: C.red, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Resume</button>}
          {c.status === 'completed' && failedCount > 0 && <button onClick={resendFailed} disabled={busy} title="Send again to only the recipients whose email failed" style={{ background: C.red, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer' }}>↻ Resend to {failedCount.toLocaleString()} failed</button>}
          {['sending', 'paused', 'draft'].includes(c.status) && <button onClick={() => { if (confirm('Cancel this campaign? Queued recipients will not be sent.')) act(() => crmEmailCampaigns.cancel(id)); }} disabled={busy} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>}
        </div>
      </div>

      {err && <div style={{ ...card, borderColor: 'rgba(224,30,44,0.3)', color: C.red, fontSize: 13 }}>{err}</div>}
      {notice && <div role="status" style={{ ...card, borderColor: 'rgba(34,197,94,0.3)', color: C.green, fontSize: 13 }}>{notice}</div>}

      {/* Analytics */}
      <div style={card}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Performance</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Stat label="Recipients" value={(t?.recipients ?? c.total).toLocaleString()} />
          <Stat label="Sent" value={(t?.sent ?? c.sent).toLocaleString()} color={C.green} />
          <Stat label="Delivered" value={(t?.delivered ?? 0).toLocaleString()} color={C.green} />
          <Stat label="Opened" value={t?.opened ?? 0} color={C.blue} />
          <Stat label="Clicked" value={t?.clicked ?? 0} color={C.blue} />
          <Stat label="Bounced" value={t?.bounced ?? 0} color={C.amber} />
          <Stat label="Unsub" value={t?.unsubscribed ?? 0} color={C.amber} />
          <Stat label="Failed" value={(t?.failed ?? c.failed).toLocaleString()} color={C.red} />
          <Stat label="Skipped" value={(t?.skipped ?? c.skipped).toLocaleString()} color={C.gray} />
        </div>
        {analytics && (
          <div style={{ fontSize: 12, color: C.gray, marginTop: 14 }}>
            Open rate <b style={{ color: C.white }}>{analytics.open_rate}%</b> · Click rate <b style={{ color: C.white }}>{analytics.click_rate}%</b> · paced {c.throttle_per_min}/min
            {c.status === 'sending' && <span style={{ color: C.amber }}> · sending…</span>}
          </div>
        )}
      </div>

      {/* Recipients */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Recipients {recipients.length ? `(showing ${recipients.length})` : ''}</span>
          <span style={{ display: 'flex', gap: 6, marginLeft: 'auto', marginRight: 10 }}>
            {([['', 'All'], ['failed', `Failed${failedCount ? ` (${failedCount.toLocaleString()})` : ''}`]] as const).map(([val, label]) => (
              <button key={val || 'all'} onClick={() => setStatusFilter(val)} aria-pressed={statusFilter === val}
                style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: statusFilter === val ? C.s4 : 'transparent', color: statusFilter === val ? C.white : C.gray, border: `1px solid ${C.border}` }}>{label}</button>
            ))}
          </span>
          <button onClick={() => downloadCsv(crmEmailCampaigns.csvPath(id), `email-campaign-${c.name.replace(/[^a-z0-9]+/gi, '-')}.csv`)}
            style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'transparent', color: C.gray, border: `1px solid ${C.border}` }}>↓ Export CSV</button>
        </div>
        {recipients.length === 0 ? (
          <div style={{ padding: 24, color: C.gray, fontSize: 13 }}>{statusFilter === 'failed' ? 'No failed recipients.' : <>No recipients yet. {c.status === 'draft' ? 'They are created when you send.' : ''}</>}</div>
        ) : (
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {recipients.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, fontSize: 13 }}>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.email}{r.first_name ? <span style={{ color: C.grayd }}> · {r.first_name}</span> : ''}
                </div>
                {(r.skip_reason || r.error) && <span style={{ fontSize: 11, color: C.grayd, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{r.skip_reason || r.error}</span>}
                <span style={{ fontSize: 11, fontWeight: 800, color: REC_COLOR[r.status], textTransform: 'uppercase', letterSpacing: '0.4px', flex: '0 0 auto' }}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
