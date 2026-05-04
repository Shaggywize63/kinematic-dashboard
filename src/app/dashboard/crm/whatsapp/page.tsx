'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmWhatsapp, crmWhatsappTemplates } from '../../../../lib/crmApi';
import { useCrmDateRange } from '../../../../stores/crmDateRangeStore';
import type { WhatsappLog, WhatsappTemplate } from '../../../../types/crm';

const STATUS_COLORS: Record<string, string> = {
  queued: '#F7B538', sent: '#7B61FF', delivered: '#00B4D8', read: '#28B463',
  replied: '#28B463', received: '#00B4D8', failed: '#E01E2C',
};

export default function WhatsappPage() {
  const [logs, setLogs] = useState<WhatsappLog[]>([]);
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState({
    to: '', body_text: '', template_id: '',
    template_variables: '' /* JSON string */,
  });
  const [sending, setSending] = useState(false);
  const range = useCrmDateRange((s) => ({ from: s.from, to: s.to }));

  const reload = async () => {
    setLoading(true);
    try {
      const [l, t] = await Promise.all([
        crmWhatsapp.logs(range),
        crmWhatsappTemplates.list(),
      ]);
      setLogs(l.data || []);
      setTemplates(t.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composer.to.trim()) return toast.error('Recipient phone is required');
    if (!composer.body_text && !composer.template_id) return toast.error('Provide a message body or pick a template');
    setSending(true);
    let vars: Record<string, string> | undefined;
    if (composer.template_variables.trim()) {
      try { vars = JSON.parse(composer.template_variables); } catch { toast.error('Variables JSON is invalid'); setSending(false); return; }
    }
    try {
      await crmWhatsapp.send({
        to: composer.to.trim(),
        body_text: composer.body_text || undefined,
        template_id: composer.template_id || undefined,
        template_variables: vars,
      });
      toast.success('Message queued and sent (stub provider)');
      setComposer({ to: '', body_text: '', template_id: '', template_variables: '' });
      reload();
    } catch (err: any) { toast.error(err.message || 'Send failed'); }
    finally { setSending(false); }
  };

  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <form onSubmit={send} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Compose WhatsApp</div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Stub provider — messages log only, no real delivery yet.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Field label="To (phone, e.g. +919876543210)">
            <input value={composer.to} onChange={(e) => setComposer({ ...composer, to: e.target.value })} style={input} required />
          </Field>
          <Field label="Template (optional)">
            <select value={composer.template_id} onChange={(e) => setComposer({ ...composer, template_id: e.target.value })} style={input}>
              <option value="">— freeform body —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.meta_template_name} ({t.language})</option>)}
            </select>
          </Field>
          <Field label="Body">
            <textarea value={composer.body_text} onChange={(e) => setComposer({ ...composer, body_text: e.target.value })} rows={3}
              placeholder='Type message or leave blank if using a template' style={{ ...input, resize: 'vertical' }} />
          </Field>
          <Field label='Template variables (JSON, e.g. {"1":"Acme","2":"500"})'>
            <input value={composer.template_variables} onChange={(e) => setComposer({ ...composer, template_variables: e.target.value })} style={input} placeholder='{}' />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="submit" disabled={sending}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Direction</th><th style={th}>To / From</th><th style={th}>Body</th><th style={th}>Status</th><th style={th}>Sent</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>}
            {!loading && logs.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No messages yet.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={td}><span style={{ textTransform: 'capitalize' }}>{l.direction}</span></td>
                <td style={td}>{l.direction === 'outbound' ? l.to_phone : l.from_phone}</td>
                <td style={{ ...td, maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.body_text || (l.media_url ? `[${l.media_type}]` : '—')}</td>
                <td style={td}><span style={{ color: STATUS_COLORS[l.status] || 'var(--text-dim)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{l.status}</span></td>
                <td style={td}>{l.sent_at ? new Date(l.sent_at).toLocaleString() : new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
