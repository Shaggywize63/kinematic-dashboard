'use client';
/**
 * CRM → Campaigns — WhatsApp broadcast list (Phase 1).
 *
 * Segment leads → approved template → consent-gated, paced send → per-recipient
 * delivery tracking. This page lists campaigns with live progress; the wizard
 * lives at ./new and the detail/monitor at ./[id].
 *
 * Wired to /api/v1/crm/broadcasts. Sending only actually leaves the building once
 * Settings → WhatsApp has an active connection; until then messages resolve to
 * the inert stub provider.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { crmBroadcasts, type Broadcast, type BroadcastStatus } from '../../../../lib/crmApi';

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF', amber: '#F5A623',
};
const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 };

const STATUS_COLOR: Record<BroadcastStatus, string> = {
  draft: C.gray, scheduled: C.blue, sending: C.amber, paused: C.grayd,
  completed: C.green, cancelled: C.grayd, failed: C.red,
};

function StatusPill({ status }: { status: BroadcastStatus }) {
  const c = STATUS_COLOR[status] ?? C.gray;
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 6, color: c,
      background: 'var(--s4)', border: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {status}
    </span>
  );
}

function ProgressBar({ b }: { b: Broadcast }) {
  const total = Math.max(b.total_recipients, 1);
  const sent = Math.min(b.sent_count, total);
  const pct = Math.round((sent / total) * 100);
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ height: 6, background: 'var(--s4)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: b.status === 'completed' ? C.green : C.blue, transition: 'width .3s' }} />
      </div>
      <div style={{ fontSize: 11, color: C.grayd, marginTop: 4 }}>
        {b.sent_count}/{b.total_recipients} sent · {b.delivered_count} delivered · {b.read_count} read{b.failed_count ? ` · ${b.failed_count} failed` : ''}
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await crmBroadcasts.list({ limit: 100 });
      setRows(r.data ?? []);
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
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Campaigns</h1>
          <p style={{ color: C.gray, fontSize: 13, margin: 0, maxWidth: 640 }}>
            Send an approved WhatsApp template to a segment of your leads. Only opted-in leads are messaged, and sending is paced to protect your number&apos;s quality rating.
          </p>
        </div>
        <Link href="/dashboard/crm/campaigns/new" style={{ background: C.red, color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          + New campaign
        </Link>
      </div>

      {err && <div style={{ ...card, borderColor: 'rgba(224,30,44,0.3)', color: C.red, fontSize: 13, marginBottom: 16 }}>{err}</div>}

      {loading ? (
        <div style={{ ...card, color: C.gray, fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No campaigns yet</div>
          <div style={{ color: C.gray, fontSize: 13, marginBottom: 18 }}>
            Create your first WhatsApp broadcast to reach a segment of opted-in leads.
          </div>
          <Link href="/dashboard/crm/campaigns/new" style={{ background: C.red, color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            + New campaign
          </Link>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {rows.map((b, i) => (
            <Link key={b.id} href={`/dashboard/crm/campaigns/${b.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', textDecoration: 'none', color: C.white,
                borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                  <StatusPill status={b.status} />
                </div>
                <div style={{ fontSize: 12, color: C.grayd }}>
                  {b.template_meta_name || 'template'} · {new Date(b.created_at).toLocaleDateString()}
                  {b.skipped_count ? ` · ${b.skipped_count} suppressed` : ''}
                </div>
              </div>
              <ProgressBar b={b} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
