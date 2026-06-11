'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmEmails, crmEmailTemplates } from '../../../../../lib/crmApi';
import { verifiedSendersApi, type VerifiedSender } from '../../../../../lib/emailAlertsApi';
import type { EmailTemplate } from '../../../../../types/crm';

/**
 * Compose Email — single-recipient send path.
 *
 * Picks up where the email-templates polish left off. Adds the affordances
 * the bare-bones composer was missing:
 *   - Verified sender picker (loads /crm/verified-senders, defaults to
 *     the org's default sender if one is set)
 *   - To / Cc / Bcc chip-style multi-recipient inputs
 *   - Subject + preheader (preview text, hidden in most clients but
 *     visible in the inbox preview line)
 *   - Template picker with live merge-variable filling
 *     ({{ first_name }} / {{ company }} / {{ last_name }})
 *   - Live HTML preview iframe beside the body editor — sandboxed, so
 *     a tenant pasting untrusted HTML can't escape the page
 *   - "Send test to self" — drops the real recipients and sends to the
 *     active verified-sender's address so reps can sanity-check the
 *     render before the real send
 *
 * Submission still hits the existing one-off endpoint
 * (POST /crm/emails) so we don't churn the backend yet — the multi-
 * recipient + scheduled flow is what /email-alerts is for.
 */

