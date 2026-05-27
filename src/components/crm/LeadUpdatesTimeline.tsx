'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmLeads, type LeadUpdate } from '../../lib/crmApi';
import OwnerAvatar from './shared/OwnerAvatar';

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
  const [items, setItems] = useState<LeadUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add an update — what just happened on this lead? (Ctrl/Cmd+Enter to save)"
          rows={3}
          maxLength={2000}
          disabled={saving}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--s3)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: 10, borderRadius: 8, fontSize: 13,
            resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
            opacity: saving ? 0.6 : 1, minHeight: 60,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {draft.length}/2000 · stamps your name and time · feeds the next NBA
          </div>
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
            <UpdateRow key={u.id} u={u} />
          ))}
        </div>
      )}
    </div>
  );
}

function UpdateRow({ u }: { u: LeadUpdate }) {
  const who = u.author_name || 'Unknown';
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
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
          {u.body}
        </div>
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
