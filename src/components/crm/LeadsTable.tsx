'use client';
import { memo, useCallback, useState } from 'react';
import Link from 'next/link';
import type { Lead } from '../../types/crm';
import LeadScoreBadge from './LeadScoreBadge';
import OwnerAvatar from './shared/OwnerAvatar';
import InlineOwnerAssign from './shared/InlineOwnerAssign';

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
  { key: 'action', label: 'Action' },
] as const;

export default function LeadsTable({ leads, selected, onToggle, onToggleAll, loading, isB2C = false, onAssign, hiddenColumns, viewMode = 'table' }: Props) {
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
                <th style={thStyle}>Name</th>
                {showCompany && <th style={thStyle}>Company</th>}
                {isVisible('phone') && <th style={thStyle}>Phone</th>}
                {isVisible('status') && <th style={thStyle}>Status</th>}
                {isVisible('score') && <th style={thStyle}>Score</th>}
                {isVisible('latest_update') && <th style={thStyle}>Latest Update</th>}
                {isVisible('source') && <th style={thStyle}>Source</th>}
                {isVisible('owner') && <th style={thStyle}>Owner</th>}
                {isVisible('action') && <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={colCount} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-dim)' }} data-label="">Loading leads...</td></tr>
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
  isB2C: boolean;
  tdStyle: React.CSSProperties;
  hidden: Set<string>;
}

const LeadRow = memo(function LeadRow({ lead: l, isSelected, onToggle, onScoreClick, onAssign, isB2C, tdStyle, hidden }: LeadRowProps) {
  const fullName = l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || '—';
  const handleToggle = useCallback(() => onToggle(l.id), [onToggle, l.id]);
  const handleScore  = useCallback(() => onScoreClick(l), [onScoreClick, l]);
  const handleAssign = useCallback((uid: string | null) => onAssign?.(l.id, uid) ?? Promise.resolve(), [onAssign, l.id]);
  const showCompany = !isB2C && !hidden.has('company');

  return (
    <tr>
      <td style={tdStyle} data-label=""><input type="checkbox" checked={isSelected} onChange={handleToggle} /></td>
      <td style={tdStyle} data-label="Name">
        <Link href={`/dashboard/crm/leads/${l.id}`} className="km-entity-link" title="Open lead detail">{fullName}</Link>
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
      {!hidden.has('action') && (
        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} data-label="Action">
          {l.status === 'converted' ? (
            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>✓ Converted</span>
          ) : (
            <Link href={`/dashboard/crm/leads/${l.id}?convert=1`} style={{ background: 'var(--primary)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: 'none' }} title="Convert this lead to a deal">→ Deal</Link>
          )}
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
  return (
    <td style={tdStyle} data-label="Latest Update" title={tooltip}>
      <div style={{ maxWidth: 260, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</div>
        {rel && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{rel}</div>}
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

  const entries: Array<[string, number]> = breakdown && typeof breakdown === 'object'
    ? Object.entries(breakdown).filter(([_, v]) => typeof v === 'number')
    : [];

  const labels: Record<string, string> = {
    title_seniority: 'Job Title Seniority',
    title: 'Job Title Seniority',
    company_size: 'Company Size',
    company: 'Company Match',
    source_weight: 'Lead Source',
    source: 'Lead Source',
    engagement: 'Engagement Activity',
    recency: 'Recency',
    icp_match: 'ICP (Ideal Customer Profile) Match',
    icp: 'ICP Match',
    industry: 'Industry Match',
    geo: 'Geography',
    email_quality: 'Email Quality',
    phone_present: 'Phone Number Present',
  };

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

        {entries.length === 0 ? (
          <div style={{ padding: 16, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
            No detailed breakdown available yet. Click <em>Rescore</em> on the lead detail page to compute one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map(([key, value]) => {
              const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const max = Math.max(20, ...entries.map(([, v]) => v));
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