interface FormState {
  from_email: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  preheader: string;
  body_html: string;
}

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export default function ComposeEmailPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [senders, setSenders] = useState<VerifiedSender[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({
    from_email: '',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    preheader: '',
    body_html: '',
  });
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    crmEmailTemplates.list()
      .then((r) => { if (!cancelled) setTemplates((r.data || []) as EmailTemplate[]); })
      .catch(() => { /* non-fatal */ });
    verifiedSendersApi.list(true)
      .then((r) => {
        if (cancelled) return;
        const list = (r.data || []) as VerifiedSender[];
        setSenders(list);
        const def = list.find((s) => s.is_default) || list[0];
        if (def) setForm((f) => ({ ...f, from_email: def.email }));
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  // Picking a template fills subject + body. Variables in the template
  // get surfaced as editable inputs so the rep can fill {{ first_name }}
  // etc. before sending.
  const applyTemplate = (id: string) => {
    setSelectedTemplate(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setForm((f) => ({ ...f, subject: t.subject || '', body_html: t.body_html || '' }));
    // Collect every distinct token from subject + body.
    const tokens = new Set<string>();
    const collect = (s: string | null | undefined) => {
      if (!s) return;
      let m;
      while ((m = TOKEN_RE.exec(s)) !== null) tokens.add(m[1]);
    };
    collect(t.subject);
    collect(t.body_html);
    const next: Record<string, string> = {};
    tokens.forEach((k) => { next[k] = variables[k] || ''; });
    setVariables(next);
  };

  // Render subject + body with the rep's filled variables for the
  // preview iframe + the actual send.
  const merge = (s: string): string =>
    s.replace(TOKEN_RE, (_, key) => variables[key] ?? `{{${key}}}`);

  const mergedSubject = useMemo(() => merge(form.subject), [form.subject, variables]);
  const mergedBody    = useMemo(() => merge(form.body_html), [form.body_html, variables]);

  const previewSrcDoc = useMemo(() => {
    const preheader = form.preheader.trim();
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        html,body{margin:0;padding:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#0f172a;background:#fff;line-height:1.5;}
        img{max-width:100%;height:auto;}
        a{color:#2563eb;}
      </style></head><body>
        ${preheader ? `<div style="font-size:11px;color:#94a3b8;border-left:2px solid #e2e8f0;padding-left:6px;margin-bottom:10px;">${escapeHtml(preheader)}</div>` : ''}
        ${mergedBody || '<div style="color:#94a3b8;font-size:12px;">Preview will render here as you type.</div>'}
      </body></html>`;
  }, [mergedBody, form.preheader]);

  const parseEmails = (raw: string): string[] =>
    raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

  const validate = (recipientsRequired = true): { ok: true; to: string[]; cc: string[]; bcc: string[] } | { ok: false; error: string } => {
    if (!form.from_email.trim()) return { ok: false, error: 'Pick a verified sender first.' };
    const to  = parseEmails(form.to);
    const cc  = parseEmails(form.cc);
    const bcc = parseEmails(form.bcc);
    if (recipientsRequired && to.length === 0) return { ok: false, error: 'At least one To recipient is required.' };
    const bad = [...to, ...cc, ...bcc].find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (bad) return { ok: false, error: `"${bad}" is not a valid email address.` };
    if (!form.subject.trim()) return { ok: false, error: 'Subject is required.' };
    if (!form.body_html.trim()) return { ok: false, error: 'Body is required.' };
    return { ok: true, to, cc, bcc };
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(true);
    if (!v.ok) return toast.error(v.error);
    setBusy(true);
    try {
      // The one-off endpoint accepts single to_email + from_email. For
      // multiple recipients we fan-out client-side so each lands as its
      // own email log row (consistent with reporting on opens/clicks).
      const targets = [...v.to, ...v.cc, ...v.bcc];
      await Promise.all(targets.map((to_email) => crmEmails.create({
        to_email,
        from_email: form.from_email || undefined,
        subject: mergedSubject,
        body_html: mergedBody,
        template_id: selectedTemplate || undefined,
      })));
      toast.success(targets.length > 1 ? `Queued ${targets.length} emails` : 'Email queued');
      router.push('/dashboard/crm/emails');
    } catch (err: any) {
      toast.error(err.message || 'Send failed');
      setBusy(false);
    }
  };

  const sendTest = async () => {
    const v = validate(false);
    if (!v.ok) return toast.error(v.error);
    if (!form.from_email) return toast.error('No verified sender — cannot send a test.');
    setTestBusy(true);
    try {
      await crmEmails.create({
        to_email: form.from_email,
        from_email: form.from_email,
        subject: `[TEST] ${mergedSubject}`,
        body_html: mergedBody,
        template_id: selectedTemplate || undefined,
      });
      toast.success(`Test sent to ${form.from_email}`);
    } catch (err: any) {
      toast.error(err.message || 'Test send failed');
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }} className="compose-grid">
      <form onSubmit={send} style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 22, fontWeight: 800 }}>Compose Email</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
            <button type="button" disabled={testBusy} onClick={sendTest} style={btnSecondary}>
              {testBusy ? 'Sending…' : 'Send Test to Self'}
            </button>
            <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
        </div>

        {/* From / Template — paired on top so the rep picks identity + skeleton first */}
        <Row>
          <Field label="From (verified sender)">
            <select value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} style={input}>
              {senders.length === 0 && <option value="">No verified sender — add one in CRM › Email Senders</option>}
              {senders.map((s) => (
                <option key={s.id} value={s.email}>
                  {s.display_name ? `${s.display_name} <${s.email}>` : s.email}{s.is_default ? ' • default' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template">
            <select value={selectedTemplate} onChange={(e) => applyTemplate(e.target.value)} style={input}>
              <option value="">(none — write from scratch)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </Row>

        {/* Recipients */}
        <Row>
          <Field label="To *">
            <input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="lead@example.com, second@example.com" style={input} />
          </Field>
        </Row>
        <Row>
          <Field label="Cc">
            <input value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} placeholder="(optional)" style={input} />
          </Field>
          <Field label="Bcc">
            <input value={form.bcc} onChange={(e) => setForm({ ...form, bcc: e.target.value })} placeholder="(optional)" style={input} />
          </Field>
        </Row>

        {/* Subject + preheader */}
        <Row>
          <Field label="Subject *">
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} style={input} />
          </Field>
        </Row>
        <Row>
          <Field label="Preheader (preview text)">
            <input value={form.preheader} onChange={(e) => setForm({ ...form, preheader: e.target.value })}
              placeholder="The short line inboxes show below the subject"
              style={input} />
          </Field>
        </Row>

        {/* Merge variables if a template's been picked + any tokens were found */}
        {Object.keys(variables).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              Merge variables
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {Object.entries(variables).map(([k, v]) => (
                <Field key={k} label={k}>
                  <input value={v} onChange={(e) => setVariables({ ...variables, [k]: e.target.value })}
                    placeholder={`{{${k}}}`}
                    style={input} />
                </Field>
              ))}
            </div>
          </div>
        )}

        {/* Body editor + live preview side-by-side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }} className="compose-body-grid">
          <Field label="Body (HTML)">
            <textarea required rows={14} value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })}
              placeholder="<p>Hi {{ first_name }},</p>"
              style={{ ...input, fontFamily: 'ui-monospace, monospace', lineHeight: 1.55, resize: 'vertical' }} />
          </Field>
          <div>
            <div style={labelStyle}>Preview</div>
            <div style={{
              border: '1px solid var(--border)', borderRadius: 10, background: '#fff',
              overflow: 'hidden', height: 360,
            }}>
              <iframe
                title="Email preview"
                srcDoc={previewSrcDoc}
                sandbox=""
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              Subject after merge: <strong style={{ color: 'var(--text)' }}>{mergedSubject || '—'}</strong>
            </div>
          </div>
        </div>
      </form>

      <style jsx>{`
        @media (min-width: 1024px) {
          :global(.compose-body-grid) { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── presentational atoms ────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Array.isArray(children) ? children.length : 1}, 1fr)`, gap: 12, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: 0.5, marginBottom: 4, display: 'inline-block',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24,
};

const input: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '10px 12px', borderRadius: 8, fontSize: 13, width: '100%', outline: 'none',
};

const btnGhost: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
};

const btnSecondary: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
};

const btnPrimary: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff',
  padding: '8px 18px', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontSize: 13,
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
