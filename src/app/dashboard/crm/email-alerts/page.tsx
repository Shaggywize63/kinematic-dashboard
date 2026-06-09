'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { emailAlertsApi, verifiedSendersApi, type EmailAlert, type VerifiedSender } from '../../../../lib/emailAlertsApi';
import { crmEmailTemplates } from '../../../../lib/crmApi';
import type { EmailTemplate } from '../../../../types/crm';
import HtmlEmailEditor from '../../../../components/crm/email/HtmlEmailEditor';

/**
 * Email alerts inbox — list every planned/sent email, with a composer
 * modal for new alerts. Composer flow:
 *
 *   1. Pick a template (optional — you can also write the body inline).
 *   2. Pick the From address from the verified-senders dropdown.
 *      Unverified addresses don't appear here at all.
 *   3. Add To / CC / BCC chips.
 *   4. Set a "Send" mode — Now or Schedule for a future datetime.
 */
export default function EmailAlertsPage() {
  const [rows, setRows] = useState<EmailAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await emailAlertsApi.list();
      setRows(r.data || []);
    } catch (e: any) { toast.error(e?.message || 'Failed to load alerts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // Light poll so scheduled→sent transitions surface without a manual
    // reload. 20s is fine — the cron runs every minute.
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const cancel = async (id: string) => {
    if (!confirm('Cancel this scheduled alert?')) return;
    try { await emailAlertsApi.cancel(id); load(); }
    catch (e: any) { toast.error(e?.message || 'Failed to cancel'); }
  };
  const sendNow = async (id: string) => {
    try { await emailAlertsApi.sendNow(id); toast.success('Sending…'); setTimeout(load, 1500); }
    catch (e: any) { toast.error(e?.message || 'Failed to send'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Email alerts</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            Compose a one-off or scheduled email using a template + verified sender. <Link href="/dashboard/crm/email-senders" style={{ color: 'var(--primary)' }}>Manage senders</Link> · <Link href="/dashboard/crm/email-templates" style={{ color: 'var(--primary)' }}>Manage templates</Link>
          </div>
        </div>
        <button onClick={() => setComposing(true)} style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          New alert
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-dim)', fontSize: 13 }}>
          No alerts yet. Click <b>New alert</b> to send one.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                <Th>Name</Th><Th>From</Th><Th>Recipients</Th><Th>Status</Th><Th>When</Th><Th>{' '}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td><b>{r.name}</b></Td>
                  <Td style={{ color: 'var(--text-dim)' }}>{r.from_email}</Td>
                  <Td>
                    {r.recipients_total} total
                    {r.recipients_sent > 0 && <span style={{ color: '#22c55e', marginLeft: 6 }}>· {r.recipients_sent} sent</span>}
                    {r.recipients_failed > 0 && <span style={{ color: 'var(--primary)', marginLeft: 6 }}>· {r.recipients_failed} failed</span>}
                  </Td>
                  <Td><StatusPill status={r.status} /></Td>
                  <Td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    {r.scheduled_at && r.status === 'scheduled' && `📅 ${new Date(r.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`}
                    {r.sent_at && r.status !== 'scheduled' && `✉️ ${new Date(r.sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`}
                    {!r.scheduled_at && !r.sent_at && '—'}
                  </Td>
                  <Td style={{ textAlign: 'right' }}>
                    {r.status === 'scheduled' && (
                      <>
                        <button onClick={() => sendNow(r.id)} style={btnGhost}>Send now</button>
                        <button onClick={() => cancel(r.id)} style={{ ...btnGhost, color: 'var(--primary)', marginLeft: 4 }}>Cancel</button>
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {composing && (
        <ComposeModal onClose={() => setComposing(false)} onCreated={() => { setComposing(false); load(); }} />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: EmailAlert['status'] }) {
  const colour: Record<EmailAlert['status'], { bg: string; fg: string }> = {
    draft:     { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8' },
    scheduled: { bg: 'rgba(245,158,11,0.18)',  fg: '#F59E0B' },
    sending:   { bg: 'rgba(99,102,241,0.18)',  fg: '#6366F1' },
    sent:      { bg: 'rgba(34,197,94,0.18)',   fg: '#22c55e' },
    failed:    { bg: 'rgba(224,30,44,0.18)',   fg: '#E01E2C' },
    cancelled: { bg: 'rgba(100,116,139,0.18)', fg: '#64748b' },
  };
  const c = colour[status];
  return <span style={{ padding: '2px 9px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{status}</span>;
}

/**
 * Composer modal — the only place an alert is created on the dashboard.
 * Resolves the verified-sender list + template list lazily; surfaces a
 * helpful inline message when no verified senders exist instead of
 * letting the user start typing only to fail at submit.
 */
function ComposeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [senders, setSenders] = useState<VerifiedSender[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [schedule, setSchedule] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  useEffect(() => {
    Promise.all([
      verifiedSendersApi.list(true),
      crmEmailTemplates.list().catch(() => ({ data: [] } as any)),
    ]).then(([s, t]: any) => {
      const sList = s.data || [];
      setSenders(sList);
      const defaultS = sList.find((x: VerifiedSender) => x.is_default) || sList[0];
      if (defaultS) setFromEmail(defaultS.email);
      setTemplates(((t.data || t) || []).filter((x: any) => x.is_active !== false));
    }).catch(() => { /* surface failures via toast in submit */ });
  }, []);

  // Whenever the rep picks a template, prefill subject + body so they
  // see what they're sending without losing the ability to override.
  useEffect(() => {
    if (!templateId) return;
    const t = templates.find((x: any) => x.id === templateId);
    if (!t) return;
    if (!subject) setSubject((t as any).subject || '');
    if (!body) setBody((t as any).body_html || '');
  }, [templateId, templates, subject, body]);

  const splitAddrs = (s: string): string[] =>
    s.split(/[,;\n]/).map((x) => x.trim()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const toList = useMemo(() => splitAddrs(to), [to]);
  const ccList = useMemo(() => splitAddrs(cc), [cc]);
  const bccList = useMemo(() => splitAddrs(bcc), [bcc]);

  const submit = async () => {
    if (!fromEmail) { toast.error('Pick a verified From address'); return; }
    if (toList.length === 0) { toast.error('Add at least one valid To address'); return; }
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body are required'); return; }
    if (schedule === 'later' && !scheduledAt) { toast.error('Pick a date/time for the schedule'); return; }
    setBusy(true);
    try {
      await emailAlertsApi.create({
        name: name.trim() || subject.trim().slice(0, 80),
        template_id: templateId || null,
        from_email: fromEmail,
        to_emails: toList,
        cc_emails: ccList.length > 0 ? ccList : null,
        bcc_emails: bccList.length > 0 ? bccList : null,
        subject_override: subject,
        body_override: body,
        scheduled_at: schedule === 'later' ? new Date(scheduledAt).toISOString() : null,
      });
      toast.success(schedule === 'now' ? 'Sending…' : 'Scheduled');
      onCreated();
    } catch (e: any) { toast.error(e?.message || 'Failed to create'); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 920, maxHeight: 'calc(100vh - 60px)', background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>New email alert</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 22, padding: 4 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {senders.length === 0 && (
            <div style={{ padding: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, fontSize: 13 }}>
              No verified sender addresses yet. <Link href="/dashboard/crm/email-senders" style={{ color: 'var(--primary)', fontWeight: 700 }}>Add and verify one first.</Link>
            </div>
          )}

          <Row>
            <Col label="Alert name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 follow-up batch" style={input} />
            </Col>
            <Col label="Template (optional)">
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={input}>
                <option value="">— None (custom body) —</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Col>
          </Row>

          <Row>
            <Col label="From">
              <select value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} style={input} disabled={senders.length === 0}>
                <option value="">— pick a verified sender —</option>
                {senders.map((s) => <option key={s.id} value={s.email}>{s.display_name ? `${s.display_name} <${s.email}>` : s.email}</option>)}
              </select>
            </Col>
            <Col label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" style={input} />
            </Col>
          </Row>

          <Col label="To (comma or newline separated)">
            <textarea value={to} onChange={(e) => setTo(e.target.value)} rows={2} placeholder="alice@acme.com, bob@acme.com" style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{toList.length} valid address{toList.length === 1 ? '' : 'es'}</div>
          </Col>

          <Row>
            <Col label="CC (optional)">
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="manager@acme.com" style={input} />
            </Col>
            <Col label="BCC (optional)">
              <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="archive@acme.com" style={input} />
            </Col>
          </Row>

          <Col label="Body (HTML)">
            <HtmlEmailEditor value={body} onChange={setBody} variables={['name', 'company', 'first_name']} minHeight={280} />
          </Col>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--s2)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Schedule</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={schedule === 'now'} onChange={() => setSchedule('now')} /> Send immediately
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={schedule === 'later'} onChange={() => setSchedule('later')} /> Schedule for
              </label>
              {schedule === 'later' && (
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={{ ...input, width: 220 }} />
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
              {schedule === 'later' ? 'Cron worker fires due alerts every minute.' : 'Send fires as soon as you click Create.'}
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--s2)' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={busy || senders.length === 0} style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--primary)', border: 'none', color: '#fff', cursor: busy || senders.length === 0 ? 'not-allowed' : 'pointer', opacity: busy || senders.length === 0 ? 0.5 : 1 }}>
            {busy ? 'Saving…' : schedule === 'later' ? 'Schedule' : 'Send now'}
          </button>
        </div>
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: 10, fontSize: 13,
  borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--s3)', color: 'var(--text)',
};

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
}
function Col({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
const btnGhost: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  cursor: 'pointer',
};
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 12px', verticalAlign: 'middle', ...style }}>{children}</td>;
}
