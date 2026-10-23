'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, ArrowUpRight, Check, Hourglass, Pencil, Star, X } from 'lucide-react';
import type { Lead } from '../../types/crm';
import type { LeadStatusOption } from '../../lib/crmLeadStatuses';
import type { FieldHelpers } from '../../lib/crmFieldOverrides';
import OwnerAvatar from './shared/OwnerAvatar';
import InlineOwnerAssign from './shared/InlineOwnerAssign';
import WhatsAppButton from './shared/WhatsAppButton';
import LeadAvatar, { leadDisplayName } from './leads/LeadAvatar';
import ScoreMeter from './leads/ScoreMeter';
import { LeadsSkeleton } from './leads/LeadsStates';
import { Badge, Button, IconButton, T, type Tone } from '../ui';

interface Props {
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  loading?: boolean;
  isB2C?: boolean;
  onAssign?: (leadId: string, userId: string | null) => Promise<void>;
  hiddenColumns?: Set<string>;
  // Server-side sort. `sort.key` is the backend sort key (see the
  // column→key mapping in the header); `onSort(key)` asks the parent to
  // toggle/switch the active sort and refetch. Undefined = non-sortable UI.
  sort?: { key: string; order: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  // Inline edit: open the edit modal for a single row straight from the
  // list, so a rep can fix one lead without opening its detail page.
  onEdit?: (lead: Lead) => void;
  // Manager approval: when provided, a lead whose approval_status is 'pending'
  // shows Approve / Reject buttons and a "Pending approval" badge by its name.
  // Backend enforces who may actually decide.
  onApprove?: (leadId: string, decision: 'approved' | 'rejected') => Promise<void>;
  // Mark-important: when provided, a star toggle next to each lead's name
  // flips crm_leads.custom_fields.__important. The parent owns the optimistic
  // local update + API call so the star reflects the new state immediately.
  onToggleImportant?: (lead: Lead) => void;
  // Per-client custom lead-status set. Null = use the built-in statusTone()
  // colours + raw-value labels (no change for existing tenants). When set, a
  // row's status badge renders the matching option's label + colour.
  statusOptions?: LeadStatusOption[] | null;
  // Quick preview: clicking a row (outside its links / controls) opens it.
  onPreview?: (lead: Lead) => void;
  previewId?: string | null;
  // Opens the full score breakdown (the score cell is a button).
  onScoreClick?: (lead: Lead) => void;
  // Narrow layout used while the preview panel is docked beside the list:
  // keeps Lead / Status / Score and drops the secondary columns.
  slim?: boolean;
  // Built-in field overrides (Settings → Custom Fields). Every built-in column /
  // sub-line below is gated through these — see the contract in CLAUDE.md.
  fieldHelpers?: FieldHelpers;
  // Rendered in place of the rows when there is nothing to show (no-results / first-run).
  emptyState?: ReactNode;
}

// Table header cell — mono eyebrow, 12px vertical padding, hairline below.
const thStyle: React.CSSProperties = {
  padding: '12px 14px', textAlign: 'left', whiteSpace: 'nowrap',
  fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500,
  borderBottom: `1px solid ${T.border}`, background: T.card,
};
const tdStyle: React.CSSProperties = { padding: '11px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };

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
// (Company + Phone no longer have columns of their own: they are the sub-line
// under each lead's name, and these toggles still show / hide them.)
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

const SLIM_HIDDEN = new Set(['latest_update', 'source', 'owner', 'created_by', 'created_at']);

/**
 * Leads list table. Renders bare (no card) so the page can wrap it in a
 * `Card padding={0}` together with its pagination footer. Keeps the
 * `responsive-cards` class + `data-label`s that globals.css uses for the
 * tablet card-stack layout (phones get the dedicated LeadCardStack instead).
 */
export default function LeadsTable({
  leads, selected, onToggle, onToggleAll, loading, isB2C = false, onAssign, hiddenColumns, sort, onSort, onEdit, onApprove,
  onToggleImportant, statusOptions = null, onPreview, previewId = null, onScoreClick, slim = false, fieldHelpers, emptyState,
}: Props) {
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const someSelected = !allSelected && leads.some((l) => selected.has(l.id));
  const headCheck = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headCheck.current) headCheck.current.indeterminate = someSelected; }, [someSelected]);

  // Stable value→option lookup for the status cell. Null when no custom set is
  // configured, so LeadRow keeps the built-in tone/label path. Memoised so the
  // memo()'d rows don't re-render on unrelated parent updates.
  const statusLookup = useMemo(() => {
    if (!statusOptions || statusOptions.length === 0) return null;
    const m = new Map<string, LeadStatusOption>();
    for (const o of statusOptions) m.set(o.value.toLowerCase(), o);
    return m;
  }, [statusOptions]);

  const hidden = useMemo(() => {
    const h = new Set(hiddenColumns ?? []);
    if (slim) SLIM_HIDDEN.forEach((k) => h.add(k));
    return h;
  }, [hiddenColumns, slim]);
  const hid = (key: string) => !!fieldHelpers?.isHidden(key);
  const label = (key: string, fallback: string) => fieldHelpers?.labelFor(key, fallback) ?? fallback;
  const isVisible = (key: string) => !hidden.has(key);
  const showStatus = isVisible('status') && !hid('status');
  const showScore = isVisible('score') && !hid('score');
  const showSource = isVisible('source') && !hid('source_id');
  const showOwner = isVisible('owner') && !hid('owner_id');

  // Cells before the last: checkbox, lead, [status], [score], … + the zero-width actions anchor.
  let colCount = 3;
  if (showStatus) colCount += 1;
  if (showScore) colCount += 1;
  if (isVisible('latest_update')) colCount += 1;
  if (showSource) colCount += 1;
  if (showOwner) colCount += 1;
  if (isVisible('created_by')) colCount += 1;
  if (isVisible('created_at')) colCount += 1;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="responsive-cards lead-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 40, paddingRight: 0 }}>
              <input ref={headCheck} type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all on this page" style={{ width: 15, height: 15, display: 'block' }} />
            </th>
            <SortTh label="Lead" sortKey="name" sort={sort} onSort={onSort} />
            {showStatus && <SortTh label="Status" sortKey="status" sort={sort} onSort={onSort} />}
            {showScore && <SortTh label={label('score', 'Score')} sortKey="score" sort={sort} onSort={onSort} />}
            {isVisible('latest_update') && <th style={thStyle}>Latest update</th>}
            {showSource && <th style={thStyle}>{label('source_id', 'Source')}</th>}
            {showOwner && <th style={thStyle}>{label('owner_id', 'Owner')}</th>}
            {isVisible('created_by') && <th style={thStyle}>Uploaded by</th>}
            {/* created_at column → backend sort key 'created' (leads whitelist maps created→created_at). */}
            {isVisible('created_at') && <SortTh label="Uploaded on" sortKey="created" sort={sort} onSort={onSort} />}
            <th aria-label="Actions" style={{ ...thStyle, width: 0, padding: 0 }} />
          </tr>
        </thead>
        <tbody>
          {loading && leads.length === 0 && (
            <tr><td colSpan={colCount} style={{ ...tdStyle, padding: 0, borderBottom: 0 }} data-label=""><LeadsSkeleton /></td></tr>
          )}
          {!loading && leads.length === 0 && (
            <tr><td colSpan={colCount} style={{ ...tdStyle, padding: 0, borderBottom: 0 }} data-label="">{emptyState}</td></tr>
          )}
          {leads.map((l) => (
            <LeadRow
              key={l.id}
              lead={l}
              isSelected={selected.has(l.id)}
              isOpen={previewId === l.id}
              dim={!!loading}
              onToggle={onToggle}
              onPreview={onPreview}
              onScoreClick={onScoreClick}
              onAssign={onAssign}
              onEdit={onEdit}
              onApprove={onApprove}
              onToggleImportant={onToggleImportant}
              isB2C={isB2C}
              hidden={hidden}
              statusLookup={statusLookup}
              fieldHelpers={fieldHelpers}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LeadRowProps {
  lead: Lead;
  isSelected: boolean;
  isOpen: boolean;
  /** Refetching: keep the previous rows visible but faded so the page doesn't flash empty. */
  dim: boolean;
  onToggle: (id: string) => void;
  onPreview?: (lead: Lead) => void;
  onScoreClick?: (lead: Lead) => void;
  onAssign?: (leadId: string, userId: string | null) => Promise<void>;
  onEdit?: (lead: Lead) => void;
  onApprove?: (leadId: string, decision: 'approved' | 'rejected') => Promise<void>;
  onToggleImportant?: (lead: Lead) => void;
  isB2C: boolean;
  hidden: Set<string>;
  statusLookup: Map<string, LeadStatusOption> | null;
  fieldHelpers?: FieldHelpers;
}

const LeadRow = memo(function LeadRow({
  lead: l, isSelected, isOpen, dim, onToggle, onPreview, onScoreClick, onAssign, onEdit, onApprove, onToggleImportant, isB2C, hidden, statusLookup, fieldHelpers,
}: LeadRowProps) {
  const fullName = leadDisplayName(l);
  const handleToggle = useCallback(() => onToggle(l.id), [onToggle, l.id]);
  const handleAssign = useCallback((uid: string | null) => onAssign?.(l.id, uid) ?? Promise.resolve(), [onAssign, l.id]);
  const hid = (key: string) => !!fieldHelpers?.isHidden(key);
  const showCompany = !isB2C && !hidden.has('company') && !hid('company');
  const showTitle = !hid('title');
  const showPhone = !hidden.has('phone') && !hid('phone');
  const showStatus = !hidden.has('status') && !hid('status');
  const showScore = !hidden.has('score') && !hid('score');
  const showSource = !hidden.has('source') && !hid('source_id');
  const showOwner = !hidden.has('owner') && !hid('owner_id');
  const isPending = l.approval_status === 'pending';
  const [deciding, setDeciding] = useState<null | 'approved' | 'rejected'>(null);
  const decide = useCallback(async (decision: 'approved' | 'rejected') => {
    if (!onApprove || deciding) return;
    setDeciding(decision);
    try { await onApprove(l.id, decision); } finally { setDeciding(null); }
  }, [onApprove, l.id, deciding]);

  const important = !!(l.custom_fields as { __important?: unknown } | null | undefined)?.__important;
  const subline = [showCompany ? l.company : null, showCompany && l.company ? null : (showTitle ? l.title : null)].filter(Boolean).join(' · ');
  const onRowClick = (e: React.MouseEvent) => {
    if (!onPreview) return;
    const t = e.target as HTMLElement;
    if (t.closest('a,button,input,select,textarea,label,[role="button"],[data-nopreview]')) return;
    onPreview(l);
  };

  return (
    <tr
      className={`km-row lead-row${isOpen ? ' is-open' : ''}${isPending ? ' has-pending' : ''}`}
      onClick={onRowClick}
      // Keyboard path to the quick preview: focus the row, press Enter / Space.
      tabIndex={onPreview ? 0 : undefined}
      onKeyDown={onPreview ? (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onPreview(l); } } : undefined}
      style={{ ...(isSelected ? { background: 'var(--s3)' } : undefined), ...(dim ? { opacity: 0.6, transition: 'opacity .15s ease' } : undefined), cursor: onPreview ? 'pointer' : undefined }}
    >
      <td style={{ ...tdStyle, paddingRight: 0 }} data-label="" data-nopreview>
        <input type="checkbox" checked={isSelected} onChange={handleToggle} aria-label={`Select ${fullName}`} style={{ width: 15, height: 15, display: 'block' }} />
      </td>

      <td style={{ ...tdStyle, minWidth: 230 }} data-label="Name">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <LeadAvatar lead={l} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <Link href={`/dashboard/crm/leads/${l.id}`} className="km-entity-link" title="Open lead detail" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{fullName}</Link>
              {/* Mark-important star. Filled/gold when custom_fields.__important is
                  set; click toggles it. Sits right after the name (an
                  unset star only appears on hover) so names stay aligned down
                  the column while a flagged lead still reads at a glance. */}
              {onToggleImportant && (
                <button
                  type="button"
                  onClick={() => onToggleImportant(l)}
                  title={important ? 'Unmark as important' : 'Mark as important'}
                  aria-label={important ? 'Unmark as important' : 'Mark as important'}
                  aria-pressed={important}
                  className={`km-iconbtn lead-star${important ? ' on' : ''}`}
                  style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', color: important ? '#f5a623' : T.mute, lineHeight: 0, flexShrink: 0, borderRadius: 4, display: 'inline-flex' }}
                >
                  <Star size={14} strokeWidth={1.8} fill={important ? '#f5a623' : 'none'} />
                </button>
              )}
              {isPending && <Badge tone="warn" style={{ gap: 4, height: 20, fontSize: 11, flexShrink: 0 }}><Hourglass size={11} strokeWidth={1.8} />Pending approval</Badge>}
              {l.approval_status === 'rejected' && <Badge tone="red" style={{ height: 20, fontSize: 11, flexShrink: 0 }}>Rejected</Badge>}
            </div>
            {(subline || (showPhone && l.phone)) && (
              <div style={{ marginTop: 2, fontSize: 12, color: T.dim, display: 'flex', gap: 6, minWidth: 0, whiteSpace: 'nowrap' }}>
                {subline && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{subline}</span>}
                {subline && showPhone && l.phone && <span aria-hidden style={{ color: T.mute }}>·</span>}
                {showPhone && l.phone && <span style={{ fontFamily: T.mono, fontSize: 11.5, flexShrink: 0 }}>{l.phone}</span>}
              </div>
            )}
          </div>
        </div>
      </td>

      {showStatus && (
        <td style={tdStyle} data-label="Status">
          {l.status ? (() => {
            const meta = statusLookup?.get(String(l.status).toLowerCase());
            const colourStyle = meta?.color
              ? { background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, color: meta.color }
              : undefined;
            return (
              <Badge tone={statusTone(l.status)} dot style={{ textTransform: 'capitalize', ...colourStyle }}>
                {meta?.label ?? String(l.status).replace(/_/g, ' ')}
              </Badge>
            );
          })() : <Dash />}
        </td>
      )}

      {showScore && (
        <td style={tdStyle} data-label="Score">
          <button type="button" onClick={() => onScoreClick?.(l)} title="Click to see score breakdown" style={{ background: 'transparent', border: 'none', padding: 0, cursor: onScoreClick ? 'pointer' : 'default', display: 'inline-flex' }}>
            <ScoreMeter score={l.score} grade={l.score_grade} />
          </button>
        </td>
      )}

      {!hidden.has('latest_update') && <LatestUpdateCell lead={l} />}
      {showSource && <td style={{ ...tdStyle, color: T.dim }} data-label="Source">{l.source_name || <Dash />}</td>}
      {showOwner && (
        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} data-label="Owner">
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
            <span
              title={new Date(l.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.35 }}
            >
              <span>{new Date(l.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span style={{ fontSize: 11, opacity: 0.75 }}>{new Date(l.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
            </span>
          ) : <Dash />}
        </td>
      )}

      {/* Zero-width anchor: the action cluster floats over the row's right edge
          (revealed on hover / keyboard focus; always shown while an approval
          decision is pending) so it never costs a column of its own. */}
      <td data-label="" style={{ ...tdStyle, padding: 0, width: 0, position: 'relative' }} data-nopreview>
        <div className={`row-actions${isPending && onApprove ? ' always' : ''}`}>
          {/* One click to the full lead — always offered, even when the Actions column is hidden or a decision is pending. */}
          <Link
            href={`/dashboard/crm/leads/${l.id}`}
            title="Open lead"
            aria-label="Open lead"
            className="km-iconbtn"
            style={{ width: 28, height: 28, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}`, background: T.card, color: T.text, textDecoration: 'none' }}
          >
            <ArrowUpRight size={15} strokeWidth={2} />
          </Link>
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
          {!hidden.has('action') && !isPending && (
            <>
              {/* Call lives in the quick preview and on the lead page; the row keeps the web-friendly shortcut. */}
              <WhatsAppButton phone={l.phone} iconOnly />
            </>
          )}
          {onEdit && (
            <IconButton label="Edit lead" onClick={() => onEdit(l)} style={{ width: 28, height: 28, border: `1px solid ${T.border}`, background: T.card }}>
              <Pencil size={13} strokeWidth={1.8} />
            </IconButton>
          )}
          {!hidden.has('action') && !isPending && l.status !== 'converted' && (
            <Link
              href={`/dashboard/crm/leads/${l.id}?convert=1`}
              title="Convert this lead to a deal"
              aria-label="Convert to deal"
              className="km-iconbtn"
              style={{ width: 28, height: 28, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}`, background: T.card, color: T.dim, textDecoration: 'none' }}
            >
              <ArrowRight size={14} strokeWidth={2} />
            </Link>
          )}
        </div>
      </td>
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
    return <td style={tdStyle} data-label="Latest Update"><span style={{ color: T.mute, fontStyle: 'italic', fontSize: 12.5 }}>No update yet</span></td>;
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

export function formatRelativeTime(iso: string): string {
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
