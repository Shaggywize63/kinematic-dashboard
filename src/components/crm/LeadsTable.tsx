'use client';
import { memo, useCallback, useState } from 'react';
import Link from 'next/link';
import type { Lead } from '../../types/crm';
import LeadScoreBadge from './LeadScoreBadge';
import { breakdownFactors, llmAdjustmentOf } from '../../lib/crm/scoreFactors';
import OwnerAvatar from './shared/OwnerAvatar';
import InlineOwnerAssign from './shared/InlineOwnerAssign';
import LogoSpinner from '../shared/LogoSpinner';

interface Props {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  loading?: boolean;
  isB2C?: boolean;
  onAssign?: (leadId: string, userId: string | null) => Promise<void>;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
  // Server-side sort. `sort.key` is the backend sort key (see the
  // column→key mapping in the header); `onSort(key)` asks the parent to
  // toggle/switch the active sort and refetch. Undefined = non-sortable UI.
  sort?: { key: string; order: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  // Inline edit: open the edit modal for a single row straight from the
  // list, so a rep can fix one lead without opening its detail page.
  onEdit?: (lead: Lead) => void;
}

// Clickable, server-side-sort table header. The actual sorting happens on
// the backend via onSort → parent refetch; this only renders the label +
// asc/desc/idle affordance. Non-sortable columns pass no onSort and render
// a plain <th>.
function SortTh({ label, sortKey, sort, onSort, thStyle, align = 'left' }: {
  label: string;
  sortKey: string;
  sort?: { key: string; order: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  thStyle: React.CSSProperties;
  align?: 'left' | 'right';
}) {
  const th: React.CSSProperties = { ...thStyle, textAlign: align };
  if (!onSort) return <th style={th}>{label}</th>;
  const active = !!sort && sort.key === sortKey;
  const arrow = active ? (sort!.order === 'asc' ? '▲' : '▼') : '⇅';
  return (
    <th style={th}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => onSort(sortKey)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(sortKey); } }}
        title="Sort"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none', color: active ? 'var(--primary)' : 'inherit', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
      >
        {label}
        <span aria-hidden style={{ fontSize: 9, lineHeight: 1, opacity: active ? 1 : 0.4 }}>{arrow}</span>
      </span>
    </th>
  );
}

// Column keys are stable identifiers used by the View Customizer to
// persist column visibility per-user. Renaming a key here would orphan
// any saved preference, so treat the strings below as a public API.
export const LEAD_COLUMNS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'company', label: 'Company' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'score', label: 'Score' },
  // Latest free-form update from crm_leads.latest_update (denormalised
  // server-side from crm_lead_updates on every insert). Empty for leads
  // that haven't had an update written yet.
  { key: 'latest_update', label: 'Latest Update' },
  { key: 'source', label: 'Source' },
  { key: 'owner', label: 'Owner' },
  // "Uploaded by" — set on lead create, hydrated server-side via
  // stampCreatedByNames so we get the user's display name not a UUID.
  { key: 'created_by', label: 'Uploaded By' },
  { key: 'created_at', label: 'Uploaded On' },
  { key: 'action', label: 'Action' },
] as const;

