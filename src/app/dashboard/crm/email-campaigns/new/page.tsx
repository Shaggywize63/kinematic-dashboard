'use client';
/**
 * CRM → Email Campaigns → New. Single-page composer:
 *   1. Name + pick a saved email template (subject + body snapshotted on create).
 *   2. Audience filters over leads (email required; consent / status / city /
 *      tags / B2C). "Preview audience" resolves the count + skip breakdown +
 *      a rendered sample so you see exactly who gets it and how it looks.
 *   3. Pacing, then Save draft or Create & Send.
 *
 * Wired to /api/v1/crm/email-campaigns. Templates come from crmEmailTemplates.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  crmEmailCampaigns, crmEmailTemplates,
  type EmailTemplate, type EmailAudience, type EmailCampaignPreview,
} from '../../../../../lib/crmApi';

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF',
};
const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 16 };
const input: React.CSSProperties = { width: '100%', background: 'var(--s4)', border: `1px solid ${C.border}`, padding: '10px 12px', borderRadius: 9, color: C.white, outline: 'none', fontSize: 13, boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 };
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

// Merge variables the send loop fills from each recipient's lead record.
const VARIABLES: Array<{ token: string; desc: string }> = [
  { token: '{{first_name}}', desc: 'First name' },
  { token: '{{last_name}}', desc: 'Last name' },
  { token: '{{email}}', desc: 'Email address' },
];

export default function NewEmailCampaignPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [throttle, setThrottle] = useState(60);
  const [copied, setCopied] = useState('');

  // Audience filter state
  const [consentOnly, setConsentOnly] = useState(true);
  const [statusCsv, setStatusCsv] = useState('');
  const [cityCsv, setCityCsv] = useState('');
  const [tagsCsv, setTagsCsv] = useState('');
  const [b2c, setB2c] = useState<'' | 'true' | 'false'>('');

  const [preview, setPreview] = useState<EmailCampaignPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    crmEmailTemplates.list({ limit: 200 }).then((r) => setTemplates(r.data ?? [])).catch(() => {});
  }, []);

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId]);

  const audience = useCallback((): EmailAudience => {
    const a: EmailAudience = {};
    if (consentOnly) a.marketing_consent = true;
    const st = csv(statusCsv); if (st.length) a.status = st;
    const ci = csv(cityCsv); if (ci.length) a.city = ci;
    const tg = csv(tagsCsv); if (tg.length) a.tags = tg;
    if (b2c) a.is_b2c = b2c === 'true';
    return a;
  }, [consentOnly, statusCsv, cityCsv, tagsCsv, b2c]);

  const runPreview = async () => {
    if (!templateId) { setErr('Pick an email template first.'); return; }
    setPreviewing(true); setErr('');
    try {
      const r = await crmEmailCampaigns.preview({ audience: audience(), template_id: templateId });
      setPreview(r.data);
    } catch (e: any) { setErr(e?.message || 'Preview failed'); }
    finally { setPreviewing(false); }
  };

  const save = async (thenLaunch: boolean) => {
    if (!name.trim()) { setErr('Give the campaign a name.'); return; }
    if (!templateId) { setErr('Pick an email template.'); return; }
    if (thenLaunch && !confirm(`Send this campaign to ${preview ? preview.count : 'the selected'} recipient(s)? Sending is paced at ${throttle}/min and cannot be undone.`)) return;
    setSaving(true); setErr('');
    try {
      const created = await crmEmailCampaigns.create({
        name: name.trim(),
        template_id: templateId,
        audience: audience(),
        throttle_per_min: throttle,
      });
      const id = created.data.id;
      if (thenLaunch) await crmEmailCampaigns.launch(id);
      router.push(`/dashboard/crm/email-campaigns/${id}`);
    } catch (e: any) { setErr(e?.message || 'Save failed'); setSaving(false); }
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 60, maxWidth: 820 }}>
      <Link href="/dashboard/crm/email-campaigns" style={{ color: C.gray, fontSize: 12, textDecoration: 'none' }}>← Email Campaigns</Link>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, margin: '6px 0 18px' }}>New email campaign</h1>

      {err && <div style={{ ...card, marginBottom: 16, borderColor: 'rgba(224,30,44,0.3)', color: C.red, fontSize: 13, padding: 14 }}>{err}</div>}

      {/* 1 · Basics + template */}
      <div style={card}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 14 }}>1 · Message</div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Campaign name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kinematic × Claude announcement" style={input} />
        </div>
        <div>
          <span style={label}>Email template</span>
          {templates.length === 0 ? (
            <div style={{ fontSize: 13, color: C.gray }}>
              No email templates yet. <Link href="/dashboard/crm/settings" style={{ color: C.blue }}>Create one in Settings → Email templates</Link> first.
            </div>
          ) : (
            <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setPreview(null); }} style={{ ...input, appearance: 'auto' }}>
              <option value="">Select a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {selectedTemplate && (
            <div style={{ marginTop: 10, fontSize: 12, color: C.gray }}>
              Subject: <b style={{ color: C.white }}>{selectedTemplate.subject}</b>
            </div>
          )}
        </div>

        {/* Available merge variables — auto-filled per recipient from their lead record. */}
        <div style={{ marginTop: 16, background: 'var(--s4)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ ...label, marginBottom: 8 }}>Available variables</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {VARIABLES.map((v) => (
              <button key={v.token} type="button"
                onClick={() => { navigator.clipboard?.writeText(v.token); setCopied(v.token); setTimeout(() => setCopied(''), 1200); }}
                title="Copy — paste into the template (Settings → Email Templates)"
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: C.white }}>
                <code style={{ fontSize: 12, color: C.blue }}>{v.token}</code>
                <span style={{ fontSize: 11, color: C.grayd }}>{v.desc}</span>
                {copied === v.token && <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>copied</span>}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.grayd, lineHeight: 1.6 }}>
            Put these in the template (Settings → Email Templates) — each email fills them from the contact&apos;s record automatically. A blank first name falls back to <b style={{ color: C.gray }}>&ldquo;there&rdquo;</b> (so <code>Hi {'{{first_name}}'},</code> never sends as <code>Hi ,</code>).
          </div>
        </div>
      </div>

      {/* 2 · Audience */}
      <div style={card}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 4 }}>2 · Audience</div>
        <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>
          Leads with an email address. Unsubscribed and previously-bounced addresses are always skipped. Leave filters blank to reach everyone.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: C.white, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={consentOnly} onChange={(e) => { setConsentOnly(e.target.checked); setPreview(null); }} style={{ accentColor: C.green }} />
          Only leads with marketing consent <span style={{ color: C.grayd }}>(recommended)</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div><span style={label}>Status (comma-separated)</span><input value={statusCsv} onChange={(e) => { setStatusCsv(e.target.value); setPreview(null); }} placeholder="new, contacted" style={input} /></div>
          <div><span style={label}>City (comma-separated)</span><input value={cityCsv} onChange={(e) => { setCityCsv(e.target.value); setPreview(null); }} placeholder="Mumbai, Delhi" style={input} /></div>
          <div><span style={label}>Tags (comma-separated)</span><input value={tagsCsv} onChange={(e) => { setTagsCsv(e.target.value); setPreview(null); }} placeholder="webinar, vip" style={input} /></div>
          <div>
            <span style={label}>Type</span>
            <select value={b2c} onChange={(e) => { setB2c(e.target.value as any); setPreview(null); }} style={{ ...input, appearance: 'auto' }}>
              <option value="">Any</option>
              <option value="true">B2C only</option>
              <option value="false">B2B only</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button onClick={runPreview} disabled={previewing || !templateId} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: previewing || !templateId ? 'not-allowed' : 'pointer', opacity: previewing || !templateId ? 0.6 : 1 }}>
            {previewing ? 'Resolving…' : 'Preview audience'}
          </button>
        </div>

        {preview && (
          <div style={{ marginTop: 16, background: 'var(--s4)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{preview.count.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 600, color: C.gray }}>eligible recipient{preview.count === 1 ? '' : 's'}</span></div>
            <div style={{ fontSize: 12, color: C.grayd, marginTop: 6 }}>
              From {preview.total_candidates.toLocaleString()} matched · skipped {preview.skipped.no_email} no-email · {preview.skipped.duplicate} duplicate · {preview.skipped.suppressed} unsubscribed/bounced
            </div>
            {preview.sample_recipients.length > 0 && (
              <div style={{ fontSize: 12, color: C.gray, marginTop: 8 }}>
                e.g. {preview.sample_recipients.slice(0, 5).map((r) => r.email).join(', ')}{preview.count > 5 ? ' …' : ''}
              </div>
            )}
            {preview.sample_html && (
              <div style={{ marginTop: 14 }}>
                <div style={{ ...label, marginBottom: 8 }}>Preview (first recipient) — {preview.subject}</div>
                <iframe title="preview" srcDoc={preview.sample_html} style={{ width: '100%', height: 420, border: `1px solid ${C.border}`, borderRadius: 10, background: '#fff' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3 · Pacing + send */}
      <div style={card}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 14 }}>3 · Send</div>
        <div style={{ maxWidth: 240, marginBottom: 18 }}>
          <span style={label}>Pace (emails per minute)</span>
          <input type="number" min={1} max={500} value={throttle} onChange={(e) => setThrottle(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} style={input} />
          <div style={{ fontSize: 11, color: C.grayd, marginTop: 6 }}>Protects your sender reputation. 60/min is a safe default.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => save(false)} disabled={saving} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '11px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>Save draft</button>
          <button onClick={() => save(true)} disabled={saving} style={{ background: C.red, border: 'none', color: '#fff', padding: '11px 22px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Working…' : 'Create & Send'}</button>
        </div>
      </div>
    </div>
  );
}
