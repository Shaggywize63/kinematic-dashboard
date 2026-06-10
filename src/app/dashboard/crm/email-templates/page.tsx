'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmEmailTemplates } from '../../../../lib/crmApi';
import type { EmailTemplate } from '../../../../types/crm';
import TemplateEditModal, { type TemplateDraft } from '../../../../components/crm/TemplateEditModal';
import AiTemplateModal from '../../../../components/crm/AiTemplateModal';

// Email template management — create/edit reusable email templates (subject +
// HTML body) that feed the Email Alerts composer's template dropdown. Mirrors
// the WhatsApp templates page; the shared TemplateEditModal handles the
// channel='email' shape and AiTemplateModal can draft one from a goal + tone.
export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await crmEmailTemplates.list();
      setTemplates(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Could not load email templates'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setDraft({ channel: 'email', isNew: true }); setEditOpen(true); };
  const openEdit = (template: EmailTemplate) => {
    setDraft({ channel: 'email', isNew: false, ...(template as unknown as Record<string, unknown>) } as TemplateDraft);
    setEditOpen(true);
  };
  const onAiResult = (result: TemplateDraft) => {
    setDraft(result);
    setAiOpen(false);
    setEditOpen(true);
  };

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          Reusable email templates (subject + HTML body) for the alert composer. Use <strong style={{ color: 'var(--text)' }}>✦ AI Generate</strong> to draft one from a goal and tone — KINI AI returns a structured draft you review and edit before saving.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{templates.length} email template{templates.length === 1 ? '' : 's'}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setAiOpen(true)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✦ AI Generate</button>
          <button onClick={openNew} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ New Template</button>
        </div>
      </div>

      {loading ? <div style={{ color: 'var(--text-dim)', padding: 24 }}>Loading...</div> : (
        templates.length === 0 ? (
          <div style={{ background: 'var(--s2)', border: '1px dashed var(--border)', borderRadius: 12, padding: 36, textAlign: 'center', color: 'var(--text-dim)' }}>
            No email templates yet — click <strong style={{ color: 'var(--text)' }}>+ New Template</strong> or <strong style={{ color: 'var(--text)' }}>✦ AI Generate</strong> to add one.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 14 }}>
            {templates.map((t) => (
              <div key={t.id} style={cardStyle}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(t)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(t); } }}
                  style={{
                    padding: '14px 16px 12px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.subject}
                    </div>
                    {t.category && (
                      <div style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700, marginTop: 6 }}>{t.category}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'rgba(62,158,255,0.1)',
                    padding: '4px 10px', borderRadius: 6, flexShrink: 0,
                  }}>Edit ↗</span>
                </div>
                <HtmlPreview html={t.body_html || ''} fallback={t.body_text || ''} />
              </div>
            ))}
          </div>
        )
      )}

      <TemplateEditModal
        open={editOpen}
        onClose={() => { setEditOpen(false); setDraft(null); }}
        draft={draft}
        onSaved={() => { setEditOpen(false); setDraft(null); load(); }}
      />
      <AiTemplateModal
        open={aiOpen}
        channel="email"
        onClose={() => setAiOpen(false)}
        onApply={onAiResult}
      />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--s2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 0,
  textAlign: 'left',
  font: 'inherit',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

// Scrollable HTML preview of the template body — fixed-height window onto the
// real rendered email. Users can scroll inside the iframe to read the whole
// thing without the card growing unbounded. Sandbox="" blocks scripts/network.
function HtmlPreview({ html, fallback }: { html: string; fallback: string }) {
  const PREVIEW_H = 260;
  const isEmpty = !html.trim() && !fallback.trim();

  if (isEmpty) {
    return (
      <div style={{
        height: PREVIEW_H,
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontSize: 12,
      }}>
        No content
      </div>
    );
  }

  const srcDoc = html.trim()
    ? wrapHtml(html)
    : wrapHtml(`<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;color:#0f172a;margin:0;">${escapeHtml(fallback)}</pre>`);

  return (
    <div style={{
      height: PREVIEW_H,
      background: '#fff',
      overflow: 'hidden',
    }}>
      <iframe
        title="Email preview"
        srcDoc={srcDoc}
        sandbox=""
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#fff',
          display: 'block',
        }}
      />
    </div>
  );
}

function wrapHtml(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    html,body{margin:0;padding:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#0f172a;background:#fff;line-height:1.5;}
    img{max-width:100%;height:auto;}
    a{color:#2563eb;}
    table{max-width:100%;}
  </style></head><body>${body}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
