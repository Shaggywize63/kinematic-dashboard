'use client';
import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import api from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import RecipientPicker from '../../../components/RecipientPicker';
import { useTableSort, SortLabel } from '../../../lib/tableSort';
import { Badge, Button, Card, EmptyState, Eyebrow, Field, Input, Select, T, Textarea, useIsCompact } from '../../../components/ui';

/**
 * Admin broadcast composer + send history. This used to be the whole
 * /dashboard/notifications page; it now lives on the "Broadcasts" tab of
 * the inbox. Behaviour (endpoints, targeting payload, delete / clear) is
 * unchanged — only the presentation moved onto the shared primitives.
 */

interface User { id: string; name: string; role: string; city?: string; zones?: { name: string; city?: string }; supervisor_id?: string; hierarchy_level_id?: string; }
interface Notif { id: string; title: string; body: string; priority: string; audience_summary: string; created_at: string; recipients_count: number; read_count: number; send_push?: boolean; }

// Type-aware column sorting reads the raw broadcast value per column key
// (read rate is derived so it compares as a numeric ratio, not a string).
const notifVal = (h: Notif, key: string): unknown => {
  switch (key) {
    case 'title': return h.title;
    case 'target': return h.audience_summary;
    case 'type': return !!h.send_push;
    case 'read': return h.recipients_count ? h.read_count / h.recipients_count : 0;
    case 'sent': return h.created_at;
    default: return (h as unknown as Record<string, unknown>)[key];
  }
};

const PAGE = 10;

