'use client';
import { memo, useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Check, Hourglass, Pencil, X } from 'lucide-react';
import type { Lead } from '../../types/crm';
import LeadScoreBadge from './LeadScoreBadge';
import { breakdownFactors, llmAdjustmentOf } from '../../lib/crm/scoreFactors';
import OwnerAvatar from './shared/OwnerAvatar';
import InlineOwnerAssign from './shared/InlineOwnerAssign';
import LogoSpinner from '../shared/LogoSpinner';
import { Badge, Button, EmptyState, Eyebrow, IconButton, T, type Tone } from '../ui';

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
  // Manager approval: when provided, a lead whose approval_status is 'pending'
  // shows Approve / Reject buttons in the Action column and a "Pending
  // approval" badge by its name. Backend enforces who may actually decide.
  onApprove?: (leadId: string, decision: 'approved' | 'rejected') => Promise<void>;
}

// Table header cell — mono eyebrow, 12px vertical padding, hairline below.
const thStyle: React.CSSProperties = {
  padding: '12px 14px', textAlign: 'left', whiteSpace: 'nowrap',
  fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500,
  borderBottom: `1px solid ${T.border}`, background: T.card,
};
const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };

// Lead status → badge tone. Unknown statuses fall back to neutral.
function statusTone(status?: string | null): Tone {
  switch ((status || '').toLowerCase()) {
    case 'new': return 'info';
    case 'working': return 'warn';
    case 'qualified': return 'ok';
    case 'converted': return 'ok';
    case 'lost': return 'red';
    default: return 'neutral';
  }
}

// Clickable, server-side-sort table header. The actual sorting happens on
// the backend via onSort → parent refetch; this only renders the label +
// asc/desc/idle affordance. Non-sortable columns pass no onSort and render
// a plain <th>.
function SortTh({ label, sortKey, sort, onSort, align = 'left' }: {
  label: string;
  sortKey: string;
  sort?: { key: string; order: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  align?: 'left' | 'right';
}) {
  const th: React.CSSProperties = { ...thStyle, textAlign: align };
  if (!onSort) return <th style={th}>{label}</th>;
  const active = !!sort && sort.key === sortKey;
  const Icon = active ? (sort!.order === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th style={th} aria-sort={active ? (sort!.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => onSort(sortKey)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(sortKey); } }}
        title="Sort"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none', color: active ? T.text : 'inherit', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
      >
        {label}
        <Icon size={12} strokeWidth={1.8} aria-hidden style={{ opacity: active ? 1 : 0.45, flexShrink: 0 }} />
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

/**
 * Leads list table. Renders bare (no card) so the page can wrap it in a
 * `Card padding={0}` together with its selection strip and pagination
 * footer. Keeps the `responsive-cards` / `cards-view` classes + `data-label`s
 * that globals.css uses for the phone card-stack layout.
 */
export default function LeadsTable({ leads, selected, onToggle, onToggleAll, loading, isB2C = false, onAssign, hiddenColumns, viewMode = 'table', sort, onSort, onEdit, onApprove }: Props) {
  const [scorePopup, setScorePopup] = useState<Lead | null>(null);
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

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
      <div style={{ overflowX: 'auto' }}>
        <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40, paddingRight: 0 }}>
                <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all on this page" style={{ width: 15, height: 15, display: 'block' }} />
              </th>
              <SortTh label="Name" sortKey="name" sort={sort} onSort={onSort} />
              {showCompany && <SortTh label="Company" sortKey="company" sort={sort} onSort={onSort} />}
              {isVisible('phone') && <th style={thStyle}>Phone</th>}
              {isVisible('status') && <SortTh label="Status" sortKey="status" sort={sort} onSort={onSort} />}
              {isVisible('score') && <SortTh label="Score" sortKey="score" sort={sort} onSort={onSort} />}
              {isVisible('latest_update') && <th style={thStyle}>Latest update</th>}
              {isVisible('source') && <th style={thStyle}>Source</th>}
              {isVisible('owner') && <th style={thStyle}>Owner</th>}
              {isVisible('created_by') && <th style={thStyle}>Uploaded by</th>}
              {/* created_at column → backend sort key 'created' (leads whitelist maps created→created_at). */}
              {isVisible('created_at') && <SortTh label="Uploaded on" sortKey="created" sort={sort} onSort={onSort} />}
              {isVisible('action') && <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={colCount} style={{ ...tdStyle, textAlign: 'center', borderBottom: 0 }} data-label=""><div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><LogoSpinner size={38} label="Loading leads…" /></div></td></tr>
            )}
            {!loading && leads.length === 0 && (
              <tr><td colSpan={colCount} style={{ ...tdStyle, padding: 0, borderBottom: 0 }} data-label="">
                <EmptyState title="No leads match" description="Try widening the date range or clearing a filter. New leads land here as soon as they're captured." />
              </td></tr>
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
                onApprove={onApprove}
                isB2C={isB2C}
                hidden={hidden}
              />
            ))}
          </tbody>
        </table>
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
  onApprove?: (leadId: string, decision: 'approved' | 'rejected') => Promise<void>;
  isB2C: boolean;
  hidden: Set<string>;
}

