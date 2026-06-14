'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  messagingApi,
  type AuditMessageRow,
  type AuditMentionRow,
  type AuditThreadDetail,
} from '../../../../lib/messagingApi';
import { renderMentions } from '../../../../components/messaging/MentionInput';

/**
 * Platform-admin only — every message and every mention across every
 * org. Rows show human-readable org / thread / sender names (the
 * backend hydrates these in one round-trip; older UUID-only responses
 * would have been unreadable for support work).
 *
 * Clicking a message row opens the full conversation in a modal so the
 * operator can read context without losing their place in the audit
 * list.
 */
export default function MessageAuditPage() {
  const [messages, setMessages] = useState<AuditMessageRow[]>([]);
  const [mentions, setMentions] = useState<AuditMentionRow[]>([]);
  const [tab, setTab] = useState<'messages' | 'mentions'>('messages');
  const [loading, setLoading] = useState(true);
  const [openThread, setOpenThread] = useState<AuditMessageRow | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([messagingApi.auditMessages(), messagingApi.auditMentions()])
      .then(([m, mn]) => { setMessages(m.data || []); setMentions(mn.data || []); })
      .catch((e: any) => toast.error(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Message audit log</h1>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        Read-only view of every message and mention across every tenant. Click any row to open the full conversation.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['messages', 'mentions'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8,
            border: '1px solid var(--border)', cursor: 'pointer',
            background: tab === t ? 'var(--primary)' : 'transparent',
            color: tab === t ? '#fff' : 'var(--text)',
          }}>
            {t === 'messages' ? `Messages (${messages.length})` : `Mentions (${mentions.length})`}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>}

      {!loading && tab === 'messages' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                <Th>When</Th><Th>Organisation</Th><Th>Conversation</Th><Th>Sender</Th><Th>Body</Th><Th>Lang</Th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setOpenThread(m)}
                  style={{
                    borderTop: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--s2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Td>{new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</Td>
                  <Td>{m.org_name || <Mono>{m.org_id.slice(0, 8)}</Mono>}</Td>
                  <Td>
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 7px',
                      borderRadius: 4,
                      background: m.thread_kind === 'team' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)',
                      color: m.thread_kind === 'team' ? '#F59E0B' : '#6366F1',
                      fontWeight: 700,
                      fontSize: 10,
                      marginRight: 6,
                    }}>{m.thread_kind === 'team' ? 'TEAM' : 'DM'}</span>
                    {m.thread_title || <Mono>{m.thread_id.slice(0, 8)}</Mono>}
                  </Td>
                  <Td>{m.sender_name || <Mono>{m.sender_id.slice(0, 8)}</Mono>}</Td>
                  <Td>{renderMentions(m.body)}</Td>
                  <Td>{m.language || '—'}</Td>
                </tr>
              ))}
              {messages.length === 0 && <tr><td colSpan={6} style={{ padding: 14, textAlign: 'center', color: 'var(--text-dim)' }}>No messages yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'mentions' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                <Th>When</Th><Th>Organisation</Th><Th>Source</Th><Th>Mentioner</Th><Th>Mentioned</Th>
              </tr>
            </thead>
            <tbody>
              {mentions.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td>{new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</Td>
                  <Td>{m.org_name || <Mono>{m.org_id.slice(0, 8)}</Mono>}</Td>
                  <Td>{m.source_kind} · <Mono>{m.source_id.slice(0, 8)}</Mono></Td>
                  <Td>{m.mentioner_name || <Mono>{m.mentioner_id.slice(0, 8)}</Mono>}</Td>
                  <Td>{m.mentioned_name || <Mono>{m.mentioned_user_id.slice(0, 8)}</Mono>}</Td>
                </tr>
              ))}
              {mentions.length === 0 && <tr><td colSpan={5} style={{ padding: 14, textAlign: 'center', color: 'var(--text-dim)' }}>No mentions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {openThread && <ThreadModal seed={openThread} onClose={() => setOpenThread(null)} />}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>{children}</td>;
}
function Mono({ children }: { children: React.ReactNode }) {
  return <code style={{ fontSize: 10, color: 'var(--text-dim)' }}>{children}</code>;
}

/**
 * Full conversation modal — pulls /audit/threads/:id with the seed row
 * so the operator sees the same hydrated state the backend prepared.
 * Newest-message-first to match the thread polling order everywhere else.
 */
function ThreadModal({ seed, onClose }: { seed: AuditMessageRow; onClose: () => void }) {
  const [detail, setDetail] = useState<AuditThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    messagingApi.auditThread(seed.thread_id)
      .then((r) => { if (!cancelled) setDetail(r.data); })
      .catch((e: any) => { if (!cancelled) setErr(e?.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [seed.thread_id]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: 'calc(100vh - 80px)',
          background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 12,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--s2)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              {detail?.title || seed.thread_title || 'Conversation'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {(detail?.org_name || seed.org_name || 'Unknown org')} · {detail?.kind === 'team' ? 'Team chat' : 'Direct message'}
              {detail?.members && detail.members.length > 0 && ` · ${detail.members.length} member${detail.members.length === 1 ? '' : 's'}`}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4, fontSize: 18 }}>×</button>
        </div>

        {loading && <div style={{ padding: 24, fontSize: 13, color: 'var(--text-dim)' }}>Loading conversation…</div>}
        {err && <div style={{ padding: 24, fontSize: 13, color: 'var(--primary)' }}>{err}</div>}
        {detail && (
          <>
            {detail.members.length > 0 && (
              <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {detail.members.map((m) => (
                  <span key={m.id} style={{ padding: '3px 10px', borderRadius: 999, background: 'var(--s3)', fontSize: 11 }}>{m.name}</span>
                ))}
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column-reverse', gap: 12 }}>
              {detail.messages.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>No messages in this thread.</div>
              )}
              {detail.messages.map((m) => (
                <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--s4)', color: 'var(--text)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{(m.sender_name || 'U').slice(0, 1).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{m.sender_name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }} title={new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
                        {new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {m.language && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>· {m.language}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                      {renderMentions(m.body)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
