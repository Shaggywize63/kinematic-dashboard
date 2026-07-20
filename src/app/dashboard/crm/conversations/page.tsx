'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../../lib/api';
import { useCityScope } from '../../../../context/CityScopeContext';
import {
  conversationsApi,
  statusMeta,
  sentimentColor,
  intentColor,
  fmtDuration,
  fmtDateTime,
  fmtOffset,
  type ConversationRow,
  type ConversationDetail,
  type ConversationInsights,
  type DiarSegment,
} from '../../../../lib/conversationsApi';
import ConversationAnalyticsView from '../../../../components/crm/conversations/ConversationAnalyticsView';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';

// ── Inline style tokens (mirror the Leave module's _ui.tsx) ──────────────────
const card: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18,
};
const input: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%',
};
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase',
  letterSpacing: 0.5, marginBottom: 5, display: 'block',
};

type UserOption = { id: string; name: string };

// Phone-width viewport flag — per CLAUDE.md the dashboard uses a JS `isCompact`
// flag for responsiveness (all styles are inline, no CSS media queries).
function useIsCompact(breakpoint = 820): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const check = () => setV(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return v;
}

function Chip({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: bg, color: fg, textTransform: 'uppercase', letterSpacing: 0.4,
      whiteSpace: 'nowrap', display: 'inline-block',
    }}>{text}</span>
  );
}

