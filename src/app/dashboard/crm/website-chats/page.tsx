'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  webChatsApi,
  webChatStatusMeta,
  fmtDateTime,
  type WebChatRow,
  type WebChatDetail,
} from '../../../../lib/webChatsApi';

// Inline style tokens (mirror the CRM Conversations page).
const card: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16,
};
const input: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%',
};

function useIsCompact(breakpoint = 900): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const check = () => setV(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return v;
}

function StatusChip({ status }: { status: string }) {
  const m = webChatStatusMeta[status] || { label: status, bg: 'rgba(107,114,128,0.14)', fg: '#6B7280' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: m.bg, color: m.fg, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap',
    }}>{m.label}</span>
  );
}

export default function WebsiteChatsPage() {
  const isCompact = useIsCompact();
  const [rows, setRows] = useState<WebChatRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WebChatDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      const res = await webChatsApi.list({ limit: 100, search: searchTerm || undefined });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      toast.error('Could not load website chats');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  // Debounced search → refetch (dependency wired so typing refetches).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, load]);

  // Load transcript when a row is selected.
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let alive = true;
    setDetailLoading(true);
    webChatsApi.get(selectedId)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) toast.error('Could not load conversation'); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [selectedId]);

  const displayName = (r: WebChatRow) =>
    r.visitor_name || r.visitor_email || r.visitor_phone || 'Anonymous visitor';

  return (
    <div style={{ padding: isCompact ? 12 : 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Website Chats</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '4px 0 0' }}>
          Conversations from KINI, the chatbot on kinematicapp.com — what visitors asked, how KINI replied,
          and the leads it captured.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexDirection: isCompact ? 'column' : 'row' }}>
        {/* List */}
        <div style={{ ...card, flex: isCompact ? 'none' : '0 0 380px', width: isCompact ? '100%' : 380, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <input
              style={input}
              placeholder="Search name, email, phone, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              {loading ? 'Loading…' : `${total} conversation${total === 1 ? '' : 's'}`}
            </div>
          </div>
          <div style={{ maxHeight: isCompact ? 320 : '68vh', overflowY: 'auto' }}>
            {!loading && rows.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                No website chats yet. They’ll appear here as visitors talk to KINI.
              </div>
            )}
            {rows.map((r) => {
              const active = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border)',
                    background: active ? 'var(--s3)' : 'transparent', color: 'var(--text)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName(r)}
                    </span>
                    <StatusChip status={r.status} />
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.visitor_company ? r.visitor_company + ' · ' : ''}{r.interest || r.page_title || r.page_path || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{r.message_count} msg</span>
                    <span>{fmtDateTime(r.last_seen_at)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div style={{ ...card, flex: 1, width: isCompact ? '100%' : 'auto', minHeight: 300, alignSelf: 'stretch' }}>
          {!selectedId && (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 24, textAlign: 'center' }}>
              Select a conversation to read the full transcript.
            </div>
          )}
          {selectedId && detailLoading && !detail && (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 24 }}>Loading conversation…</div>
          )}
          {detail && (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{displayName(detail)}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {detail.visitor_email && <span>✉ {detail.visitor_email}</span>}
                    {detail.visitor_phone && <span>☎ {detail.visitor_phone}</span>}
                    {detail.visitor_company && <span>🏢 {detail.visitor_company}</span>}
                    {detail.team_size && <span>👥 {detail.team_size}</span>}
                    {detail.city && <span>📍 {detail.city}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <StatusChip status={detail.status} />
                  {detail.lead_id && (
                    <div style={{ marginTop: 6 }}>
                      <Link href={`/dashboard/crm/leads/${detail.lead_id}`}
                        style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
                        View lead →
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Meta */}
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                {detail.interest && <span><b style={{ color: 'var(--text)' }}>Interest:</b> {detail.interest}</span>}
                {(detail.page_title || detail.page_path) && (
                  <span><b style={{ color: 'var(--text)' }}>Page:</b> {detail.page_title || detail.page_path}</span>
                )}
                <span><b style={{ color: 'var(--text)' }}>Started:</b> {fmtDateTime(detail.first_seen_at)}</span>
                {detail.utm_source && <span><b style={{ color: 'var(--text)' }}>Source:</b> {detail.utm_source}</span>}
              </div>

              {/* Transcript */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '58vh', overflowY: 'auto', paddingRight: 4 }}>
                {(detail.transcript || []).map((t, i) => {
                  const isKini = t.role === 'kini';
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: isKini ? 'flex-start' : 'flex-end' }}>
                      <div style={{
                        maxWidth: '78%', padding: '9px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        background: isKini ? 'var(--s3)' : 'var(--primary)',
                        color: isKini ? 'var(--text)' : '#fff',
                        border: isKini ? '1px solid var(--border)' : 'none',
                        borderBottomLeftRadius: isKini ? 4 : 12,
                        borderBottomRightRadius: isKini ? 12 : 4,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {isKini ? 'KINI' : 'Visitor'}
                        </div>
                        {t.content}
                      </div>
                    </div>
                  );
                })}
                {(!detail.transcript || detail.transcript.length === 0) && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No messages recorded.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
