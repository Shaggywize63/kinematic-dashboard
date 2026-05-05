'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Modal from './shared/Modal';
import { crmEmailTemplates, crmWhatsappTemplates } from '../../lib/crmApi';

export type TemplateDraft = {
  channel: 'email' | 'whatsapp';
  isNew?: boolean;
  id?: string;
  // email
  name?: string;
  subject?: string;
  body_html?: string | null;
  body_text?: string | null;
  variables?: string[] | null;
  // shared
  category?: string | null;
  // whatsapp
  meta_template_name?: string;
  language?: string;
  status?: 'pending' | 'approved' | 'rejected';
  header_text?: string | null;
  footer_text?: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  draft: TemplateDraft | null;
  onSaved: () => void;
}

export default function TemplateEditModal({ open, onClose, draft, onSaved }: Props) {
  const [form, setForm] = useState<TemplateDraft>({ channel: 'email' });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [varInput, setVarInput] = useState('');

  useEffect(() => {
    if (open && draft) {
      setForm({ ...draft, language: draft.language || 'en' });
      setVarInput('');
    }
  }, [open, draft]);

  if (!draft) return null;
  const isEmail = form.channel === 'email';
  const isNew = !!draft.isNew;

  const submit = async () => {
    setBusy(true);
    try {
      if (isEmail) {
        if (!form.name || !form.subject) { toast.error('Name and Subject are required'); setBusy(false); return; }
        const body = {
          name: form.name, subject: form.subject,
          body_html: form.body_html || '', body_text: form.body_text || null,
          category: form.category || null, variables: form.variables || null,
        };
        if (isNew) await crmEmailTemplates.create(body);
        else if (form.id) await crmEmailTemplates.update(form.id, body);
      } else {
        if (!form.meta_template_name || !form.body_text) { toast.error('Template name and body are required'); setBusy(false); return; }
        const body = {
          meta_template_name: form.meta_template_name,
          category: (form.category as 'utility' | 'marketing' | 'authentication') || 'utility',
          language: form.language || 'en',
          status: form.status || 'pending',
          header_text: form.header_text || null,
          body_text: form.body_text,
          footer_text: form.footer_text || null,
          variables: form.variables || null,
        };
        if (isNew) await crmWhatsappTemplates.create(body);
        else if (form.id) await crmWhatsappTemplates.update(form.id, body);
      }
      toast.success('Template saved');
      onSaved();
    } catch (e: unknown) { toast.error((e as Error).message || 'Save failed'); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!form.id) return;
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    setDeleting(true);
    try {
      if (isEmail) await crmEmailTemplates.remove(form.id);
      else await crmWhatsappTemplates.remove(form.id);
      toast.success('Template deleted');
      onSaved();
    } catch (e: unknown) { toast.error((e as Error).message || 'Delete failed'); setDeleting(false); }
  };

  const addVar = () => {
    const v = varInput.trim();
    if (!v) return;
    const list = form.variables || [];
    if (list.includes(v)) { setVarInput(''); return; }
    setForm({ ...form, variables: [...list, v] });
    setVarInput('');
  };
  const removeVar = (v: string) => setForm({ ...form, variables: (form.variables || []).filter((x) => x !== v) });

  return (
    <Modal open={open} onClose={onClose}
      title={isNew ? `New ${isEmail ? 'Email' : 'WhatsApp'} Template` : `Edit ${isEmail ? 'Email' : 'WhatsApp'} Template`}
      subtitle={isEmail ? 'Use {{variable}} placeholders for dynamic fields like {{first_name}}.' : 'Use {{1}}, {{2}} for ordered Meta variables. Status is set when Meta approves the template.'}
      footer={
        <>
          {!isNew && form.id && (
            <button type="button" onClick={remove} disabled={deleting} style={btn.danger(deleting)}>{deleting ? 'Deleting…' : 'Delete'}</button>
          )}
          <button type="button" onClick={onClose} style={btn.secondary}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} style={btn.primary(busy)}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }>
      {isEmail ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name" required value={form.name || ''} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Subject" required value={form.subject || ''} onChange={(v) => setForm({ ...form, subject: v })} />
          <Select label="Category" value={form.category || ''} onChange={(v) => setForm({ ...form, category: v || null })}
            options={[{ value: '', label: '—' }, { value: 'sales', label: 'Sales' }, { value: 'follow_up', label: 'Follow-up' }, { value: 'onboarding', label: 'Onboarding' }, { value: 'support', label: 'Support' }, { value: 'marketing', label: 'Marketing' }]} />
          <Area label="HTML Body" required rows={10} value={form.body_html || ''} onChange={(v) => setForm({ ...form, body_html: v })} />
          <Area label="Plain Text (optional)" rows={5} value={form.body_text || ''} onChange={(v) => setForm({ ...form, body_text: v })} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Template Name (Meta)" required value={form.meta_template_name || ''} onChange={(v) => setForm({ ...form, meta_template_name: v })} placeholder="order_shipped_v1" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Select label="Category" value={form.category || 'utility'} onChange={(v) => setForm({ ...form, category: v })}
              options={[{ value: 'utility', label: 'Utility' }, { value: 'marketing', label: 'Marketing' }, { value: 'authentication', label: 'Authentication' }]} />
            <Field label="Language" value={form.language || 'en'} onChange={(v) => setForm({ ...form, language: v })} placeholder="en" />
            <Select label="Status" value={form.status || 'pending'} onChange={(v) => setForm({ ...form, status: v as 'pending' | 'approved' | 'rejected' })}
              options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
          </div>
          <Field label="Header Text (optional, max 60 chars)" value={form.header_text || ''} onChange={(v) => setForm({ ...form, header_text: v || null })} />
          <Area label="Body" required rows={6} value={form.body_text || ''} onChange={(v) => setForm({ ...form, body_text: v })} placeholder="Hi {{1}}, your order #{{2}} has shipped." />
          <Field label="Footer Text (optional, max 60 chars)" value={form.footer_text || ''} onChange={(v) => setForm({ ...form, footer_text: v || null })} />
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={lblStyle}>Variables</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {(form.variables || []).map((v) => (
            <span key={v} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 999, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {v}
              <button type="button" onClick={() => removeVar(v)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }} aria-label={`Remove ${v}`}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={varInput} onChange={(e) => setVarInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }} placeholder={isEmail ? 'e.g. first_name' : 'e.g. customer_name'} style={inputStyle} />
          <button type="button" onClick={addVar} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Add</button>
        </div>
      </div>
    </Modal>
  );
}

const lblStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 };
const inputStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, flex: 1 };

function Field(p: { label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={lblStyle}>{p.label}{p.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</span>
      <input value={p.value} onChange={(e) => p.onChange(e.target.value)} required={p.required} placeholder={p.placeholder} style={inputStyle} />
    </label>
  );
}
function Area(p: { label: string; value: string; onChange: (v: string) => void; required?: boolean; rows?: number; placeholder?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={lblStyle}>{p.label}{p.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}</span>
      <textarea value={p.value} onChange={(e) => p.onChange(e.target.value)} required={p.required} rows={p.rows || 4} placeholder={p.placeholder} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
    </label>
  );
}
function Select(p: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={lblStyle}>{p.label}</span>
      <select value={p.value} onChange={(e) => p.onChange(e.target.value)} style={inputStyle}>
        {p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
  danger: (busy: boolean): React.CSSProperties => ({ background: 'var(--s3)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', padding: '8px 14px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13, opacity: busy ? 0.7 : 1, marginRight: 'auto' }),
};
