'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messagingApi, type ThreadRow, type MessageRow, type ScopedUser } from '../../lib/messagingApi';
import MentionInput, { renderMentions } from './MentionInput';
import { pushPermission, enableBrowserPush, disableBrowserPush, registerServiceWorker } from '../../lib/webPush';

/**
 * Floating chat widget — sits bottom-right of every authenticated
 * dashboard page. Replaces the sidebar "Inbox" nav entry per the
 * Messenger / Intercom pattern: a circular FAB that expands into a
 * compact 360×520 chat panel with a thread list and selected thread.
 *
 * Coexists with KinematicAI's KINI FAB by offsetting itself 70px to
 * the left (KINI sits at right:30, this sits at right:100).
 */
export default function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'threads' | 'thread' | 'compose'>('threads');
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pushState, setPushState] = useState<string>('default');

  const reloadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const r = await messagingApi.listThreads();
      setThreads(r.data || []);
    } catch { /* silent — widget should never block the page with toasts */ }
    finally { setLoadingThreads(false); }
  }, []);

  const reloadMessages = useCallback(async (threadId: string) => {
    setLoadingMsgs(true);
    try {
      const r = await messagingApi.listMessages(threadId);
      setMessages(r.data || []);
      void messagingApi.markRead(threadId);
    } catch { /* silent */ }
    finally { setLoadingMsgs(false); }
  }, []);

  // Initial thread load + service worker register so push starts working
  // as soon as the user grants permission.
  useEffect(() => { reloadThreads(); registerServiceWorker(); setPushState(pushPermission()); }, [reloadThreads]);

  // Background polling — same cadence as the full-page inbox so unread
  // badges stay fresh even when the widget is collapsed.
  useEffect(() => {
    const t = setInterval(() => { void reloadThreads(); }, 15_000);
    return () => clearInterval(t);
  }, [reloadThreads]);
  useEffect(() => {
    if (!open || view !== 'thread' || !selected) return;
    void reloadMessages(selected);
    const t = setInterval(() => reloadMessages(selected), 8_000);
    return () => clearInterval(t);
  }, [open, view, selected, reloadMessages]);

  const totalUnread = useMemo(() => threads.reduce((s, t) => s + (t.unread_count || 0), 0), [threads]);
  const selectedThread = useMemo(() => threads.find((t) => t.id === selected) || null, [threads, selected]);

  const openThread = (id: string) => {
    setSelected(id);
    setView('thread');
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
    } finally { setSending(false); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void send(); }
  };

  const togglePush = async () => {
    if (pushState === 'granted') {
      await disableBrowserPush();
      setPushState('default');
      toast.success('Browser notifications disabled');
      return;
    }
    const r = await enableBrowserPush();
    if (r.ok) { setPushState('granted'); toast.success('Browser notifications enabled'); }
    else toast.error(r.reason);
  };

  return (
    <>
      {/* Collapsed FAB — circular button with unread badge */}
      {!open && (
        <button
          aria-label="Open chat"
          onClick={() => { setOpen(true); reloadThreads(); }}
          style={{
            position: 'fixed',
            bottom: 'calc(30px + env(safe-area-inset-bottom))',
            right: 100,
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--primary)', color: '#fff',
            border: 'none', cursor: 'pointer',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 998,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {totalUnread > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -2,
              minWidth: 20, height: 20, padding: '0 6px',
              background: '#fff', color: 'var(--primary)',
              borderRadius: 999, fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--primary)',
            }}>{totalUnread > 99 ? '99+' : totalUnread}</span>
          )}
        </button>
      )}

      {/* Expanded chat panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Messages"
          style={{
            position: 'fixed',
            bottom: 'calc(20px + env(safe-area-inset-bottom))',
            right: 'max(20px, env(safe-area-inset-right))',
            width: 'min(380px, calc(100vw - 30px))',
            height: 'min(560px, calc(100vh - 80px))',
            background: 'var(--s1)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', zIndex: 999,
          }}
        >
          {/* Header */}
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            background: 'var(--s2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {view !== 'threads' && (
                <button onClick={() => setView('threads')} style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 4, display: 'flex' }} aria-label="Back">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {view === 'threads' ? 'Messages' : view === 'compose' ? 'New conversation' : (selectedThread?.kind === 'team' ? (selectedThread?.name || 'Team Chat') : 'Direct Message')}
                </div>
                {view === 'thread' && selectedThread && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    {selectedThread.member_ids.length} member{selectedThread.member_ids.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={togglePush}
                disabled={pushState === 'unsupported'}
                title={pushState === 'unsupported' ? 'Push not supported' : pushState === 'granted' ? 'Disable notifications' : 'Enable notifications'}
                style={{ background: 'transparent', border: 'none', color: pushState === 'granted' ? 'var(--primary)' : 'var(--text-dim)', cursor: pushState === 'unsupported' ? 'not-allowed' : 'pointer', padding: 4, display: 'flex' }}
                aria-label="Toggle notifications"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18 M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          {/* Body */}
          {view === 'threads' && (
            <ThreadsView
              loading={loadingThreads}
              threads={threads}
              onOpen={openThread}
              onCompose={() => setView('compose')}
            />
          )}
          {view === 'thread' && (
            <ThreadView
              loading={loadingMsgs}
              messages={messages}
              draft={draft}
              sending={sending}
              setDraft={setDraft}
              onKeyDown={onKey}
              onSend={send}
            />
          )}
          {view === 'compose' && (
            <ComposeView
              onCreated={(id) => { reloadThreads().then(() => openThread(id)); }}
              onCancel={() => setView('threads')}
            />
          )}
        </div>
      )}
    </>
  );
}

