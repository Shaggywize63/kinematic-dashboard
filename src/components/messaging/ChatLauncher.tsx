'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messagingApi, type ThreadRow, type MessageRow, type ScopedUser } from '../../lib/messagingApi';
import MentionInput, { renderMentions } from './MentionInput';
import { pushPermission, enableBrowserPush, disableBrowserPush, registerServiceWorker } from '../../lib/webPush';

/**
 * Header chat trigger + popup.
 *
 * Lives in the dashboard top header next to NotificationBell:
 *
 *   - The trigger is a 36×36 icon button with an unread badge.
 *   - On desktop, clicking opens a 380×560 popover anchored under the
 *     header (right-aligned). Click-outside closes.
 *   - On mobile (<640px) the popover becomes a full-screen sheet so
 *     thread rows don't squeeze into a 360px floating window.
 *
 * The trigger keeps polling thread metadata (every 15s) even when the
 * popup is closed so the unread badge stays accurate.
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const h = () => setIsMobile(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const reloadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const r = await messagingApi.listThreads();
      setThreads(r.data || []);
    } catch { /* silent */ }
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

  useEffect(() => { reloadThreads(); registerServiceWorker(); setPushState(pushPermission()); }, [reloadThreads]);
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

  // Lock body scroll while the mobile sheet is open so the page underneath
  // doesn't scroll under the user's finger.
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

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

  // Click-outside close on desktop popover.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || isMobile) return;
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      // Don't close if click was on the trigger itself.
      const trigger = document.getElementById('chat-trigger-btn');
      if (trigger && trigger.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, isMobile]);

  return (
    <>
      <button
        id="chat-trigger-btn"
        aria-label="Open chat"
        onClick={() => { setOpen((o) => !o); if (!open) reloadThreads(); }}
        style={{
          position: 'relative',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text)', padding: 0,
          width: 36, height: 36, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--s2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        {totalUnread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, padding: '0 4px',
            background: 'var(--primary)', color: '#fff',
            borderRadius: 999, fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--s1)',
          }}>{totalUnread > 99 ? '99+' : totalUnread}</span>
        )}
      </button>

      {open && isMobile && (
        <>
          {/* Mobile sheet backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000 }} />
          {/* Full-screen sheet */}
          <div ref={panelRef} role="dialog" aria-label="Messages" style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top))',
            left: 0, right: 0, bottom: 0,
            background: 'var(--s1)',
            display: 'flex', flexDirection: 'column',
            zIndex: 1001,
          }}>
            <PanelBody
              view={view} setView={setView} onClose={() => setOpen(false)}
              loadingThreads={loadingThreads} threads={threads} openThread={openThread}
              selectedThread={selectedThread}
              loadingMsgs={loadingMsgs} messages={messages}
              draft={draft} setDraft={setDraft} sending={sending} onSend={send} onKey={onKey}
              onCreated={(id) => { reloadThreads().then(() => openThread(id)); }}
              pushState={pushState} togglePush={togglePush}
            />
          </div>
        </>
      )}

      {open && !isMobile && (
        <div ref={panelRef} role="dialog" aria-label="Messages" style={{
          position: 'fixed',
          top: 70,
          right: 24,
          width: 'min(380px, calc(100vw - 30px))',
          // Cap the bottom edge above the KINI FAB so the Send button
          // doesn't sit underneath it. KINI is at right:30 bottom:30,
          // size 56 → its top edge is at viewport bottom-86. We add
          // a 24px breathing strip = 110px reserved at the bottom.
          height: 'min(560px, calc(100vh - 180px))',
          background: 'var(--s1)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', zIndex: 999,
        }}>
          <PanelBody
            view={view} setView={setView} onClose={() => setOpen(false)}
            loadingThreads={loadingThreads} threads={threads} openThread={openThread}
            selectedThread={selectedThread}
            loadingMsgs={loadingMsgs} messages={messages}
            draft={draft} setDraft={setDraft} sending={sending} onSend={send} onKey={onKey}
            onCreated={(id) => { reloadThreads().then(() => openThread(id)); }}
            pushState={pushState} togglePush={togglePush}
          />
        </div>
      )}
    </>
  );
}

