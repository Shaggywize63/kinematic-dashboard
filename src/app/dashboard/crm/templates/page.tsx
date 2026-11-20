'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmWhatsappTemplates } from '../../../../lib/crmApi';
import type { WhatsappTemplate } from '../../../../types/crm';
import TemplateEditModal, { type TemplateDraft } from '../../../../components/crm/TemplateEditModal';
import AiTemplateModal from '../../../../components/crm/AiTemplateModal';
import { MessageCircle, Plus, Sparkles } from 'lucide-react';
import { IconTile, InlineIcon } from '../../../../components/ui/PageIcon';
import { TOOLBAR_BTN_MIN_WIDTH } from '../../../../components/ui';
import { CrmToolbarLeft, CrmToolbarRight } from '../../../../components/crm/layout/CrmPageToolbar';

// Email templates were removed. This page now manages WhatsApp templates only;
// the previous email/WhatsApp tab toggle has been collapsed accordingly.

export default function TemplatesPage() {
  const [waTemplates, setWaTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await crmWhatsappTemplates.list();
      setWaTemplates(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Could not load WhatsApp templates'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setDraft({ channel: 'whatsapp', isNew: true }); setEditOpen(true); };
  const openEdit = (template: WhatsappTemplate) => {
    setDraft({ channel: 'whatsapp', isNew: false, ...(template as unknown as Record<string, unknown>) } as TemplateDraft);
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
          Reusable WhatsApp templates for outreach. Use <strong style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}><InlineIcon icon={Sparkles} size={13} style={{ verticalAlign: '-2px', marginRight: 3 }} />AI Generate</strong> to draft a template from a goal and tone — Claude returns a structured draft you review and edit before saving.
        </div>
      </div>

      <CrmToolbarLeft>
        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{waTemplates.length} WhatsApp template{waTemplates.length === 1 ? '' : 's'}</span>
      </CrmToolbarLeft>
      <CrmToolbarRight>
        <button onClick={() => setAiOpen(true)} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: TOOLBAR_BTN_MIN_WIDTH.md }}><InlineIcon icon={Sparkles} />AI Generate</button>
        <button onClick={openNew} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: TOOLBAR_BTN_MIN_WIDTH.md }}><InlineIcon icon={Plus} />New Template</button>
      </CrmToolbarRight>

      {loading ? <div style={{ color: 'var(--text-dim)', padding: 24 }}>Loading...</div> : (
        waTemplates.length === 0 ? (
          <div style={{ background: 'var(--s2)', border: '1px dashed var(--border)', borderRadius: 12, padding: 36, textAlign: 'center', color: 'var(--text-dim)' }}>
            <IconTile icon={MessageCircle} size={40} iconSize={20} style={{ marginBottom: 10 }} />
            <div>No WhatsApp templates yet — click <strong style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}><InlineIcon icon={Plus} size={13} style={{ verticalAlign: '-2px', marginRight: 3 }} />New Template</strong> or <strong style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}><InlineIcon icon={Sparkles} size={13} style={{ verticalAlign: '-2px', marginRight: 3 }} />AI Generate</strong> to add one.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {waTemplates.map((t) => (
              <button key={t.id} onClick={() => openEdit(t)} style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}><InlineIcon icon={MessageCircle} size={14} style={{ color: 'var(--text-dim)' }} />{t.meta_template_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.body_text}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700 }}>{t.category}</span>
                  <span style={{ fontSize: 10, color: t.status === 'approved' ? '#10b981' : t.status === 'rejected' ? '#ef4444' : 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{t.status}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{t.language}</span>
                </div>
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
        channel="whatsapp"
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