function ThreadsView({ loading, threads, onOpen, onCompose }: {
  loading: boolean; threads: ThreadRow[]; onOpen: (id: string) => void; onCompose: () => void;
}) {
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && threads.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>}
        {!loading && threads.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            No conversations yet.<br/>Click <b>New message</b> below to start one.
          </div>
        )}
        {threads.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)} style={{
            display: 'flex', width: '100%', padding: '10px 14px', gap: 10, alignItems: 'flex-start',
            background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
            cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8, flexShrink: 0,
              background: t.kind === 'team' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
              color: t.kind === 'team' ? '#F59E0B' : '#6366F1',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
            }}>{t.kind === 'team' ? 'T' : 'DM'}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.kind === 'team' ? (t.name || 'Team Chat') : 'Direct Message'}
                </div>
                {t.unread_count > 0 && (
                  <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 800 }}>{t.unread_count}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.last_message_preview || 'No messages yet'}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', background: 'var(--s2)' }}>
        <button onClick={onCompose} style={{
          width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none',
          background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
        }}>New message</button>
      </div>
    </>
  );
}

function ThreadView({ loading, messages, draft, sending, setDraft, onKeyDown, onSend }: {
  loading: boolean; messages: MessageRow[]; draft: string; sending: boolean;
  setDraft: (s: string) => void; onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; onSend: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [messages.length]);
  return (
    <>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column-reverse', gap: 10 }}>
        {loading && messages.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>Loading…</div>}
        {!loading && messages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 14 }}>
            No messages yet — be the first.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: 'var(--s4)', color: 'var(--text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
            }}>{(m.sender_name || 'U').slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{m.sender_name || 'User'}</span>
                <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                  {new Date(m.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
                {renderMentions(m.body)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: 8, background: 'var(--s2)' }}>
        <MentionInput
          value={draft}
          onChange={setDraft}
          onKeyDown={onKeyDown}
          placeholder="Message — @ to mention (Ctrl/Cmd+Enter)"
          rows={2}
          disabled={sending}
          maxLength={4000}
          style={{ fontSize: 12.5, minHeight: 48 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={onSend}
            disabled={sending || !draft.trim()}
            style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? 0.5 : 1 }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </>
  );
}

function ComposeView({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
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
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['dm', 'team'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', background: kind === k ? 'var(--primary)' : 'transparent', color: kind === k ? '#fff' : 'var(--text)', cursor: 'pointer' }}>
            {k === 'dm' ? 'Direct message' : 'Team chat'}
          </button>
        ))}
      </div>
      {kind === 'team' && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team chat name (optional)" maxLength={80} style={{ width: '100%', padding: 9, fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)' }} />
      )}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selected.map((u) => (
            <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', background: 'var(--s3)', borderRadius: 999, fontSize: 11 }}>
              {u.full_name || u.email}
              <button onClick={() => remove(u.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={kind === 'dm' && selected.length >= 1 ? 'DM is 1-on-1 — remove to pick another' : 'Search by name or email…'}
        disabled={kind === 'dm' && selected.length >= 1}
        style={{ width: '100%', padding: 9, fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)' }}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--s2)' }}>
        {results.length === 0 && <div style={{ padding: 10, fontSize: 11, color: 'var(--text-dim)' }}>No matches.</div>}
        {results.map((u) => (
          <button key={u.id} onClick={() => add(u)} disabled={!!selected.find((s) => s.id === u.id) || (kind === 'dm' && selected.length >= 1)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
            <div style={{ fontWeight: 600 }}>{u.full_name || u.email}</div>
            {u.city_names.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{u.city_names.join(', ')}</div>}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onCancel} style={{ padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={submitting || selected.length === 0} style={{ padding: '7px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: 'var(--primary)', border: 'none', color: '#fff', cursor: submitting || selected.length === 0 ? 'not-allowed' : 'pointer', opacity: submitting || selected.length === 0 ? 0.5 : 1 }}>
          {submitting ? 'Creating…' : kind === 'dm' ? 'Start DM' : 'Create'}
        </button>
      </div>
    </div>
  );
}
