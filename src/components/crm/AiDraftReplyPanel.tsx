'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { crmAi, crmEmailTemplates } from '../../lib/crmApi';
import AiBadge from './shared/AiBadge';

export default function AiDraftReplyPanel({ leadId, dealId }: { leadId?: string; dealId?: string }) {
  const [thread, setThread] = useState('');
  // Backend draftReply only accepts these three tones — must stay in sync with
  // crm.validators draftReplySchema or every request 400s.
  const [tone, setTone] = useState<'friendly' | 'formal' | 'concise'>('friendly');
  const [goal, setGoal] = useState('book a meeting');
  const [draft, setDraft] = useState<{ subject: string; body_text: string; body_html?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await crmAi.draftReply({ lead_id: leadId, deal_id: dealId, thread, tone, goal });
      setDraft({ subject: r.data.subject, body_text: r.data.body_text, body_html: r.data.body_html });
    } catch (e: any) {
      toast.error(e.message || 'Draft failed');
    } finally {
      setBusy(false);
    }
  };

  // Save the generated draft as a reusable email template so reps don't lose a
  // good draft to a closed panel.
  const saveAsTemplate = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const html = draft.body_html || `<p>${draft.body_text.replace(/\n/g, '<br/>')}</p>`;
      await crmEmailTemplates.create({
        name: (draft.subject || goal).slice(0, 60),
        subject: draft.subject,
        body_html: html,
        body_text: draft.body_text,
        category: 'follow_up',
      } as any);
      toast.success('Saved to templates');
    } catch (e: any) {
      toast.error(e.message || 'Could not save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Draft Reply</div>
        <AiBadge />
      </div>
      <textarea value={thread} onChange={(e) => setThread(e.target.value)} placeholder="Paste recent thread or context here..." rows={4} style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: 10, fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <select value={tone} onChange={(e) => setTone(e.target.value as 'friendly' | 'formal' | 'concise')} style={selectCss}>
          <option value="friendly">Friendly</option>
          <option value="formal">Formal</option>
          <option value="concise">Concise</option>
        </select>
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal" style={{ ...selectCss, flex: 1 }} />
        <button onClick={generate} disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>
          {busy ? '...' : 'Generate'}
        </button>
      </div>
      {draft && (
        <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{draft.subject}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{draft.body_text}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={saveAsTemplate} disabled={saving} style={{ background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '6px 12px', cursor: saving ? 'wait' : 'pointer', fontWeight: 700, fontSize: 12 }}>
              {saving ? 'Saving…' : '+ Add to templates'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const selectCss: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '6px 10px', fontSize: 13 };