export default function BroadcastPanel() {
  const narrow = useIsCompact(1100);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('info');
  // A flat set of picked user UUIDs sent to /notifications/send as
  // `targeting.user_ids`; users pick via the tree (RecipientPicker) which
  // groups by city / hierarchy / saved group.
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Notif[]>([]);
  // Default ON so a broadcast actually reaches every recipient's phone (lock
  // screen via FCM), not just the in-app bell. Admins can still uncheck it.
  const [sendPush, setSendPush] = useState(true);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const { sorted, sort, toggle } = useTableSort<Notif>(history, notifVal, { key: 'sent', dir: 'desc' });

  const fetchAll = useCallback(async (p: number = 1) => {
    try {
      const [uR, hR] = await Promise.all([
        api.get<any>('/api/v1/users?limit=500'),
        api.get<any>(`/api/v1/notifications/history?limit=${PAGE}&page=${p}`),
      ]);
      const pick = (r: any) => {
        if (Array.isArray(r)) return r;
        if (Array.isArray(r?.data)) return r.data;
        if (Array.isArray(r?.data?.data)) return r.data.data;
        return r?.users || r?.zones || [];
      };
      setAllUsers(pick(uR));
      const hData = hR?.data?.data || hR?.data || [];
      setHistory(Array.isArray(hData) ? hData : []);
      setTotal(hR?.data?.totalCount || 0);
    } catch (e) { console.error('Fetch error:', e); }
  }, []);

  useEffect(() => { fetchAll(page); }, [fetchAll, page]);

  const send = async () => {
    if (!title || !body) return alert('Title and message are required');
    if (selectedIds.size === 0) return alert('Pick at least one recipient.');
    setSending(true);
    try {
      await api.post('/api/v1/notifications/send', {
        title, body, priority, send_push: sendPush,
        targeting: { user_ids: Array.from(selectedIds) },
      });
      alert('Sent successfully!');
      setTitle(''); setBody(''); setSelectedIds(new Set());
      fetchAll();
    } catch (e: any) { alert(e.message || 'Failed'); }
    finally { setSending(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this broadcast? It will be removed from all users.')) return;
    try {
      await api.delete(`/api/v1/notifications/${id}`);
      setHistory(history.filter((h) => h.id !== id));
    } catch (e: any) { alert(e.message || 'Failed to delete'); }
  };

  const handleClearAll = async () => {
    if (!confirm('Clear ALL broadcast history? This cannot be undone — every row below will be removed from your org.')) return;
    try {
      await api.delete('/api/v1/notifications/history/clear');
      setHistory([]); setTotal(0); setPage(1);
    } catch (e: any) { alert(e.message || 'Failed to clear history'); }
  };

  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '12px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'top' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 300px', gap: 20, alignItems: 'start' }}>
        <Card padding={24}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Eyebrow>Compose</Eyebrow>
              <div style={{ fontSize: 13, color: T.dim }}>Send an in-app (and optionally push) message to the people you pick.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 200px', gap: '16px 20px' }}>
              <Field label="Title" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Attendance reminder" />
              </Field>
              <Field label="Priority">
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
            </div>
            <Field label="Message" required>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the message…" rows={4} />
            </Field>
            <div style={{ height: 1, background: T.border }} />
            <Field label="Recipients" required>
              <RecipientPicker users={allUsers} selectedIds={selectedIds} onChange={setSelectedIds} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', background: 'var(--s3)', border: `1px solid ${T.border}`, borderRadius: 8 }}>
              <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Send as push notification</div>
                <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2 }}>Also shows on the recipient&apos;s lock screen.</div>
              </div>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send broadcast'}</Button>
            </div>
          </div>
        </Card>

        <Card padding={20}>
          <Eyebrow style={{ marginBottom: 12 }}>Summary</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Row label="Recipients" value={`${selectedIds.size} ${selectedIds.size === 1 ? 'person' : 'people'}`} />
            <Row label="Delivery" value={sendPush ? 'In-app + push' : 'In-app only'} />
            <Row label="Priority" value={priority[0]!.toUpperCase() + priority.slice(1)} last />
          </div>
          <div style={{ marginTop: 16, padding: 14, background: 'var(--s3)', borderRadius: 8 }}>
            <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, lineHeight: 1.1 }}>{selectedIds.size}</div>
            <div style={{ fontSize: 12.5, color: T.dim, marginTop: 4 }}>{selectedIds.size === 1 ? 'recipient selected' : 'recipients selected'}</div>
          </div>
        </Card>
      </div>

      <Card padding={0}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700 }}>Sent</div>
            {total > 0 && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>{total}</span>}
          </div>
          {isPlatformAdmin && history.length > 0 && (
            <Button size="sm" variant="danger" onClick={handleClearAll} icon={<Trash2 size={14} strokeWidth={1.8} />} title="Clear all broadcast history for this organisation">Clear all</Button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}><SortLabel label="Broadcast" sortKey="title" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Audience" sortKey="target" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Delivery" sortKey="type" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Read" sortKey="read" sort={sort} onToggle={toggle} /></th>
                <th style={th}><SortLabel label="Sent" sortKey="sent" sort={sort} onToggle={toggle} /></th>
                {isPlatformAdmin && <th style={{ ...th, textAlign: 'right' }} />}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={6} style={{ ...td, borderBottom: 0, padding: 0 }}><EmptyState title="No broadcasts yet" description="Messages you send from here show up in every recipient's inbox and, with push on, on their phone." /></td></tr>
              ) : sorted.map((h) => {
                const pct = h.recipients_count ? Math.round((h.read_count / h.recipients_count) * 100) : 0;
                return (
                  <tr key={h.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{h.title}</div>
                      <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.body}</div>
                    </td>
                    <td style={{ ...td, color: T.dim }}>{h.audience_summary}</td>
                    <td style={td}><Badge tone={h.send_push ? 'red' : 'neutral'}>{h.send_push ? 'Push + in-app' : 'In-app'}</Badge></td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
                        <div style={{ flex: 1, height: 5, background: T.rule, borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: T.ok, borderRadius: 3 }} /></div>
                        <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.dim, whiteSpace: 'nowrap' }}>{h.read_count}/{h.recipients_count}</span>
                      </div>
                    </td>
                    <td style={{ ...td, color: T.dim, fontFamily: T.mono, fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    {isPlatformAdmin && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(h.id)} icon={<Trash2 size={14} strokeWidth={1.8} />} title="Delete broadcast">Delete</Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > PAGE && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 14, borderTop: `1px solid ${T.border}` }}>
            <Button size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span style={{ fontSize: 12.5, color: T.dim, fontFamily: T.mono }}>{page} / {Math.ceil(total / PAGE)}</span>
            <Button size="sm" disabled={page * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: last ? 0 : `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12.5, color: T.dim }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: T.text, maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
