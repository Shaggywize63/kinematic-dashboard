'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Modal from './shared/Modal';
import api from '../../lib/api';
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
  // Optional media header — WhatsApp Business API fetches this URL.
  header_media_type?: 'image' | 'video' | 'document' | null;
  header_media_url?: string | null;
  // Per-language overrides keyed by ISO code. Top-level body/header/footer
  // are the source (language column = source language, usually 'en').
  translations?: Record<string, { body_text?: string; header_text?: string; footer_text?: string }> | null;
};

// Languages supported for WhatsApp templates. Trimmed per product req to
// English + the four eastern-India dialects most relevant to the Tata
// Tiscon footprint. To re-enable a language later, add its code here AND
// in the backend whatsappTranslate.service's LANG_NAMES map.
const SUPPORTED_LANGS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'or', label: 'Odia (ଓଡ଼ିଆ)' },
  { code: 'bn', label: 'Bengali (বাংলা)' },
  { code: 'as', label: 'Assamese (অসমীয়া)' },
];

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
          header_media_type: form.header_media_type || null,
          header_media_url:  form.header_media_url  || null,
          translations:      form.translations      || null,
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
            <Select label="Language" value={form.language || 'en'} onChange={(v) => setForm({ ...form, language: v })}
              options={SUPPORTED_LANGS.map((l) => ({ value: l.code, label: l.label }))} />
            <Select label="Status" value={form.status || 'pending'} onChange={(v) => setForm({ ...form, status: v as 'pending' | 'approved' | 'rejected' })}
              options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
          </div>

          {/* Optional media header. Image + Document support direct upload
              from the browser (POST /upload/photo or /upload/file). Video
              stays URL-only because videos are large and a self-hosted CDN
              would balloon the storage bill — paste the YouTube/CDN link. */}
          <MediaHeaderField
            type={form.header_media_type || null}
            url={form.header_media_url || ''}
            onChange={(t, u) => setForm({ ...form, header_media_type: t, header_media_url: u })}
          />

          <Field label="Header Text (optional, max 60 chars)" value={form.header_text || ''} onChange={(v) => setForm({ ...form, header_text: v || null })} />
          <Area label="Body" required rows={6} value={form.body_text || ''} onChange={(v) => setForm({ ...form, body_text: v })} placeholder="Hi {{1}}, your order #{{2}} has shipped." />
          <Field label="Footer Text (optional, max 60 chars)" value={form.footer_text || ''} onChange={(v) => setForm({ ...form, footer_text: v || null })} />

          {/* Auto-translate to Indian languages — only available once the
              template has been saved at least once (needs an id). */}
          {!isNew && form.id && <TranslationsPanel form={form} setForm={setForm} />}
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
// Header-media row: select type, then either upload (image/document) or
// paste URL (video). Upload goes through the existing /api/v1/upload/:type
// endpoint and stores the returned public URL on the template.
function MediaHeaderField({ type, url, onChange }: {
  type: 'image' | 'video' | 'document' | null;
  url: string;
  onChange: (t: 'image' | 'video' | 'document' | null, url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const accept = type === 'image' ? 'image/*' : type === 'document' ? '.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : '';
  const uploadType = type === 'document' ? 'file' : 'photo';

  const upload = async (f: File) => {
    if (!f) return;
    if (type === 'image' && !/^image\//.test(f.type)) { toast.error('Pick an image'); return; }
    if (f.size > 25 * 1024 * 1024) { toast.error('File must be under 25 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
      const orgId = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || '') : '';
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/${uploadType}`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-Id': orgId } : {}) },
        body: fd,
      });
      const json = await r.json();
      const u = json?.data?.url || json?.url;
      if (!u) throw new Error(json?.error || json?.message || 'Upload failed');
      onChange(type, u);
      toast.success('Uploaded');
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
      <Select
        label="Header Media (optional)"
        value={type || ''}
        onChange={(v) => onChange((v || null) as 'image' | 'video' | 'document' | null, v ? url : null)}
        options={[
          { value: '',         label: 'None' },
          { value: 'image',    label: 'Image' },
          { value: 'video',    label: 'Video (URL only)' },
          { value: 'document', label: 'Document' },
        ]}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Video stays URL-only by design */}
        {type === 'video' ? (
          <Field label="Video URL" value={url} onChange={(v) => onChange(type, v || null)} placeholder="https://… (YouTube, Vimeo, CDN — must be publicly fetchable)" />
        ) : type === 'image' || type === 'document' ? (
          <>
            <span style={lblStyle}>{type === 'image' ? 'Image' : 'Document'}</span>
            {url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                {type === 'image'
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={url} alt="header" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
                  : <span style={{ fontSize: 24 }}>📄</span>}
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-dim)', wordBreak: 'break-all' }}>{url}</div>
                <button type="button" onClick={() => onChange(type, null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Replace</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={fileRef} type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} disabled={uploading} style={{ ...inputStyle, padding: 6, flex: 'unset', width: 'auto' }} />
                {uploading && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Uploading…</span>}
              </div>
            )}
          </>
        ) : (
          <Field label="Media URL (set type first)" value={url} onChange={() => {}} placeholder="Pick a type above to enable" />
        )}
      </div>
    </div>
  );
}

// Translation panel — fires POST /whatsapp-templates/:id/translate, displays
// per-language previews, lets the user re-translate a single language if
// they tweaked the source.
function TranslationsPanel({ form, setForm }: { form: TemplateDraft; setForm: (f: TemplateDraft) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const source = (form.language || 'en').toLowerCase();
  const candidates = SUPPORTED_LANGS.filter((l) => l.code !== source);

  const translate = async (langs: string[]) => {
    if (!form.id || !langs.length) return;
    setBusy(true);
    try {
      const r = await api.post<{ success?: boolean; data?: { translations: Record<string, { body_text: string; header_text?: string; footer_text?: string }> } } | { translations: Record<string, { body_text: string; header_text?: string; footer_text?: string }> }>(`/api/v1/crm/whatsapp-templates/${form.id}/translate`, { languages: langs });
      const result = ((r as any).data ?? r) as { translations: Record<string, { body_text: string; header_text?: string; footer_text?: string }> };
      setForm({ ...form, translations: { ...(form.translations || {}), ...result.translations } });
      toast.success(`Translated to ${langs.length} language${langs.length === 1 ? '' : 's'}`);
      setPicked([]);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Translation failed');
    } finally { setBusy(false); }
  };

  const togglePick = (code: string) => setPicked(picked.includes(code) ? picked.filter((c) => c !== code) : [...picked, code]);
  const existingCodes = Object.keys(form.translations || {});

  return (
    <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>Translations</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Auto-translate body + header + footer via Claude. Placeholders like <code style={{ fontFamily: 'monospace' }}>{'{{1}}'}</code> are preserved verbatim.</div>
        </div>
        {existingCodes.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{existingCodes.length} saved</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {candidates.map((l) => {
          const has = existingCodes.includes(l.code);
          const isPicked = picked.includes(l.code);
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => togglePick(l.code)}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 999,
                border: `1px solid ${isPicked ? 'var(--primary)' : 'var(--border)'}`,
                background: isPicked ? 'var(--primary)' : has ? 'rgba(0,217,126,0.1)' : 'transparent',
                color: isPicked ? '#fff' : has ? '#10b981' : 'var(--text-dim)',
                cursor: 'pointer', fontWeight: 700,
              }}
              title={has ? 'Translation saved — re-translate to refresh' : 'Pick to translate'}
            >
              {l.label}{has ? ' ✓' : ''}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => translate(picked)}
          disabled={busy || picked.length === 0}
          style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (busy || picked.length === 0) ? 0.5 : 1 }}
        >
          {busy ? 'Translating…' : picked.length === 0 ? 'Pick languages to translate' : `Translate ${picked.length}`}
        </button>
        {existingCodes.length > 0 && (
          <button
            type="button"
            onClick={() => translate(existingCodes)}
            disabled={busy}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
            title="Re-translate every saved language using the latest source"
          >
            Refresh all
          </button>
        )}
      </div>

      {existingCodes.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {existingCodes.map((code) => {
            const label = SUPPORTED_LANGS.find((l) => l.code === code)?.label || code;
            const t = form.translations?.[code];
            const open = expanded === code;
            return (
              <div key={code} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : code)}
                  style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{open ? '▼' : '▶'}</span>
                </button>
                {open && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                    {t?.header_text && <div><strong style={{ color: 'var(--text)' }}>Header:</strong> {t.header_text}</div>}
                    {t?.body_text   && <div style={{ whiteSpace: 'pre-wrap' }}><strong style={{ color: 'var(--text)' }}>Body:</strong> {t.body_text}</div>}
                    {t?.footer_text && <div><strong style={{ color: 'var(--text)' }}>Footer:</strong> {t.footer_text}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
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
