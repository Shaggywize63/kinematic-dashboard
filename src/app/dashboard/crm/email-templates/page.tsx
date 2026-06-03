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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {templates.map((t) => (
              <button key={t.id} onClick={() => openEdit(t)} style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, fontWeight: 600 }}>{t.subject}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {(t.body_text || t.body_html || '').replace(/<[^>]+>/g, ' ').trim()}
                </div>
                {t.category && <div style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700, marginTop: 8 }}>{t.category}</div>}
              </button>
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
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16,
  textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
};