const LeadRow = memo(function LeadRow({ lead: l, isSelected, onToggle, onScoreClick, onAssign, onEdit, onApprove, isB2C, hidden }: LeadRowProps) {
  const fullName = l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || '—';
  const handleToggle = useCallback(() => onToggle(l.id), [onToggle, l.id]);
  const handleScore  = useCallback(() => onScoreClick(l), [onScoreClick, l]);
  const handleAssign = useCallback((uid: string | null) => onAssign?.(l.id, uid) ?? Promise.resolve(), [onAssign, l.id]);
  const showCompany = !isB2C && !hidden.has('company');
  const isPending = l.approval_status === 'pending';
  const [deciding, setDeciding] = useState<null | 'approved' | 'rejected'>(null);
  const decide = useCallback(async (decision: 'approved' | 'rejected') => {
    if (!onApprove || deciding) return;
    setDeciding(decision);
    try { await onApprove(l.id, decision); } finally { setDeciding(null); }
  }, [onApprove, l.id, deciding]);

  return (
    <tr style={isSelected ? { background: 'var(--s3)' } : undefined}>
      <td style={{ ...tdStyle, paddingRight: 0 }} data-label=""><input type="checkbox" checked={isSelected} onChange={handleToggle} aria-label={`Select ${fullName}`} style={{ width: 15, height: 15, display: 'block' }} /></td>
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
              className="km-iconbtn"
              style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: T.mute, lineHeight: 0, flexShrink: 0, borderRadius: 4, display: 'inline-flex' }}
            >
              <Pencil size={13} strokeWidth={1.8} />
            </button>
          )}
        </div>
        {l.title && <div style={{ fontSize: 12, color: T.dim, marginTop: 1 }}>{l.title}</div>}
        {isPending && (
          <div style={{ marginTop: 4 }}><Badge tone="warn" style={{ gap: 4 }}><Hourglass size={11} strokeWidth={1.8} />Pending approval</Badge></div>
        )}
        {l.approval_status === 'rejected' && (
          <div style={{ marginTop: 4 }}><Badge tone="red">Rejected</Badge></div>
        )}
      </td>
      {showCompany && <td style={tdStyle} data-label="Company">{l.company || <Dash />}</td>}
      {!hidden.has('phone') && <td style={{ ...tdStyle, fontFamily: T.mono, fontSize: 12.5, whiteSpace: 'nowrap' }} data-label="Phone">{l.phone || <Dash />}</td>}
      {!hidden.has('status') && (
        <td style={tdStyle} data-label="Status">
          {l.status ? <Badge tone={statusTone(l.status)} dot style={{ textTransform: 'capitalize' }}>{String(l.status).replace(/_/g, ' ')}</Badge> : <Dash />}
        </td>
      )}
      {!hidden.has('score') && (
        <td style={tdStyle} data-label="Score">
          <button type="button" onClick={handleScore} title="Click to see score breakdown" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' }}>
            <LeadScoreBadge score={l.score} grade={l.score_grade} />
          </button>
        </td>
      )}
      {!hidden.has('latest_update') && <LatestUpdateCell lead={l} />}
      {!hidden.has('source') && <td style={{ ...tdStyle, color: T.dim }} data-label="Source">{l.source_name || <Dash />}</td>}
      {!hidden.has('owner') && (
        <td style={tdStyle} data-label="Owner">
          {onAssign ? (
            <InlineOwnerAssign currentOwnerId={l.owner_id} currentOwnerName={l.owner_name} onAssign={handleAssign} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><OwnerAvatar name={l.owner_name} size={24} /> <span style={{ fontSize: 13 }}>{l.owner_name || 'Unassigned'}</span></div>
          )}
        </td>
      )}
      {!hidden.has('created_by') && (
        <td style={{ ...tdStyle, color: T.dim }} data-label="Uploaded By">
          {(l as { created_by_name?: string | null }).created_by_name || <Dash />}
        </td>
      )}
      {!hidden.has('created_at') && (
        <td style={{ ...tdStyle, fontFamily: T.mono, fontSize: 12, color: T.dim, whiteSpace: 'nowrap' }} data-label="Uploaded On">
          {l.created_at ? (
            <span title={new Date(l.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
              {new Date(l.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : <Dash />}
        </td>
      )}
      {!hidden.has('action') && (
        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} data-label="Action">
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
            {/* Manager approval — approve / reject a lead awaiting sign-off.
                Only rendered while the lead is pending AND the parent wired an
                onApprove handler (the backend still enforces who may decide). */}
            {isPending && onApprove && (
              <>
                <Button
                  size="sm"
                  disabled={!!deciding}
                  onClick={() => decide('approved')}
                  title="Approve this lead"
                  icon={<Check size={14} strokeWidth={2} />}
                  style={{ background: T.okWash, color: T.ok, borderColor: 'transparent', opacity: deciding && deciding !== 'approved' ? 0.5 : undefined }}
                >
                  {deciding === 'approved' ? '…' : 'Approve'}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!!deciding}
                  onClick={() => decide('rejected')}
                  title="Reject this lead"
                  icon={<X size={14} strokeWidth={2} />}
                  style={{ opacity: deciding && deciding !== 'rejected' ? 0.5 : undefined }}
                >
                  {deciding === 'rejected' ? '…' : 'Reject'}
                </Button>
              </>
            )}
            {/* Inline edit — opens the edit modal in place so a rep can fix a
                single record without navigating into its detail page. */}
            {onEdit && (
              <Button size="sm" onClick={() => onEdit(l)} title="Edit this lead">Edit</Button>
            )}
            {l.status === 'converted' ? (
              <Badge tone="ok" style={{ gap: 4 }}><Check size={12} strokeWidth={2} />Converted</Badge>
            ) : (
              <Button size="sm" variant="primary" href={`/dashboard/crm/leads/${l.id}?convert=1`} title="Convert this lead to a deal" icon={<ArrowRight size={14} strokeWidth={2} />}>Deal</Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
});

function Dash() { return <span style={{ color: T.mute }}>—</span>; }

/**
 * Latest-update column cell. Reads from `crm_leads.latest_update*` which is
 * denormalised server-side every time someone adds an update to the lead.
 * Truncates to a single line with tooltip showing the full text + relative
 * timestamp; falls back to em-dash when there's no update yet.
 *
 * `latest_update*` aren't on the shared Lead type yet (added by the
 * lead-NBA-and-Updates backend PR) so we read defensively.
 */
function LatestUpdateCell({ lead }: { lead: Lead }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = lead as any;
  const text = (l.latest_update ?? '') as string;
  const at = (l.latest_update_at ?? null) as string | null;
  if (!text) {
    return <td style={tdStyle} data-label="Latest Update"><Dash /></td>;
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
        {rel && <div className="latest-update-time" style={{ fontFamily: T.mono }}>{rel}</div>}
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
  const scoreColor = score >= 70 ? T.ok : score >= 40 ? T.warn : T.red;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lead score explanation"
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, boxShadow: 'var(--shadow-pop)', maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>Lead score</Eyebrow>
            <div style={{ fontFamily: T.heading, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, marginTop: 4 }}>{lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Lead'}</div>
          </div>
          <IconButton label="Close" onClick={onClose}><X size={18} strokeWidth={1.6} /></IconButton>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, background: 'var(--s3)', borderRadius: T.radius.md }}>
            <div style={{ fontFamily: T.heading, fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
            <div>
              <Eyebrow>Total score / 100</Eyebrow>
              {grade && <div style={{ fontSize: 13, color: T.text, marginTop: 4 }}>Grade <span style={{ fontFamily: T.mono }}>{grade}</span></div>}
            </div>
          </div>

          <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.5 }}>
            Score is computed from a heuristic model that weighs key lead attributes. Higher scores indicate hotter leads worth prioritising first.
          </div>

          {factors.length === 0 ? (
            <div style={{ padding: 16, background: 'var(--s3)', borderRadius: T.radius.md, fontSize: 13, color: T.dim, textAlign: 'center' }}>
              No detailed breakdown available yet. Click <em>Rescore</em> on the lead detail page to compute one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {factors.map(({ key, label, value }) => {
                const max = Math.max(20, ...factors.map((f) => f.value));
                const pct = Math.max(0, Math.min(100, (value / max) * 100));
                const color = value >= 15 ? T.ok : value >= 8 ? T.warn : T.info;
                return (
                  <div key={key} style={{ background: 'var(--s3)', borderRadius: T.radius.md, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: T.text }}>{label}</span>
                      <span style={{ fontSize: 12, color, fontFamily: T.mono }}>+{value}</span>
                    </div>
                    <div style={{ height: 5, background: T.rule, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {llmAdjustment != null && llmAdjustment !== 0 && (
            <div style={{ fontSize: 12.5, color: T.dim, display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--s3)', borderRadius: T.radius.md }}>
              <span>AI rerank adjustment</span>
              <span style={{ fontFamily: T.mono, color: llmAdjustment > 0 ? T.ok : T.red }}>{llmAdjustment > 0 ? '+' : ''}{llmAdjustment}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" href={`/dashboard/crm/leads/${lead.id}`} icon={<ArrowRight size={16} strokeWidth={2} />}>View lead</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
