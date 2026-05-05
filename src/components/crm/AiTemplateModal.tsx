'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import Modal from './shared/Modal';
import { crmAi } from '../../lib/crmApi';
import type { TemplateDraft } from './TemplateEditModal';

interface Props {
  open: boolean;
  channel: 'email' | 'whatsapp';
  onClose: () => void;
  onApply: (draft: TemplateDraft) => void;
}

const WA_SYSTEM = `You generate WhatsApp message templates that follow Meta business template guidelines.
Return ONLY valid JSON — no prose, no markdown, no code fences — with these keys:
{
  "name": string, snake_case, max 60 chars,
  "header_text": string | null, max 60 chars,
  "body_text": string, max 1024 chars, may include {{1}} {{2}} ordered placeholders,
  "footer_text": string | null, max 60 chars,
  "variables": string[], descriptive names like ["first_name", "order_id"]
}`;

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const candidate = fenced ? fenced[1] : (text.match(/\{[\s\S]*\}/)?.[0] ?? text);
  try { return JSON.parse(candidate) as Record<string, unknown>; } catch { return null; }
}

function extractEmailVars(html: string): string[] {
  const matches = html.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g);
  const set = new Set<string>();
  for (const m of matches) set.add(m[1]);
  return Array.from(set);
}

function toSnake(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'template';
}

export default function AiTemplateModal({ open, channel, onClose, onApply }: Props) {
  const [goal, setGoal] = useState('');
  const [tone, setTone] = useState<'friendly' | 'formal' | 'concise'>('friendly');
  const [audience, setAudience] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setGoal(''); setAudience(''); setTone('friendly'); };

  const generate = async () => {
    if (!goal.trim()) { toast.error('Describe the template goal first'); return; }
    setBusy(true);
    try {
      if (channel === 'email') {
        const r = await crmAi.draftReply({ goal, tone });
        const html = r.data.body_html || r.data.body_text || '';
        onApply({
          channel: 'email',
          isNew: true,
          name: goal.trim().slice(0, 60),
          subject: r.data.subject,
          body_html: html,
          body_text: r.data.body_text || null,
          category: 'marketing',
          variables: extractEmailVars(html),
        });
        reset();
      } else {
        const userMsg = `Create a WhatsApp ${tone} template.
Goal: ${goal}
Audience: ${audience || 'general'}
Return JSON only — no prose, no code fences.`;
        const r = await crmAi.chat({ messages: [{ role: 'user', content: userMsg }], system: WA_SYSTEM });
        const json = extractJson(r.data.text || '');
        const bodyText = (json?.body_text as string) || '';
        if (!bodyText) throw new Error('AI did not return a usable body. Try a different goal phrasing.');
        onApply({
          channel: 'whatsapp',
          isNew: true,
          meta_template_name: toSnake((json?.name as string) || goal),
          category: 'utility',
          language: 'en',
          status: 'pending',
          header_text: (json?.header_text as string) || null,
          body_text: bodyText,
          footer_text: (json?.footer_text as string) || null,
          variables: Array.isArray(json?.variables) ? (json?.variables as string[]) : null,
        });
        reset();
      }
    } catch (e: unknown) { toast.error((e as Error).message || 'Generation failed'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose}
      title={`✦ AI Generate — ${channel === 'email' ? 'Email' : 'WhatsApp'} Template`}
      subtitle="Describe the template goal. Claude drafts the content; you review and edit before saving."
      footer={
        <>
          <button type="button" onClick={onClose} style={btn.secondary}>Cancel</button>
          <button type="button" onClick={generate} disabled={busy || !goal.trim()} style={btn.primary(busy)}>{busy ? 'Generating…' : '✦ Generate'}</button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={lblStyle}>Goal / Description<span style={{ color: '#ef4444', marginLeft: 3 }}>*</span></span>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
            placeholder={channel === 'email'
              ? 'e.g. "Follow up with a B2B lead who downloaded our pricing PDF but has not replied in 5 days. Offer a 15-min demo."'
              : 'e.g. "Notify the customer their order has shipped, with a tracking link and ETA."'}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={lblStyle}>Tone</span>
            <select value={tone} onChange={(e) => setTone(e.target.value as 'friendly' | 'formal' | 'concise')} style={inputStyle}>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
              <option value="concise">Concise</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={lblStyle}>Audience (optional)</span>
            <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. SaaS decision-makers, premium customers" style={inputStyle} />
          </label>
        </div>
        <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>Tip:</strong> Be specific. Mention the audience, the action you want, and any key facts (price, dates, links). The more context you give, the better the draft — you can always edit before saving.
        </div>
      </div>
    </Modal>
  );
}

const lblStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inputStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btn = {
  secondary: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 } as React.CSSProperties,
  primary: (busy: boolean): React.CSSProperties => ({ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 13, opacity: busy ? 0.7 : 1 }),
};
