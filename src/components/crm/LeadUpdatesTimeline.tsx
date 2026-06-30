'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmAi, type LeadUpdate } from '../../lib/crmApi';
import type { UpdateSuggestion } from '../../types/crm';
import { getStoredUser } from '../../lib/auth';
import OwnerAvatar from './shared/OwnerAvatar';
import MentionInput, { renderMentions } from '../messaging/MentionInput';

// Roles that may delete a teammate's update (mirrors the backend allow-list).
const ADMIN_ROLES = new Set(['super_admin', 'admin', 'org_admin']);

/**
 * Append-only timeline of free-form Updates for a lead.
 *
 * Pairs with the backend `crm_lead_updates` table shipped in the
 * lead-NBA-and-Updates PR. Every entry stamps the author + timestamp,
 * the newest entry is denormalised onto crm_leads.latest_update so the
 * list view can show it as a column without a per-row lookup, and
 * adding an entry invalidates the NBA cache server-side so the next
 * Suggest click reflects the new context.
 */
export default function LeadUpdatesTimeline({
  leadId,
  onAdded,
}: {
  leadId: string;
  // Called after a successful add — parent uses it to refresh `latest_update`
  // on the in-memory lead row + to trigger an NBA recompute.
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<LeadUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<UpdateSuggestion | null>(null);

  // Current user — drives the per-row edit (author only) / delete (author or
  // admin) gates. Read once; the stored user doesn't change within a session.
  const me = getStoredUser();
  const myId = me?.id ?? null;
  const isAdmin = !!me?.role && ADMIN_ROLES.has(me.role);

  // Persist an edited body and swap the row in place; the backend re-syncs
  // the lead's latest_update, so notify the parent to refresh that column.
  const editUpdate = async (updateId: string, body: string): Promise<boolean> => {
    const text = body.trim();
    if (!text) return false;
    try {
      const r = await crmLeads.editUpdate(leadId, updateId, { body: text });
      setItems((prev) => prev.map((it) => (it.id === updateId ? r.data : it)));
      toast.success('Update edited');
      onAdded?.();
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Failed to edit update');
      return false;
    }
  };

  const deleteUpdate = async (updateId: string) => {
    try {
      await crmLeads.deleteUpdate(leadId, updateId);
      setItems((prev) => prev.filter((it) => it.id !== updateId));
      toast.success('Update deleted');
      onAdded?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete update');
    }
  };

  const reload = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const r = await crmLeads.updates(leadId, { limit: 100 });
      setItems(r.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load updates');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { reload(); }, [reload]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    if (text.length > 2000) {
      toast.error('Update is too long (max 2000 characters)');
      return;
    }
    setSaving(true);
    try {
      const r = await crmLeads.addUpdate(leadId, { body: text });
      // Prepend rather than reload — feels instant and matches the order
      // the GET endpoint returns (newest first).
      setItems((prev) => [r.data, ...prev]);
      setDraft('');
      // Drop any suggestion tied to the previous update so the panel doesn't
      // show stale advice for an update that's no longer the latest.
      setSuggestion(null);
      toast.success('Update added');
      onAdded?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save update');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd-Enter submits — keeps the keyboard flow fast for power users
    // without stealing plain Enter (multi-line notes are common).
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  // ✨ Suggest — asks KINI to read the draft and propose the next CRM action
  // (an activity to log, a follow-up to draft, quick next steps). Uses the
  // lightweight /ai/suggest-from-update helper so it never touches the
  // monthly KINI chat quota.
  const suggest = async () => {
    // Suggest only runs once an update has been logged, and reads the latest
    // *submitted* update (newest-first, so items[0]) — never the live draft.
    const text = items[0]?.body?.trim() || '';
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
    } catch (e: any) {
      toast.error(e.message || 'Could not get a suggestion');
    } finally {
      setSuggesting(false);
    }
  };

  // Every chip deep-links to the activity composer pre-filled, reusing the
  // existing /activities/new query-param prefill (lead_id/type/subject/body/due_at).
  const goToActivity = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams({ lead_id: leadId });
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    router.push(`/dashboard/crm/activities/new?${qs.toString()}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <MentionInput
          value={draft}
          onChange={setDraft}
          onKeyDown={onKeyDown}
          placeholder="Add an update — type @ to tag a teammate (Ctrl/Cmd+Enter to save)"
          rows={3}
          maxLength={2000}
          disabled={saving}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {draft.length}/2000 · stamps your name and time · @-mentioned teammates get notified
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {items.length > 0 && (
              <button
                onClick={suggest}
                disabled={suggesting}
                title="Ask KINI to suggest the next action for your latest update"
                style={{
                  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: suggesting ? 'not-allowed' : 'pointer',
                  opacity: suggesting ? 0.5 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <span>✨</span>{suggesting ? 'Thinking…' : 'Suggest'}
              </button>
            )}
            <button
              onClick={submit}
              disabled={saving || !draft.trim()}
              style={{
                background: 'var(--primary)', border: 'none', color: '#fff',
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || !draft.trim() ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Add update'}
            </button>
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
            onFollowup={() => goToActivity({
              type: suggestion.followup!.channel,
              subject: 'Follow-up',
              body: suggestion.followup!.message,
            })}
            onNextAction={(label) => goToActivity({ type: 'task', subject: label })}
          />
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 10 }}>Loading updates…</div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 10 }}>
          No updates yet. Add the first one above — recent updates are fed into the next-best-action recommender.
        </div>
      )}
      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((u) => (
            <UpdateRow
              key={u.id}
              u={u}
              canEdit={!!myId && u.author_id === myId}
              canDelete={(!!myId && u.author_id === myId) || isAdmin}
              onEdit={(body) => editUpdate(u.id, body)}
              onDelete={() => deleteUpdate(u.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// KINI's read of the typed update: a chip per suggested next step. Each chip
// opens the activity composer pre-filled — the rep reviews + saves, nothing is
// logged silently.
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
    border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--text)',
    padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  };
  const typeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <div style={{
      border: '1px solid var(--border)', background: 'var(--s3)', borderRadius: 10,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.3 }}>
          ✨ KINI suggests
        </span>
        <button onClick={onDismiss} title="Dismiss" style={{
          background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14,
        }}>×</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {s.activity && (
          <button style={chip} onClick={onActivity} title={s.activity.body || ''}>
            📋 Log {typeLabel(s.activity.type)}: {s.activity.subject}
          </button>
        )}
        {s.followup && (
          <button style={chip} onClick={onFollowup} title={s.followup.message}>
            ✉️ Draft {typeLabel(s.followup.channel)} follow-up
          </button>
        )}
        {s.next_actions.map((a, i) => (
          <button key={i} style={chip} onClick={() => onNextAction(a)} title="Create as a task">
            ✓ {a}
          </button>
        ))}
      </div>
    </div>
  );
}

function UpdateRow({
  u, canEdit, canDelete, onEdit, onDelete,
}: {
  u: LeadUpdate;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => void | Promise<void>;
}) {
  const who = u.author_name || 'Unknown';
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editText, setEditText] = useState(u.body);
  const [busy, setBusy] = useState(false);

  const saveEdit = async () => {
    if (!editText.trim() || busy) return;
    setBusy(true);
    const ok = await onEdit(editText);
    setBusy(false);
    if (ok) setEditing(false);
  };

  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontSize: 11, fontWeight: 600, color: 'var(--text-dim)',
  };

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '10px 12px', background: 'var(--s3)',
      border: '1px solid var(--border)', borderRadius: 8,
    }}>
      <OwnerAvatar name={who} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{who}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }} title={new Date(u.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
            {formatRelative(u.created_at)}
          </span>
          {/* Edit / delete affordances — only for the author (edit) or an
              admin (delete). Pushed to the right of the meta row. */}
          {!editing && (canEdit || canDelete) && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              {canEdit && (
                <button style={linkBtn} onClick={() => { setEditText(u.body); setEditing(true); }}>Edit</button>
              )}
              {canDelete && !confirmDel && (
                <button style={{ ...linkBtn, color: 'var(--danger, #D01E2C)' }} onClick={() => setConfirmDel(true)}>Delete</button>
              )}
              {canDelete && confirmDel && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Delete?</span>
                  <button style={{ ...linkBtn, color: 'var(--danger, #D01E2C)' }} onClick={() => { setConfirmDel(false); void onDelete(); }}>Yes</button>
                  <button style={linkBtn} onClick={() => setConfirmDel(false)}>No</button>
                </>
              )}
            </span>
          )}
        </div>

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <MentionInput
              value={editText}
              onChange={setEditText}
              rows={3}
              maxLength={2000}
              disabled={busy}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={linkBtn} onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
              <button
                onClick={saveEdit}
                disabled={busy || !editText.trim()}
                style={{
                  background: 'var(--primary)', border: 'none', color: '#fff',
                  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: busy || !editText.trim() ? 'not-allowed' : 'pointer',
                  opacity: busy || !editText.trim() ? 0.5 : 1,
                }}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
            {renderMentions(u.body)}
          </div>
        )}
      </div>
    </div>
  );
}

// Lightweight relative-time formatter — keeps the component self-contained
// without pulling in date-fns just for this one usage. Falls back to the
// locale string on the day boundary so anything older than ~3 days shows
// the actual date rather than "12 days ago".
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 45) return 'just now';
  if (sec < 90) return '1m ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 3) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}
