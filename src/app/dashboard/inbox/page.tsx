'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { messagingApi, type ThreadRow, type MessageRow, type ScopedUser } from '../../../lib/messagingApi';
import MentionInput, { renderMentions } from '../../../components/messaging/MentionInput';
import { pushPermission, enableBrowserPush, disableBrowserPush, registerServiceWorker } from '../../../lib/webPush';

/**
 * Inbox + team chat surface.
 *
 *   Left column   — thread list (DMs + team chats) with unread badges
 *   Right column  — selected thread, message list (reversed because the
 *                   API returns newest first), composer with @mentions
 *
 * URL: /dashboard/inbox?thread=:id is the deep-link the push notification
 * click handler navigates to.
 */
export default function InboxPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [selected, setSelected] = useState<string | null>(params.get('thread'));
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [pushState, setPushState] = useState<string>('default');

  const reloadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const r = await messagingApi.listThreads();
      setThreads(r.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load inbox');
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const reloadMessages = useCallback(async (threadId: string) => {
    setLoadingMsgs(true);
    try {
      const r = await messagingApi.listMessages(threadId);
      setMessages(r.data || []);
      void messagingApi.markRead(threadId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load messages');
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => { reloadThreads(); registerServiceWorker(); setPushState(pushPermission()); }, [reloadThreads]);
  useEffect(() => { if (selected) reloadMessages(selected); }, [selected, reloadMessages]);

  // Light polling for new messages — keeps the UX live without a websocket
  // layer. 8s feels responsive on a real-world inbox and is cheap for the
  // backend. Replace with Supabase Realtime if/when latency demands it.
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(() => reloadMessages(selected), 8_000);
    return () => clearInterval(t);
  }, [selected, reloadMessages]);
  useEffect(() => {
    const t = setInterval(() => reloadThreads(), 15_000);
    return () => clearInterval(t);
  }, [reloadThreads]);

  const selectThread = (id: string) => {
    setSelected(id);
    router.replace(`/dashboard/inbox?thread=${id}`);
  };

  const send = async () => {
    if (!selected) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const r = await messagingApi.sendMessage(selected, text);
      setMessages((prev) => [r.data, ...prev]);
      setDraft('');
      void reloadThreads();
    } catch (e: any) {
      toast.error(e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void send(); }
  };

  const totalUnread = threads.reduce((s, t) => s + (t.unread_count || 0), 0);
  const selectedThread = useMemo(() => threads.find((t) => t.id === selected) || null, [threads, selected]);

  const togglePush = async () => {
    if (pushState === 'granted') {
      await disableBrowserPush();
      setPushState('default');
      toast.success('Browser notifications disabled');
      return;
    }
    const r = await enableBrowserPush();
    if (r.ok) { setPushState('granted'); toast.success('Browser notifications enabled'); }
    else      { toast.error(r.reason); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 130px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Inbox</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            {totalUnread > 0 ? `${totalUnread} unread` : 'You\'re all caught up'} · DMs and team chats appear here
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={togglePush}
            disabled={pushState === 'unsupported'}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8,
              background: pushState === 'granted' ? 'var(--s3)' : 'transparent',
              color: pushState === 'granted' ? 'var(--text)' : 'var(--text-dim)',
              border: '1px solid var(--border)', cursor: pushState === 'unsupported' ? 'not-allowed' : 'pointer',
              opacity: pushState === 'unsupported' ? 0.5 : 1,
            }}
            title={pushState === 'unsupported' ? 'Push not supported in this browser' : 'Toggle browser notifications'}
          >
            {pushState === 'granted' ? 'Notifications on' : pushState === 'denied' ? 'Notifications blocked' : 'Enable notifications'}
          </button>
          <button
            onClick={() => setComposeOpen(true)}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            New message
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 320px) 1fr', gap: 14,
        flex: 1, minHeight: 0,
      }}>
        <aside style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--s2)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 480 }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Conversations</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loadingThreads && <div style={{ padding: 14, fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>}
            {!loadingThreads && threads.length === 0 && (
              <div style={{ padding: 14, fontSize: 12, color: 'var(--text-dim)' }}>
                No conversations yet. Click <b>New message</b> to start one.
              </div>
            )}
            {threads.map((t) => (
              <ThreadRowItem key={t.id} t={t} active={t.id === selected} onClick={() => selectThread(t.id)} />
            ))}
          </div>
        </aside>

        <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--s2)', display: 'flex', flexDirection: 'column', minHeight: 480 }}>
          {!selected && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Pick a conversation on the left, or start a new one.
            </div>
          )}
          {selected && (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {selectedThread?.kind === 'team' ? (selectedThread?.name || 'Team Chat') : 'Direct Message'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {selectedThread?.member_ids?.length ?? 0} members
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column-reverse', gap: 10 }}>
                {loadingMsgs && messages.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>}
                {!loadingMsgs && messages.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>
                    No messages yet — be the first to say something.
                  </div>
                )}
                {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', padding: 10 }}>
                <MentionInput
                  value={draft}
                  onChange={setDraft}
                  onKeyDown={onKey}
                  placeholder="Type a message — @ to mention (Ctrl/Cmd+Enter to send)"
                  rows={2}
                  disabled={sending}
                  maxLength={4000}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{draft.length}/4000 · text supports any language</div>
                  <button
                    onClick={send}
                    disabled={sending || !draft.trim()}
                    style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? 0.5 : 1 }}
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onCreated={(id) => { setComposeOpen(false); reloadThreads().then(() => selectThread(id)); }}
        />
      )}
    </div>
  );
}