function PanelBody(props: {
  view: 'threads' | 'thread' | 'compose';
  setView: (v: 'threads' | 'thread' | 'compose') => void;
  onClose: () => void;
  loadingThreads: boolean; threads: ThreadRow[]; openThread: (id: string) => void;
  selectedThread: ThreadRow | null;
  loadingMsgs: boolean; messages: MessageRow[];
  draft: string; setDraft: (s: string) => void; sending: boolean;
  onSend: () => void; onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCreated: (id: string) => void;
  pushState: string; togglePush: () => void;
}) {
  const { view, setView, onClose, loadingThreads, threads, openThread, selectedThread,
    loadingMsgs, messages, draft, setDraft, sending, onSend, onKey, onCreated, pushState, togglePush } = props;
  return (
    <>
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        background: 'var(--s2)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {view !== 'threads' && (
            <button onClick={() => setView('threads')} style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 4, display: 'flex' }} aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {view === 'threads' ? 'Messages' : view === 'compose' ? 'New conversation' : (selectedThread?.display_name || (selectedThread?.kind === 'team' ? (selectedThread?.name || 'Team Chat') : 'Direct Message'))}
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
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18 M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {view === 'threads' && <ThreadsView loading={loadingThreads} threads={threads} onOpen={openThread} onCompose={() => setView('compose')} />}
      {view === 'thread' && <ThreadView loading={loadingMsgs} messages={messages} draft={draft} sending={sending} setDraft={setDraft} onKeyDown={onKey} onSend={onSend} />}
      {view === 'compose' && <ComposeView onCreated={onCreated} onCancel={() => setView('threads')} />}
    </>
  );
}

function ThreadsView({ loading, threads, onOpen, onCompose }: {
  loading: boolean; threads: ThreadRow[]; onOpen: (id: string) => void; onCompose: () => void;
}) {
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && threads.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>}
        {!loading && threads.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            No conversations yet.<br/>Tap <b>New message</b> below to start one.
          </div>
        )}
        {threads.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)} style={{
            display: 'flex', width: '100%', padding: '12px 14px', gap: 10, alignItems: 'flex-start',
            background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
            cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: t.kind === 'team' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
              color: t.kind === 'team' ? '#F59E0B' : '#6366F1',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
            }}>{t.kind === 'team' ? 'T' : 'DM'}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.display_name || (t.kind === 'team' ? (t.name || 'Team Chat') : 'Direct Message')}
                </div>
                {t.unread_count > 0 && (
                  <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 800 }}>{t.unread_count}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.last_message_preview || 'No messages yet'}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--s2)', flexShrink: 0 }}>
        <button onClick={onCompose} style={{
          width: '100%', padding: '11px 14px', borderRadius: 8, border: 'none',
          background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
        }}>New message</button>
      </div>
    </>
  );
}

function ThreadView({ loading, messages, draft, sending, setDraft, onKeyDown, onSend }: {
  loading: boolean; messages: MessageRow[]; draft: string; sending: boolean;
  setDraft: (s: string) => void; onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; onSend: () => void;
}) {
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column-reverse', gap: 12 }}>
        {loading && messages.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>Loading…</div>}
        {!loading && messages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 14 }}>
            No messages yet — be the first.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'var(--s4)', color: 'var(--text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
            }}>{(m.sender_name || 'U').slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{m.sender_name || 'User'}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  {new Date(m.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                {renderMentions(m.body)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: 10, background: 'var(--s2)', flexShrink: 0 }}>
        <MentionInput
          value={draft}
          onChange={setDraft}
          onKeyDown={onKeyDown}
          placeholder="Message — @ to mention (Ctrl/Cmd+Enter)"
          rows={2}
          disabled={sending}
          maxLength={4000}
          style={{ fontSize: 13, minHeight: 52 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={onSend}
            disabled={sending || !draft.trim()}
            style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? 0.5 : 1 }}
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    messagingApi.searchMentions(query)
      .then((r) => { if (!cancelled) setResults(r.data || []); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
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
    <div style={{ flex: 1, minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['dm', 'team'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: kind === k ? 'var(--primary)' : 'transparent', color: kind === k ? '#fff' : 'var(--text)', cursor: 'pointer' }}>
            {k === 'dm' ? 'Direct message' : 'Team chat'}
          </button>
        ))}
      </div>
      {kind === 'team' && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team chat name (optional)" maxLength={80} style={{ width: '100%', padding: 10, fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)' }} />
      )}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selected.map((u) => (
            <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--s3)', borderRadius: 999, fontSize: 12 }}>
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
        style={{ width: '100%', padding: 10, fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)' }}
      />
      <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--s2)' }}>
        {loading && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>}
        {!loading && results.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>No matches.</div>}
        {!loading && results.map((u) => (
          <button key={u.id} onClick={() => add(u)} disabled={!!selected.find((s) => s.id === u.id) || (kind === 'dm' && selected.length >= 1)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
            <div style={{ fontWeight: 600 }}>{u.full_name || u.email}</div>
            {u.city_names.length > 0 && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{u.city_names.join(', ')}</div>}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={submitting || selected.length === 0} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'var(--primary)', border: 'none', color: '#fff', cursor: submitting || selected.length === 0 ? 'not-allowed' : 'pointer', opacity: submitting || selected.length === 0 ? 0.5 : 1 }}>
          {submitting ? 'Creating…' : kind === 'dm' ? 'Start DM' : 'Create'}
        </button>
      </div>
    </div>
  );
}
