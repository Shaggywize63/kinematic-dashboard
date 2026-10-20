'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, CheckSquare, Phone, Sparkles, X } from 'lucide-react';
import { crmAi, type LeadUpdate } from '../../../lib/crmApi';
import type { UpdateSuggestion } from '../../../types/crm';
import MentionInput from '../../messaging/MentionInput';
import { Button, T, buttonStyle } from '../../ui';

const MAX = 2000;

/** The note box at the head of the timeline, with one-click ways into logging a call, meeting or task. */
export default function Composer({
  leadId, latestUpdate, onSubmit,
}: {
  leadId: string;
  /** Newest update — "Suggest" reads this, never the live draft. */
  latestUpdate: LeadUpdate | null;
  onSubmit: (body: string) => Promise<boolean>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<UpdateSuggestion | null>(null);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    if (text.length > MAX) { toast.error(`Update is too long (max ${MAX} characters)`); return; }
    setSaving(true);
    const ok = await onSubmit(text);
    setSaving(false);
    if (ok) {
      setDraft('');
      // A suggestion tied to the previous update would now be stale advice.
      setSuggestion(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd-Enter submits without stealing plain Enter (multi-line notes are common).
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submit(); }
  };

  // KINI reads the latest *submitted* update and proposes the next CRM action. Uses the
  // lightweight /ai/suggest-from-update helper, so it never touches the monthly KINI chat quota.
  const suggest = async () => {
    const text = latestUpdate?.body?.trim();
    if (!text) return;
    setSuggesting(true);
    setSuggestion(null);
    try {
      const r = await crmAi.suggestFromUpdate({ lead_id: leadId, draft: text });
      const s = r.data;
      if (!s || (!s.activity && !s.followup && (s.next_actions?.length ?? 0) === 0)) {
        toast.info('No suggestion for this update — try adding a bit more detail.');
        return;
      }
      setSuggestion(s);
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Could not get a suggestion');
    } finally {
      setSuggesting(false);
    }
  };

  // Every chip deep-links to the activity composer pre-filled; the rep reviews and saves — nothing is logged silently.
  const goToActivity = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams({ lead_id: leadId });
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    router.push(`/dashboard/crm/activities/new?${qs.toString()}`);
  };

  const quick = (type: string) => `/dashboard/crm/activities/new?lead_id=${leadId}&type=${type}`;
  const quickStyle: React.CSSProperties = { ...buttonStyle('ghost', 'sm'), textDecoration: 'none', color: T.dim, gap: 6 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <MentionInput
        value={draft}
        onChange={setDraft}
        onKeyDown={onKeyDown}
        placeholder="Write an update — what was discussed, what's next? Type @ to tag a teammate."
        rows={3}
        maxLength={MAX}
        disabled={saving}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Link href={quick('call')} className="km-btn" data-variant="ghost" style={quickStyle}><Phone size={14} strokeWidth={1.8} aria-hidden />Log call</Link>
          <Link href={quick('meeting')} className="km-btn" data-variant="ghost" style={quickStyle}><CalendarClock size={14} strokeWidth={1.8} aria-hidden />Meeting</Link>
          <Link href={quick('task')} className="km-btn" data-variant="ghost" style={quickStyle}><CheckSquare size={14} strokeWidth={1.8} aria-hidden />Task</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: draft.length > MAX * 0.9 ? T.warn : T.mute, fontFamily: T.mono }} aria-live="polite">{draft.length}/{MAX}</span>
          {latestUpdate && (
            <Button size="sm" onClick={suggest} disabled={suggesting} title="Ask KINI to suggest the next action for your latest update" icon={<Sparkles size={14} strokeWidth={1.8} />}>
              {suggesting ? 'Thinking…' : 'Suggest'}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={submit} disabled={saving || !draft.trim()} title="Ctrl/Cmd + Enter">
            {saving ? 'Saving…' : 'Add update'}
          </Button>
        </div>
      </div>

      {suggestion && (
        <SuggestionPanel
          s={suggestion}
          onDismiss={() => setSuggestion(null)}
          onActivity={() => goToActivity({
            type: suggestion.activity!.type,
            subject: suggestion.activity!.subject,
            body: suggestion.activity!.body || undefined,
            due_at: suggestion.activity!.due_at || undefined,
          })}
          onFollowup={() => goToActivity({ type: suggestion.followup!.channel, subject: 'Follow-up', body: suggestion.followup!.message })}
          onNextAction={(label) => goToActivity({ type: 'task', subject: label })}
        />
      )}
    </div>
  );
}

function SuggestionPanel({
  s, onDismiss, onActivity, onFollowup, onNextAction,
}: {
  s: UpdateSuggestion;
  onDismiss: () => void;
  onActivity: () => void;
  onFollowup: () => void;
  onNextAction: (label: string) => void;
}) {
  const chip: React.CSSProperties = {
    border: `1px solid ${T.border}`, background: T.card, color: T.text, padding: '6px 12px', borderRadius: 999,
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
  };
  const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <div style={{ border: `1px solid ${T.border}`, background: 'var(--s3)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.dim, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} strokeWidth={1.8} color="var(--red)" aria-hidden />KINI suggests
        </span>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggestions" className="km-iconbtn" style={{ background: 'none', border: 0, color: T.dim, cursor: 'pointer', width: 24, height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {s.activity && (
          <button type="button" style={chip} onClick={onActivity} title={s.activity.body || ''}>
            Log {typeLabel(s.activity.type)}: {s.activity.subject}
          </button>
        )}
        {s.followup && (
          <button type="button" style={chip} onClick={onFollowup} title={s.followup.message}>
            Draft {typeLabel(s.followup.channel)} follow-up
          </button>
        )}
        {s.next_actions.map((a, i) => (
          <button type="button" key={i} style={chip} onClick={() => onNextAction(a)} title="Create as a task">+ {a}</button>
        ))}
      </div>
    </div>
  );
}