export default function LeadsTable({ leads, selected, onToggle, onToggleAll, loading, isB2C = false, onAssign, hiddenColumns, viewMode = 'table', sort, onSort, onEdit }: Props) {
  const [scorePopup, setScorePopup] = useState<Lead | null>(null);
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
  const thStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };

  const hidden = hiddenColumns ?? new Set<string>();
  const isVisible = (key: string) => !hidden.has(key);
  // B2C deals don't use Company; treat it as implicitly hidden so the
  // user can't accidentally un-hide an empty column.
  const showCompany = !isB2C && isVisible('company');
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;

  // Count visible cells for the empty/loading row colSpan.
  let colCount = 1; // checkbox
  if (true)                   colCount += 1; // name (locked)
  if (showCompany)            colCount += 1;
  if (isVisible('phone'))     colCount += 1;
  if (isVisible('status'))    colCount += 1;
  if (isVisible('score'))     colCount += 1;
  if (isVisible('latest_update')) colCount += 1;
  if (isVisible('source'))    colCount += 1;
  if (isVisible('owner'))     colCount += 1;
  if (isVisible('created_by')) colCount += 1;
  if (isVisible('created_at')) colCount += 1;
  if (isVisible('action'))    colCount += 1;

  return (
    <>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40 }}>
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
                </th>
                <SortTh label="Name" sortKey="name" sort={sort} onSort={onSort} thStyle={thStyle} />
                {showCompany && <SortTh label="Company" sortKey="company" sort={sort} onSort={onSort} thStyle={thStyle} />}
                {isVisible('phone') && <th style={thStyle}>Phone</th>}
                {isVisible('status') && <SortTh label="Status" sortKey="status" sort={sort} onSort={onSort} thStyle={thStyle} />}
                {isVisible('score') && <SortTh label="Score" sortKey="score" sort={sort} onSort={onSort} thStyle={thStyle} />}
                {isVisible('latest_update') && <th style={thStyle}>Latest Update</th>}
                {isVisible('source') && <th style={thStyle}>Source</th>}
                {isVisible('owner') && <th style={thStyle}>Owner</th>}
                {isVisible('created_by') && <th style={thStyle}>Uploaded By</th>}
                {/* created_at column → backend sort key 'created' (leads whitelist maps created→created_at). */}
                {isVisible('created_at') && <SortTh label="Uploaded On" sortKey="created" sort={sort} onSort={onSort} thStyle={thStyle} />}
                {isVisible('action') && <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={colCount} style={{ ...tdStyle, textAlign: 'center' }} data-label=""><div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><LogoSpinner size={38} label="Loading leads…" /></div></td></tr>
              )}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={colCount} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">No leads found.</td></tr>
              )}
              {leads.map((l) => (
                <LeadRow
                  key={l.id}
                  lead={l}
                  isSelected={selected.has(l.id)}
                  onToggle={onToggle}
                  onScoreClick={setScorePopup}
                  onAssign={onAssign}
                  onEdit={onEdit}
                  isB2C={isB2C}
                  tdStyle={tdStyle}
                  hidden={hidden}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {scorePopup && <ScoreBreakdownModal lead={scorePopup} onClose={() => setScorePopup(null)} />}
    </>
  );
}

interface LeadRowProps {
  lead: Lead;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onScoreClick: (lead: Lead) => void;
  onAssign?: (leadId: string, userId: string | null) => Promise<void>;
  onEdit?: (lead: Lead) => void;
  isB2C: boolean;
  tdStyle: React.CSSProperties;
  hidden: Set<string>;
}

const LeadRow = memo(function LeadRow({ lead: l, isSelected, onToggle, onScoreClick, onAssign, onEdit, isB2C, tdStyle, hidden }: LeadRowProps) {
  const fullName = l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || '—';
  const handleToggle = useCallback(() => onToggle(l.id), [onToggle, l.id]);
  const handleScore  = useCallback(() => onScoreClick(l), [onScoreClick, l]);
  const handleAssign = useCallback((uid: string | null) => onAssign?.(l.id, uid) ?? Promise.resolve(), [onAssign, l.id]);
  const showCompany = !isB2C && !hidden.has('company');

  return (
    <tr>
      <td style={tdStyle} data-label=""><input type="checkbox" checked={isSelected} onChange={handleToggle} /></td>
      <td style={tdStyle} data-label="Name">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link href={`/dashboard/crm/leads/${l.id}`} className="km-entity-link" title="Open lead detail">{fullName}</Link>
          {/* Always-visible inline-edit pencil so the edit affordance is
              discoverable without scrolling to the Action column. */}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(l)}
              title="Edit this lead"
              aria-label="Edit lead"
              style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--primary)', lineHeight: 0, flexShrink: 0, opacity: 0.8 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
          )}
        </div>
        {l.title && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{l.title}</div>}
      </td>
      {showCompany && <td style={tdStyle} data-label="Company">{l.company || '—'}</td>}
      {!hidden.has('phone') && <td style={tdStyle} data-label="Phone">{l.phone || '—'}</td>}
      {!hidden.has('status') && <td style={tdStyle} data-label="Status"><span style={{ textTransform: 'capitalize' }}>{l.status}</span></td>}
      {!hidden.has('score') && (
        <td style={tdStyle} data-label="Score">
          <button type="button" onClick={handleScore} title="Click to see score breakdown" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
            <LeadScoreBadge score={l.score} grade={l.score_grade} />
          </button>
        </td>
      )}
      {!hidden.has('latest_update') && <LatestUpdateCell lead={l} tdStyle={tdStyle} />}
      {!hidden.has('source') && <td style={tdStyle} data-label="Source">{l.source_name || '—'}</td>}
      {!hidden.has('owner') && (
        <td style={tdStyle} data-label="Owner">
          {onAssign ? (
            <InlineOwnerAssign currentOwnerId={l.owner_id} currentOwnerName={l.owner_name} onAssign={handleAssign} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><OwnerAvatar name={l.owner_name} size={24} /> <span style={{ fontSize: 12 }}>{l.owner_name || 'Unassigned'}</span></div>
          )}
        </td>
      )}
      {!hidden.has('created_by') && (
        <td style={tdStyle} data-label="Uploaded By">
          {(l as { created_by_name?: string | null }).created_by_name || <span style={{ color: 'var(--text-dim)' }}>—</span>}
        </td>
      )}
      {!hidden.has('created_at') && (
        <td style={tdStyle} data-label="Uploaded On">
          {l.created_at ? (
            <span title={new Date(l.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
              {new Date(l.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
        </td>
      )}
      {!hidden.has('action') && (
        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} data-label="Action">
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
            {/* Inline edit — opens the edit modal in place so a rep can fix a
                single record without navigating into its detail page. */}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(l)}
                title="Edit this lead"
                style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Edit
              </button>
            )}
            {l.status === 'converted' ? (
              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>✓ Converted</span>
            ) : (
              <Link href={`/dashboard/crm/leads/${l.id}?convert=1`} style={{ background: 'var(--primary)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: 'none' }} title="Convert this lead to a deal">→ Deal</Link>
            )}
          </div>
        </td>
      )}
    </tr>
  );
});

/**
 * Latest-update column cell. Reads from `crm_leads.latest_update*` which is
 * denormalised server-side every time someone adds an update to the lead.
 * Truncates to a single line with tooltip showing the full text + relative
 * timestamp; falls back to em-dash when there's no update yet.
 *
 * `latest_update*` aren't on the shared Lead type yet (added by the
 * lead-NBA-and-Updates backend PR) so we read defensively.
 */
function LatestUpdateCell({ lead, tdStyle }: { lead: Lead; tdStyle: React.CSSProperties }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = lead as any;
  const text = (l.latest_update ?? '') as string;
  const at = (l.latest_update_at ?? null) as string | null;
  if (!text) {
    return <td style={tdStyle} data-label="Latest Update"><span style={{ color: 'var(--text-dim)' }}>—</span></td>;
  }
  const rel = at ? formatRelativeTime(at) : '';
  const tooltip = at ? `${text}\n\n${new Date(at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : text;
  // The `.latest-update-cell` class lets the responsive-cards CSS allow
  // the body to wrap on small screens instead of single-line ellipsing
  // (cards mode has room for multi-line; desktop table rows don't).
  return (
    <td style={tdStyle} data-label="Latest Update" title={tooltip}>
      <div className="latest-update-cell">
        <div className="latest-update-body">{text}</div>
        {rel && <div className="latest-update-time">{rel}</div>}
      </div>
    </td>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
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

function ScoreBreakdownModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const breakdown = (lead as any).score_breakdown as Record<string, number> | null | undefined;
  const score = lead.score ?? 0;
  const grade = lead.score_grade;

  // Label dict + sorting moved to lib/crm/scoreFactors.ts so the leads-
  // table popup and the dashboard map popup stay in lock-step. The v2
  // keys this PR originally introduced are already in that catalog
  // (`source_quality`, `whatsapp_30d`, `bant_signals_in_updates`,
  // `contact_complete`, etc.), so no manual labels dict is needed here.
  const factors = breakdownFactors(breakdown);
  const llmAdjustment = llmAdjustmentOf(breakdown);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Lead Score Explanation</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Lead'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, background: 'var(--s3)', borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444' }}>{score}</div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Total Score / 100</div>
            {grade && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>Grade <strong>{grade}</strong></div>}
          </div>
        </div>

        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-dim)' }}>
          Score is computed from a heuristic model that weighs key lead attributes. Higher scores indicate hotter leads worth prioritizing first.
        </div>

        {factors.length === 0 ? (
          <div style={{ padding: 16, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
            No detailed breakdown available yet. Click <em>Rescore</em> on the lead detail page to compute one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {factors.map(({ key, label, value }) => {
              const max = Math.max(20, ...factors.map((f) => f.value));
              const pct = Math.max(0, Math.min(100, (value / max) * 100));
              const color = value >= 15 ? '#10b981' : value >= 8 ? '#f59e0b' : '#6366f1';
              return (
                <div key={key} style={{ background: 'var(--s3)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 12, color, fontWeight: 700 }}>+{value}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--s2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {llmAdjustment != null && llmAdjustment !== 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--s3)', borderRadius: 8 }}>
            <span>AI rerank adjustment</span>
            <span style={{ fontWeight: 700, color: llmAdjustment > 0 ? '#10b981' : '#ef4444' }}>{llmAdjustment > 0 ? '+' : ''}{llmAdjustment}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Link
            href={`/dashboard/crm/leads/${lead.id}`}
            onClick={onClose}
            style={{ background: 'var(--primary)', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
          >
            View Lead →
          </Link>
        </div>
      </div>
    </div>
  );
}