export default function ConversationAnalysisPage() {
  const isCompact = useIsCompact();
  const { selectedCity } = useCityScope();

  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [championId, setChampionId] = useState('');
  const [search, setSearch] = useState('');

  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'recordings' | 'analytics'>('recordings');

  // Load the list. Champion filter (user_id) is applied server-side so the
  // backend narrows to that recorder; it is in the dependency array below so
  // changing it refetches. City scope is applied client-side on lead_city
  // (crm_conversations carries no geo column of its own, so sending ?city=
  // would make the generic list handler .eq('city') and 500 — see backend
  // CLAUDE.md).
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await conversationsApi.list({ limit: 100, user_id: championId || undefined });
      const list = res.data || [];
      // Guarantee newest-first even if the backend ordering ever changes.
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      setRows(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load conversations';
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [championId]);

  useEffect(() => { load(); }, [load]);

  // Load champions (recorders) for the filter dropdown — lazy, once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = (await api.getUsers({ scope: 'assignable' })) as { data?: unknown[] } | unknown[];
        const arr = (Array.isArray(r) ? r : (r as { data?: unknown[] })?.data) || [];
        const list: UserOption[] = (arr as Array<Record<string, unknown>>).map((u) => ({
          id: String(u.id),
          name: String(u.name || u.full_name || u.email || 'User'),
        }));
        if (!cancelled) setUsers(list);
      } catch { if (!cancelled) setUsers([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Client-side search (lead / champion) + city-scope narrowing on lead_city.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (selectedCity && (r.lead_city || '') !== selectedCity) return false;
      if (!q) return true;
      return (
        (r.lead_name || '').toLowerCase().includes(q) ||
        (r.champion_name || '').toLowerCase().includes(q) ||
        (r.summary || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, selectedCity]);

  // Type-aware column sorting for the recordings table (client-side).
  const recVal = useCallback((r: ConversationRow, key: string): unknown => {
    switch (key) {
      case 'champion': return r.champion_name;
      case 'lead': return r.lead_name;
      case 'date': return r.created_at;
      case 'intent': return r.intent_score;
      case 'sentiment': return r.sentiment;
      case 'status': return r.status;
      case 'summary': return r.summary;
      default: return (r as unknown as Record<string, unknown>)[key];
    }
  }, []);
  const { sorted, sort, toggle } = useTableSort<ConversationRow>(filtered, recVal, { key: 'date', dir: 'desc' });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Conversation Analysis</h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>
            Consented calls recorded by Consumer Champions — transcribed, diarized and analysed for intent, sentiment and coaching.
          </div>
        </div>
      </div>

      {/* Tab toggle — Recordings list vs aggregated Analytics */}
      <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        {(['recordings', 'analytics'] as const).map((tv) => (
          <button
            key={tv}
            onClick={() => setTab(tv)}
            style={{
              background: tab === tv ? 'var(--s3)' : 'transparent',
              color: tab === tv ? 'var(--text)' : 'var(--text-dim)',
              border: 'none', padding: '8px 18px', fontSize: 13, fontWeight: tab === tv ? 800 : 600, cursor: 'pointer',
            }}
          >{tv === 'recordings' ? 'Recordings' : 'Analytics'}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {tab === 'recordings' && (
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <label style={label}>Search</label>
            <input
              style={input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Lead, champion or summary…"
            />
          </div>
        )}
        <div style={{ flex: '0 1 220px', minWidth: 180 }}>
          <label style={label}>Consumer Champion</label>
          <select value={championId} onChange={(e) => setChampionId(e.target.value)} style={input as React.CSSProperties}>
            <option value="">All champions</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        {(search || championId || selectedCity) && (
          <button
            onClick={() => { setSearch(''); setChampionId(''); }}
            style={{
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, height: 36,
            }}
          >Clear</button>
        )}
      </div>

      {/* Analytics tab renders the aggregated charts in place of the list */}
      {tab === 'analytics' ? (
        <ConversationAnalyticsView championId={championId} city={selectedCity} compact={isCompact} />
      ) : (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Conversations ({filtered.length})
            {selectedCity && <span style={{ fontWeight: 500, color: 'var(--text-dim)' }}> · {selectedCity}</span>}
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
              padding: '4px 12px', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontSize: 12,
              opacity: loading ? 0.5 : 1,
            }}
          >{loading ? 'Loading…' : 'Refresh'}</button>
        </div>

        {error ? (
          <div style={{ color: '#ef4444', fontSize: 13, padding: '12px 0' }}>{error}</div>
        ) : loading && rows.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>Loading conversations…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>
            No conversations found.
          </div>
        ) : isCompact ? (
          // Stacked cards on narrow screens
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((r) => (
              <ConversationCardRow key={r.id} row={r} onOpen={() => setOpenId(r.id)} />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={thStyle}><SortLabel label="Consumer Champion" sortKey="champion" sort={sort} onToggle={toggle} /></th>
                  <th style={thStyle}><SortLabel label="Lead" sortKey="lead" sort={sort} onToggle={toggle} /></th>
                  <th style={thStyle}><SortLabel label="Date" sortKey="date" sort={sort} onToggle={toggle} /></th>
                  <th style={thStyle}><SortLabel label="Intent" sortKey="intent" sort={sort} onToggle={toggle} /></th>
                  <th style={thStyle}><SortLabel label="Sentiment" sortKey="sentiment" sort={sort} onToggle={toggle} /></th>
                  <th style={thStyle}><SortLabel label="Status" sortKey="status" sort={sort} onToggle={toggle} /></th>
                  <th style={thStyle}><SortLabel label="Summary" sortKey="summary" sort={sort} onToggle={toggle} /></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const sm = statusMeta(r.status);
                  const sc = sentimentColor(r.sentiment);
                  const ic = intentColor(r.intent_score);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--s3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.champion_name || '—'}</div>
                        {r.employee_id && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.employee_id}</div>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.lead_name || '—'}</div>
                        {r.lead_city && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.lead_city}</div>}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-dim)' }}>{fmtDateTime(r.created_at)}</td>
                      <td style={tdStyle}>
                        {r.intent || r.intent_score != null ? (
                          <Chip
                            text={`${r.intent || 'Intent'}${r.intent_score != null ? ` · ${r.intent_score}` : ''}`}
                            bg={ic.bg} fg={ic.fg}
                          />
                        ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        {r.sentiment ? <Chip text={r.sentiment} bg={sc.bg} fg={sc.fg} /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={tdStyle}><Chip text={sm.label} bg={sm.bg} fg={sm.fg} /></td>
                      <td style={{ ...tdStyle, color: 'var(--text-dim)', maxWidth: 280 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {r.summary || (r.status !== 'complete' ? statusMeta(r.status).label + '…' : '—')}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {openId && (
        <ConversationDrawer id={openId} isCompact={isCompact} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '8px 10px', fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: '10px 10px', verticalAlign: 'top' };

// Compact stacked-card variant of a list row (phone widths).
function ConversationCardRow({ row, onOpen }: { row: ConversationRow; onOpen: () => void }) {
  const sm = statusMeta(row.status);
  const sc = sentimentColor(row.sentiment);
  const ic = intentColor(row.intent_score);
  return (
    <div
      onClick={onOpen}
      style={{ background: 'var(--s3)', borderRadius: 10, padding: 12, cursor: 'pointer', border: '1px solid var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{row.lead_name || 'Unknown lead'}</div>
        <Chip text={sm.label} bg={sm.bg} fg={sm.fg} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
        {row.champion_name || '—'}{row.employee_id ? ` · ${row.employee_id}` : ''}{row.lead_city ? ` · ${row.lead_city}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {(row.intent || row.intent_score != null) && (
          <Chip text={`${row.intent || 'Intent'}${row.intent_score != null ? ` · ${row.intent_score}` : ''}`} bg={ic.bg} fg={ic.fg} />
        )}
        {row.sentiment && <Chip text={row.sentiment} bg={sc.bg} fg={sc.fg} />}
        <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>{fmtDateTime(row.created_at)}</span>
      </div>
      {row.summary && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.4 }}>{row.summary}</div>
      )}
    </div>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────────────
function ConversationDrawer({ id, isCompact, onClose }: { id: string; isCompact: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    conversationsApi.get(id)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch((e: unknown) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Failed to load conversation');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const status = detail?.status || 'pending';
  const sm = statusMeta(status);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--s1)', borderLeft: '1px solid var(--border)', height: '100%',
          width: isCompact ? '100%' : 'min(620px, 96vw)', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Drawer header */}
        <div style={{
          position: 'sticky', top: 0, background: 'var(--s1)', zIndex: 2,
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
              {detail?.lead_name || 'Conversation'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
              {detail?.champion_name || '—'}
              {detail?.employee_id ? ` · ${detail.employee_id}` : ''}
              {detail?.created_at ? ` · ${fmtDateTime(detail.created_at)}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <Chip text={sm.label} bg={sm.bg} fg={sm.fg} />
              {detail?.duration_seconds != null && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>⏱ {fmtDuration(detail.duration_seconds)}</span>
              )}
              {detail?.language && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>🌐 {detail.language}</span>}
              {detail?.consent_captured != null && (
                <Chip
                  text={detail.consent_captured ? 'Consent ✓' : 'No consent'}
                  bg={detail.consent_captured ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'}
                  fg={detail.consent_captured ? '#22c55e' : '#ef4444'}
                />
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 24, lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading analysis…</div>
          ) : !detail ? (
            <div style={{ color: '#ef4444', fontSize: 13 }}>Could not load this conversation.</div>
          ) : (
            <DrawerBody detail={detail} />
          )}
        </div>
      </div>
    </div>
  );
}

// Recordings are stored with a non-standard `audio/m4a` mimetype, which Chrome's
// <audio> element refuses to play. We fetch the signed URL and re-wrap the bytes
// in a Blob typed `audio/mp4` (the correct AAC-in-MP4 type) so it plays inline.
// If the cross-origin fetch is ever blocked we fall back to the direct URL, and
// an "open / download" link is always offered as a guaranteed escape hatch.
function AudioPlayer({ url }: { url: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    setBlobUrl(null);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        created = URL.createObjectURL(new Blob([buf], { type: 'audio/mp4' }));
        if (alive) setBlobUrl(created);
      } catch { /* CORS/network — fall back to the direct src below */ }
    })();
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [url]);

  return (
    <div>
      <SectionTitle>Recording</SectionTitle>
      {/* key forces a reload once the re-typed blob is ready */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio key={blobUrl || url} src={blobUrl || url} controls preload="metadata" style={{ width: '100%' }} />
      <div style={{ marginTop: 6 }}>
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--text-dim)', textDecoration: 'underline' }}>
          Open / download recording
        </a>
      </div>
    </div>
  );
}

function DrawerBody({ detail }: { detail: ConversationDetail }) {
  const complete = detail.status === 'complete';
  const insights = detail.insights || null;

  return (
    <>
      {/* Audio player */}
      {detail.audio_url && <AudioPlayer url={detail.audio_url} />}

      {/* Non-complete state — surface processing / failed instead of insights. */}
      {!complete && (
        <div style={{
          background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 16, fontSize: 13, color: 'var(--text-dim)',
        }}>
          {detail.status === 'failed' ? (
            <>
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Analysis failed</div>
              We couldn&apos;t generate insights for this recording. The transcript below (if any) is still available.
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Processing…</div>
              This conversation is still being transcribed and analysed. Insights will appear here once it&apos;s complete.
            </>
          )}
        </div>
      )}

      {/* Structured insights (only meaningful when complete) */}
      {complete && insights && <InsightsView insights={insights} />}

      {/* Diarized transcript */}
      <TranscriptView diarization={detail.diarization} transcript={detail.transcript} />
    </>
  );
}

function InsightsView({ insights }: { insights: ConversationInsights }) {
  const {
    summary, intent, sentiment, positives, improvements, objections,
    competitors, commitments, extracted, coaching, next_action, draft_followup, risk_flags,
  } = insights;

  const sc = sentimentColor(sentiment?.overall);
  const ic = intentColor(intent?.score);

  return (
    <>
      {summary && (
        <Section title="Summary">
          <p style={paraStyle}>{summary}</p>
        </Section>
      )}

      {(intent || sentiment) && (
        <Section title="Intent & Sentiment">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: intent?.signals?.length ? 10 : 0 }}>
            {intent?.stage && <Chip text={`Stage: ${intent.stage}`} bg={ic.bg} fg={ic.fg} />}
            {intent?.score != null && <Chip text={`Intent ${intent.score}`} bg={ic.bg} fg={ic.fg} />}
            {sentiment?.overall && <Chip text={`Sentiment: ${sentiment.overall}`} bg={sc.bg} fg={sc.fg} />}
            {sentiment?.trajectory && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>Trajectory: {sentiment.trajectory}</span>
            )}
          </div>
          {!!intent?.signals?.length && (
            <BulletList items={intent.signals} />
          )}
        </Section>
      )}

      {!!positives?.length && (
        <Section title="✅ Positives">
          <BulletList items={positives} tone="#22c55e" />
        </Section>
      )}

      {!!improvements?.length && (
        <Section title="⚠️ Improvements">
          <BulletList items={improvements} tone="#eab308" />
        </Section>
      )}

      {!!objections?.length && (
        <Section title="Objections">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {objections.map((o, i) => (
              <div key={i} style={{ background: 'var(--s3)', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: o.note ? 4 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{o.type || 'Objection'}</span>
                  {o.handled != null && (
                    <Chip
                      text={o.handled ? 'Handled' : 'Unhandled'}
                      bg={o.handled ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'}
                      fg={o.handled ? '#22c55e' : '#ef4444'}
                    />
                  )}
                </div>
                {o.note && <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{o.note}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {!!competitors?.length && (
        <Section title="Competitors">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {competitors.map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--text)' }}>
                <strong>{c.name || 'Competitor'}</strong>
                {c.context && <span style={{ color: 'var(--text-dim)' }}> — {c.context}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {!!commitments?.length && (
        <Section title="Commitments">
          <BulletList items={commitments} />
        </Section>
      )}

      {extracted && Object.values(extracted).some((v) => v != null && v !== '') && (
        <Section title="Extracted fields">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            <Field k="Grade" v={extracted.grade} />
            <Field k="Quantity (t)" v={extracted.quantity_tonnes} />
            <Field k="Budget" v={extracted.budget} />
            <Field k="Timeline" v={extracted.timeline} />
            <Field k="Project stage" v={extracted.project_stage} />
            <Field k="Decision maker" v={extracted.decision_maker} />
          </div>
        </Section>
      )}

      {coaching && (coaching.talk_listen_ratio != null || coaching.missed_questions?.length || coaching.tips?.length) && (
        <Section title="Coaching">
          {coaching.talk_listen_ratio != null && (
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>
              Talk / listen ratio: <strong>{String(coaching.talk_listen_ratio)}</strong>
            </div>
          )}
          {!!coaching.missed_questions?.length && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>Missed questions</div>
              <BulletList items={coaching.missed_questions} tone="#eab308" />
            </div>
          )}
          {!!coaching.tips?.length && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>Tips</div>
              <BulletList items={coaching.tips} />
            </div>
          )}
        </Section>
      )}

      {next_action && (
        <Section title="Next action">
          <div style={{ background: 'rgba(224,30,44,0.08)', border: '1px solid rgba(224,30,44,0.25)', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--text)' }}>
            {next_action}
          </div>
        </Section>
      )}

      {draft_followup && (
        <Section title="Draft follow-up">
          <div style={{ background: 'var(--s3)', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {draft_followup}
          </div>
        </Section>
      )}

      {!!risk_flags?.length && (
        <Section title="Risk flags">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {risk_flags.map((f, i) => (
              <Chip key={i} text={f} bg="rgba(239,68,68,0.14)" fg="#ef4444" />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function TranscriptView({ diarization, transcript }: { diarization: DiarSegment[] | null; transcript: string | null }) {
  const [open, setOpen] = useState(false);
  const hasDiar = !!diarization && diarization.length > 0;
  const hasText = !!transcript && transcript.trim().length > 0;
  if (!hasDiar && !hasText) return null;

  // Assign a stable colour per distinct speaker label.
  const speakerColors = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'];
  const speakerIndex = new Map<string, number>();
  const colorFor = (speaker: string) => {
    if (!speakerIndex.has(speaker)) speakerIndex.set(speaker, speakerIndex.size % speakerColors.length);
    return speakerColors[speakerIndex.get(speaker) as number];
  };

  return (
    <Section title="Transcript">
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, marginBottom: open ? 10 : 0 }}
      >{open ? 'Hide transcript' : 'Show transcript'}</button>
      {open && (
        hasDiar ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {diarization!.map((seg, i) => {
              const color = colorFor(seg.speaker || 'Speaker');
              return (
                <div key={i} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flexShrink: 0, width: 92 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color }}>{seg.speaker || 'Speaker'}</div>
                    {seg.start != null && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fmtOffset(seg.start)}</div>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, flex: 1 }}>{seg.text}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{transcript}</div>
        )
      )}
    </Section>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

const paraStyle: React.CSSProperties = { fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55, margin: 0 };

function BulletList({ items, tone }: { items: string[]; tone?: string }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45, ...(tone ? { listStyle: 'none', position: 'relative' } : {}) }}>
          {tone && <span style={{ position: 'absolute', left: -14, color: tone }}>•</span>}
          {it}
        </li>
      ))}
    </ul>
  );
}

function Field({ k, v }: { k: string; v?: string | number | null }) {
  if (v == null || v === '') return null;
  return (
    <div style={{ background: 'var(--s3)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>{String(v)}</div>
    </div>
  );
}
