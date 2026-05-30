'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { messagingApi } from '../../../../lib/messagingApi';
import { renderMentions } from '../../../../components/messaging/MentionInput';

/**
 * Super-admin only — every message and every mention across every org.
 * Backend guards on req.user.role === 'super_admin' before serving rows;
 * unauthorized callers get a 403 from the API.
 */
export default function MessageAuditPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [mentions, setMentions] = useState<any[]>([]);
  const [tab, setTab] = useState<'messages' | 'mentions'>('messages');
  const [loading, setLoading] = useState(true);

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
        Read-only view of every message and mention across every tenant. Visible to super-admins only.
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
                <Th>When</Th><Th>Org</Th><Th>Thread</Th><Th>Sender</Th><Th>Body</Th><Th>Lang</Th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td>{new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</Td>
                  <Td><code style={{ fontSize: 10 }}>{m.org_id.slice(0, 8)}</code></Td>
                  <Td><code style={{ fontSize: 10 }}>{m.thread_id.slice(0, 8)}</code></Td>
                  <Td><code style={{ fontSize: 10 }}>{m.sender_id.slice(0, 8)}</code></Td>
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
                <Th>When</Th><Th>Org</Th><Th>Source</Th><Th>Mentioner</Th><Th>Mentioned</Th>
              </tr>
            </thead>
            <tbody>
              {mentions.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td>{new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</Td>
                  <Td><code style={{ fontSize: 10 }}>{m.org_id.slice(0, 8)}</code></Td>
                  <Td>{m.source_kind} · <code style={{ fontSize: 10 }}>{m.source_id.slice(0, 8)}</code></Td>
                  <Td><code style={{ fontSize: 10 }}>{m.mentioner_id.slice(0, 8)}</code></Td>
                  <Td><code style={{ fontSize: 10 }}>{m.mentioned_user_id.slice(0, 8)}</code></Td>
                </tr>
              ))}
              {mentions.length === 0 && <tr><td colSpan={5} style={{ padding: 14, textAlign: 'center', color: 'var(--text-dim)' }}>No mentions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>{children}</td>;
}