function ThreadRowItem({ t, active, onClick }: { t: ThreadRow; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', width: '100%', padding: '10px 12px', gap: 10, alignItems: 'flex-start',
        background: active ? 'var(--s3)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: t.kind === 'team' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
        color: t.kind === 'team' ? '#F59E0B' : '#6366F1',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
      }}>{t.kind === 'team' ? 'T' : 'DM'}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.kind === 'team' ? (t.name || 'Team Chat') : `Direct Message · ${t.member_ids.length} member${t.member_ids.length === 1 ? '' : 's'}`}
          </div>
          {t.unread_count > 0 && (
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 800 }}>
              {t.unread_count}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.last_message_preview || 'No messages yet'}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ m }: { m: MessageRow }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'var(--s4)', color: 'var(--text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
      }}>{(m.sender_name || 'U').slice(0, 1).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{m.sender_name || 'User'}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }} title={new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
            {new Date(m.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
          {renderMentions(m.body)}
        </div>
      </div>
    </div>
  );
}

function ComposeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<'dm' | 'team'>('dm');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScopedUser[]>([]);
  const [selected, setSelected] = useState<ScopedUser[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    messagingApi.searchMentions(query)
      .then((r) => { if (!cancelled) setResults(r.data || []); })
      .catch(() => { if (!cancelled) setResults([]); });
    return () => { cancelled = true; };
  }, [query]);

  const add = (u: ScopedUser) => {
    if (selected.find((s) => s.id === u.id)) return;
    if (kind === 'dm' && selected.length >= 1) return;
    setSelected((s) => [...s, u]);
    setQuery('');
  };
  const remove = (id: string) => setSelected((s) => s.filter((u) => u.id !== id));

  const submit = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      let id: string;
      if (kind === 'dm') {
        const r = await messagingApi.createDm(selected[0].id);
        id = r.data.id;
      } else {
        const r = await messagingApi.createTeam(name.trim() || 'Team Chat', selected.map((s) => s.id));
        id = r.data.id;
      }
      onCreated(id);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create');
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>New conversation</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['dm', 'team'] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: kind === k ? 'var(--primary)' : 'transparent', color: kind === k ? '#fff' : 'var(--text)', cursor: 'pointer' }}>
              {k === 'dm' ? 'Direct message' : 'Team chat'}
            </button>
          ))}
        </div>
        {kind === 'team' && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team chat name (optional)" maxLength={80} style={{ width: '100%', padding: 10, fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', marginBottom: 10 }} />
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selected.map((u) => (
            <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--s3)', borderRadius: 999, fontSize: 12 }}>
              {u.full_name || u.email}
              <button onClick={() => remove(u.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'dm' && selected.length >= 1 ? 'DM is a 1-on-1 — remove the selected user to pick a different one' : 'Search by name or email…'}
          disabled={kind === 'dm' && selected.length >= 1}
          style={{ width: '100%', padding: 10, fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', marginBottom: 8 }}
        />
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--s2)' }}>
          {results.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>No matches in your team.</div>}
          {results.map((u) => (
            <button key={u.id} onClick={() => add(u)} disabled={!!selected.find((s) => s.id === u.id) || (kind === 'dm' && selected.length >= 1)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
              <div style={{ fontWeight: 600 }}>{u.full_name || u.email}</div>
              {u.city_names.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{u.city_names.join(', ')}</div>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={submitting || selected.length === 0} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'var(--primary)', border: 'none', color: '#fff', cursor: submitting || selected.length === 0 ? 'not-allowed' : 'pointer', opacity: submitting || selected.length === 0 ? 0.5 : 1 }}>
            {submitting ? 'Creating…' : kind === 'dm' ? 'Start DM' : 'Create team chat'}
          </button>
        </div>
      </div>
    </div>
  );
}
