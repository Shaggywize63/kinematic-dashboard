'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock, Check, CheckSquare, ClipboardList, CornerUpRight, MapPin, Phone, Plus, Send, Sparkles, X } from 'lucide-react';
import { crmAi, type LeadUpdate } from '../../../lib/crmApi';
import { LOG_AS, logAsSubject, type LogAs } from '../../../lib/recentUpdatesDesign';
import type { UpdateSuggestion } from '../../../types/crm';
import MentionInput from '../../messaging/MentionInput';
import InlineVoiceDictation from '../InlineVoiceDictation';
import { Button, T, buttonStyle } from '../../ui';

const MAX = 2000;

/**
 * The note box at the head of the timeline, with one-click ways into logging a call, meeting or task.
 *
 * `redesign` (staged rollout — see lib/recentUpdatesDesign.ts) adds a dictation control (with its
 * live "Listening…" state) and, after a note is posted, a "Posted" confirmation with one-tap
 * "log as Call / Visit / Follow-up" chips pre-filled from that note.
 */
export default function Composer({
  leadId, latestUpdate, onSubmit, redesign = false,
}: {
  leadId: string;
  /** Newest update — "Suggest" reads this, never the live draft. */
  latestUpdate: LeadUpdate | null;
  onSubmit: (body: string) => Promise<boolean>;
  redesign?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<UpdateSuggestion | null>(null);
  // The text of the note that was just posted (redesign only) — drives the "Posted · log it as" strip.
  const [posted, setPosted] = useState<string | null>(null);

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
      if (redesign) setPosted(text);
    }
  };

  // Typing a new note retires the "Posted" strip — it was about the previous one.
  const onDraftChange = (v: string) => { setDraft(v); if (v) setPosted(null); };

  // Append a dictated chunk to the draft (space-joined), clamped to the textarea's limit.
  const appendDictation = useCallback((text: string) => {
    setPosted(null);
    setDraft((d) => (((d.trim() ? `${d.trim()} ` : '') + text).slice(0, MAX)));
  }, []);

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
        onChange={onDraftChange}
        onKeyDown={onKeyDown}
        placeholder="Write an update — what was discussed, what's next? Type @ to tag a teammate."
        rows={3}
        maxLength={MAX}
        disabled={saving}
      />
      {redesign && <InlineVoiceDictation onTranscript={appendDictation} disabled={saving} />}
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

      {redesign && posted && (
        <PostedStrip
          onLogAs={(kind, activityType) => goToActivity({ type: activityType, subject: logAsSubject(kind, posted), body: posted })}
          onDismiss={() => setPosted(null)}
        />
      )}

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

const LOG_AS_ICON: Record<LogAs, React.ReactNode> = {
  call: <Phone size={14} strokeWidth={1.8} aria-hidden />,
  visit: <MapPin size={14} strokeWidth={1.8} aria-hidden />,
  follow_up: <CornerUpRight size={14} strokeWidth={1.8} aria-hidden />,
};

/** Shown right after a note is posted: confirms it landed and offers one tap to log it as a structured activity. */
function PostedStrip({ onLogAs, onDismiss }: { onLogAs: (kind: LogAs, activityType: string) => void; onDismiss: () => void }) {
  const chip: React.CSSProperties = {
    border: `1px solid ${T.border}`, background: T.card, color: T.text, padding: '5px 11px', borderRadius: 999,
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
  };
  return (
    <div role="status" aria-live="polite" data-testid="posted-strip" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, background: T.okWash }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 650, color: T.ok }}>
        <Check size={15} strokeWidth={2.2} aria-hidden />Posted
      </span>
      <span style={{ fontSize: 12.5, color: T.dim }}>Log it as</span>
      {LOG_AS.map((o) => (
        <button type="button" key={o.key} style={chip} onClick={() => onLogAs(o.key, o.activityType)} title={`Open a new ${o.label.toLowerCase()} pre-filled from this note`}>
          {LOG_AS_ICON[o.key]}{o.label}
        </button>
      ))}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="km-iconbtn" style={{ marginLeft: 'auto', background: 'none', border: 0, color: T.dim, cursor: 'pointer', width: 24, height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={14} strokeWidth={1.8} />
      </button>
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
            <ClipboardList size={14} strokeWidth={1.8} aria-hidden />Log {typeLabel(s.activity.type)}: {s.activity.subject}
          </button>
        )}
        {s.followup && (
          <button type="button" style={chip} onClick={onFollowup} title={s.followup.message}>
            <Send size={14} strokeWidth={1.8} aria-hidden />Draft {typeLabel(s.followup.channel)} follow-up
          </button>
        )}
        {s.next_actions.map((a, i) => (
          <button type="button" key={i} style={chip} onClick={() => onNextAction(a)} title="Create as a task"><Plus size={14} strokeWidth={1.8} aria-hidden />{a}</button>
        ))}
      </div>
    </div>
  );
}
