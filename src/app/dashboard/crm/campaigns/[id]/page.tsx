'use client';
/**
 * CRM → Campaigns → detail — monitor & control a WhatsApp broadcast (Phase 1).
 *
 * Shows live delivery progress and the per-recipient breakdown, and drives the
 * paced send while open (polls POST /broadcasts/:id/process — the in-process
 * scheduler is the backstop when this page is closed). Launch / pause / resume /
 * cancel wired to the matching endpoints.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  crmBroadcasts,
  type Broadcast, type BroadcastStatus, type BroadcastRecipient, type BroadcastRecipientStatus, type BroadcastAnalytics,
} from '../../../../../lib/crmApi';
import { resolveApiUrl } from '../../../../../lib/api';

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF', amber: '#F5A623',
};
const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 16 };
const btnPrimary: React.CSSProperties = { background: C.red, border: 'none', color: '#fff', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' };

const STATUS_COLOR: Record<BroadcastStatus, string> = {
  draft: C.gray, scheduled: C.blue, sending: C.amber, paused: C.grayd,
  completed: C.green, cancelled: C.grayd, failed: C.red,
};
const RCPT_COLOR: Record<BroadcastRecipientStatus, string> = {
  queued: C.grayd, sending: C.amber, sent: C.blue, delivered: C.green, read: C.green, failed: C.red, skipped: C.amber,
};
const RCPT_TABS: Array<BroadcastRecipientStatus | 'all'> = ['all', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped'];

// Authenticated CSV download (the export endpoint needs the bearer + org headers).
function downloadCsv(path: string, filename: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
  const orgRaw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
  const orgId = orgRaw ? (JSON.parse(orgRaw)?.org_id ?? null) : null;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (orgId) headers['X-Org-Id'] = orgId;
  fetch(`${resolveApiUrl()}${path}`, { headers })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => alert('Export failed'));
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 90, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color }}>{n}</div>
      <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [tab, setTab] = useState<BroadcastRecipientStatus | 'all'>('all');
  const [analytics, setAnalytics] = useState<BroadcastAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadRecipients = useCallback(async (status: BroadcastRecipientStatus | 'all') => {
    try {
      const r = await crmBroadcasts.recipients(id, { limit: 300, ...(status === 'all' ? {} : { status }) });
      setRecipients(r.data ?? []);
    } catch { /* ignore transient */ }
  }, [id]);

  const loadAnalytics = useCallback(async () => {
    try { const r = await crmBroadcasts.analytics(id); setAnalytics(r.data); } catch { /* ignore */ }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const r = await crmBroadcasts.get(id);
      setB(r.data);
      setMsg(null);
      loadAnalytics();
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Failed to load campaign' }); }
    finally { setLoading(false); }
  }, [id, loadAnalytics]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRecipients(tab); }, [tab, loadRecipients]);

  // While sending, drive the paced send from the browser and refresh live.
  useEffect(() => {
    if (b?.status !== 'sending') return;
    const t = setInterval(async () => {
      try {
        const r = await crmBroadcasts.process(id);
        setB(r.data);
        loadRecipients(tab);
        loadAnalytics();
      } catch { /* transient */ }
    }, 4000);
    return () => clearInterval(t);
  }, [b?.status, id, tab, loadRecipients, loadAnalytics]);

  const act = async (fn: () => Promise<{ data: Broadcast }>, ok: string) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setB(r.data); setMsg({ ok: true, text: ok }); loadRecipients(tab); }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Action failed' }); }
    finally { setBusy(false); }
  };

  const sendTest = async () => {
    const raw = window.prompt('Send a test of this template to (comma-separated numbers, max 5):');
    const phones = (raw || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    if (!phones.length) return;
    setBusy(true); setMsg(null);
    try {
      const r = await crmBroadcasts.test(id, phones);
      setMsg({ ok: r.data.sent > 0, text: `Test: ${r.data.sent}/${phones.length} sent.` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Test send failed' }); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{ color: C.gray, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Loading…</div>;
  if (!b) return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white }}>
      <Link href="/dashboard/crm/campaigns" style={{ color: C.gray, fontSize: 12 }}>← Campaigns</Link>
      <div style={{ ...card, marginTop: 16, color: C.red, fontSize: 13 }}>{msg?.text || 'Campaign not found.'}</div>
    </div>
  );

  const remaining = Math.max(0, b.total_recipients - b.sent_count - b.failed_count);
  const pct = Math.round((Math.min(b.sent_count, Math.max(b.total_recipients, 1)) / Math.max(b.total_recipients, 1)) * 100);
  const canLaunch = b.status === 'draft' || b.status === 'failed';

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 60, maxWidth: 900 }}>
      <div style={{ marginBottom: 18 }}>
        <Link href="/dashboard/crm/campaigns" style={{ color: C.gray, fontSize: 12, textDecoration: 'none' }}>← Campaigns</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 2px', flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, margin: 0 }}>{b.name}</h1>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 6, color: STATUS_COLOR[b.status], background: 'var(--s4)', border: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{b.status}</span>
        </div>
        <div style={{ fontSize: 12, color: C.grayd }}>
          {b.template_meta_name || 'template'} · {b.template_language || 'en'} · {b.throttle_per_min}/min
          {b.scheduled_at ? ` · scheduled ${new Date(b.scheduled_at).toLocaleString()}` : ''}
        </div>
      </div>

      {msg && <div style={{ ...card, padding: '12px 16px', background: msg.ok ? 'rgba(0,217,126,0.10)' : 'rgba(224,30,44,0.10)', borderColor: msg.ok ? 'rgba(0,217,126,0.3)' : 'rgba(224,30,44,0.3)', color: msg.ok ? C.green : C.red, fontSize: 13 }}>{msg.text}</div>}

      {/* Progress */}
      <div style={card}>
        <div style={{ height: 8, background: 'var(--s4)', borderRadius: 5, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: b.status === 'completed' ? C.green : C.blue, transition: 'width .4s' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Stat n={b.total_recipients} label="Recipients" color={C.white} />
          <Stat n={b.sent_count} label="Sent" color={C.blue} />
          <Stat n={b.delivered_count} label="Delivered" color={C.green} />
          <Stat n={b.read_count} label="Read" color={C.green} />
          <Stat n={b.failed_count} label="Failed" color={C.red} />
          <Stat n={remaining} label="Queued" color={C.grayd} />
          <Stat n={b.skipped_count} label="Suppressed" color={C.amber} />
        </div>
      </div>

      {/* Analytics + cost */}
      {analytics && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <Stat n={analytics.delivery_rate} label="Delivery %" color={C.green} />
            <Stat n={analytics.read_rate} label="Read %" color={C.green} />
            <Stat n={analytics.reply_rate} label="Reply %" color={C.blue} />
            <Stat n={analytics.failure_rate} label="Failure %" color={C.red} />
            <Stat n={analytics.replied} label="Replies" color={C.blue} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: C.gray, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            {b.est_cost != null && <span>Est. cost: <b style={{ color: C.white }}>{analytics.cost_currency} {b.est_cost.toFixed(2)}</b></span>}
            <span>Billed so far: <b style={{ color: C.amber }}>{analytics.cost_currency} {analytics.actual_cost.toFixed(2)}</b></span>
            {Object.keys(analytics.failure_kinds).length > 0 && (
              <span>Failures: {Object.entries(analytics.failure_kinds).map(([k, n]) => `${n} ${k}`).join(', ')}</span>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {canLaunch && <button disabled={busy} onClick={() => act(() => crmBroadcasts.launch(id).then((r) => ({ data: r.data })), 'Launched.')} style={btnPrimary}>{b.scheduled_at ? 'Schedule & queue' : 'Launch now'}</button>}
        {b.status === 'sending' && <button disabled={busy} onClick={() => act(() => crmBroadcasts.pause(id).then((r) => ({ data: r.data })), 'Paused.')} style={btnGhost}>Pause</button>}
        {b.status === 'paused' && <button disabled={busy} onClick={() => act(() => crmBroadcasts.resume(id).then((r) => ({ data: r.data })), 'Resumed.')} style={btnPrimary}>Resume</button>}
        {b.status === 'scheduled' && <button disabled={busy} onClick={() => act(() => crmBroadcasts.pause(id).then((r) => ({ data: r.data })), 'Paused.')} style={btnGhost}>Pause schedule</button>}
        {['sending', 'paused', 'scheduled'].includes(b.status) && <button disabled={busy} onClick={() => act(() => crmBroadcasts.cancel(id).then((r) => ({ data: r.data })), 'Cancelled.')} style={{ ...btnGhost, color: C.red }}>Cancel</button>}
        {b.status !== 'completed' && b.status !== 'cancelled' && <button disabled={busy} onClick={sendTest} style={btnGhost}>Send test</button>}
        {b.status === 'sending' && <span style={{ alignSelf: 'center', fontSize: 12, color: C.amber }}>● sending live…</span>}
      </div>

      {/* Recipients */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 6, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
          {RCPT_TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                background: tab === t ? C.s4 : 'transparent', color: tab === t ? C.white : C.gray, border: `1px solid ${tab === t ? C.border : 'transparent'}` }}>
              {t}
            </button>
          ))}
          <button onClick={() => downloadCsv(crmBroadcasts.csvPath(id), `campaign-${b.name.replace(/[^a-z0-9]+/gi, '-')}.csv`)}
            style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'transparent', color: C.gray, border: `1px solid ${C.border}` }}>
            ↓ Export CSV
          </button>
        </div>
        {recipients.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: C.gray, fontSize: 13 }}>
            {canLaunch ? 'Recipients are resolved when you launch the campaign.' : 'No recipients in this view.'}
          </div>
        ) : (
          <div>
            {recipients.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 0, color: C.white }}>{r.phone || '—'}{r.replied_at && <span style={{ marginLeft: 6, fontSize: 10, color: C.blue }}>↩ replied</span>}</span>
                {(r.skip_reason || r.error) && <span style={{ fontSize: 11, color: C.grayd, flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.skip_reason || r.error}{r.attempts && r.attempts > 1 ? ` · ${r.attempts} tries` : ''}</span>}
                <span style={{ fontSize: 11, fontWeight: 800, color: RCPT_COLOR[r.status], textTransform: 'uppercase', minWidth: 72, textAlign: 'right' }}>{r.status}</span>
              </div>
            ))}
            {recipients.length >= 300 && <div style={{ padding: '10px 16px', fontSize: 12, color: C.grayd, borderTop: `1px solid ${C.border}` }}>Showing first 300.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
