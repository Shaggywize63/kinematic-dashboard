'use client';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronsUpDown, Handshake, Pencil, Trash2 } from 'lucide-react';
import type { Deal } from '../../types/crm';
import StageBadge from './shared/StageBadge';
import InlineOwnerAssign from './shared/InlineOwnerAssign';
import LogoSpinner from '../shared/LogoSpinner';
import { formatINR } from '../../lib/formatCurrency';
import { useAuth } from '../../hooks/useAuth';
import { isTataTiscanActive } from '../../lib/clientFeatures';
import type { FieldHelpers } from '../../lib/crmFieldOverrides';
import { Badge, Button, EmptyState, T, cardStyle, type Tone } from '../ui';

interface Props {
  deals: Deal[];
  loading?: boolean;
  onAssign?: (dealId: string, userId: string | null) => Promise<void>;
  onDelete?: (dealId: string) => void | Promise<void>;
  // Inline edit: open the edit modal for one deal straight from the list.
  onEdit?: (deal: Deal) => void;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  hiddenColumns?: Set<string>;
  viewMode?: 'table' | 'cards';
  // Server-side sort. `sort.key` is a real crm_deals column; `onSort(key)`
  // asks the parent to toggle/switch and refetch. Undefined = non-sortable UI.
  sort?: { key: string; order: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  /** Built-in field overrides (hide / relabel), the same rules as the deal forms. */
  fields?: FieldHelpers;
  /** What the empty state says: a filtered list that matches nothing reads differently from no deals at all. */
  filtered?: boolean;
  onClearFilters?: () => void;
}

// Table header cell — mono eyebrow per the design system.
const TH: React.CSSProperties = {
  padding: '12px 14px', textAlign: 'left', whiteSpace: 'nowrap',
  fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500,
  borderBottom: `1px solid ${T.border}`, background: T.card,
};
const TD: React.CSSProperties = { padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };

// Clickable, server-side-sort header. Sorting happens on the backend via
// onSort → parent refetch; this only renders label + asc/desc/idle arrow.
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
  return (
    <th style={th} aria-sort={active ? (sort!.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => onSort(sortKey)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(sortKey); } }}
        title="Sort"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', color: active ? T.text : 'inherit', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
      >
        {label}
        <span aria-hidden style={{ display: 'inline-flex', opacity: active ? 1 : 0.5 }}>
          {active ? (sort!.order === 'asc' ? <ArrowUp size={12} strokeWidth={1.8} /> : <ArrowDown size={12} strokeWidth={1.8} />) : <ChevronsUpDown size={12} strokeWidth={1.8} />}
        </span>
      </span>
    </th>
  );
}

export const DEAL_COLUMNS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'dealer', label: 'Dealer' },
  { key: 'amount', label: 'Amount' },
  { key: 'volume_kg', label: 'Volume (kg)' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'close_date', label: 'Close Date' },
  { key: 'owner', label: 'Owner' },
] as const;

/** The built-in deal field behind each list column, for the admin's hide / relabel overrides. */
const COLUMN_FIELD: Record<string, string> = { amount: 'amount', stage: 'stage_id', close_date: 'expected_close_date', owner: 'owner_id' };

// Cell value for the Volume (kg) column — reads the cached
// custom_fields.volume_kg the backend stamps on each deal row. Blank
// (not '—') when absent so non-tonnage tenants get a quiet column.
function volumeKgCell(d: Deal): string {
  const v = d.custom_fields?.volume_kg;
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-IN') : '';
}

const STATUS_TONE: Record<string, Tone> = { open: 'info', won: 'ok', lost: 'red' };

/** A deal's probability as a whole percent. The forms store a 0–1 fraction (60% is 0.6); a legacy whole-number value
 * (60) is read as a percent too, so neither shows as 6000% or 1%. */
function probabilityPct(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n > 1 ? n : n * 100);
}
const DAY = 86_400_000;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Days from today (local) to a YYYY-MM-DD / ISO date: negative is in the past. */
function daysFromToday(iso: string): number {
  const d = new Date(iso);
  const today = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / DAY);
}

/** The close-date cell: when a closed deal closed, or when an open one is due — with overdue / due-soon flagged. */
function CloseDateCell({ d }: { d: Deal }) {
  // For a won / lost deal, prefer actual_close_date (set by winDeal / loseDeal) so the column shows when the deal
  // actually closed, not when it was forecast. Open deals fall back to the forecast.
  const closedDeal = d.status === 'won' || d.status === 'lost';
  const date = closedDeal ? (d.actual_close_date as string | null | undefined) ?? d.expected_close_date : d.expected_close_date;
  if (!date) return <span style={{ color: T.mute }}>—</span>;
  if (closedDeal) return <span style={{ color: T.dim }}>{fmtDate(date)}</span>;
  const days = daysFromToday(date);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span style={{ color: days < 0 ? T.red : T.dim }}>{fmtDate(date)}</span>
      {days < 0 && <Badge tone="red" style={{ height: 18, fontSize: 11 }}>{-days} {-days === 1 ? 'day' : 'days'} overdue</Badge>}
      {days >= 0 && days <= 7 && <Badge tone="warn" style={{ height: 18, fontSize: 11 }}>{days === 0 ? 'Due today' : `Due in ${days} ${days === 1 ? 'day' : 'days'}`}</Badge>}
    </span>
  );
}

export default function DealsTable({
  deals, loading, onAssign, onDelete, onEdit, selected, onToggle, onToggleAll, hiddenColumns, viewMode = 'table', sort, onSort, fields, filtered, onClearFilters,
}: Props) {
  const td = TD;
  const th = TH;
  const showSelection = !!onToggle && !!selected;
  const showActions = !!onDelete || !!onEdit;
  const allSelected = showSelection && deals.length > 0 && deals.every((d) => selected!.has(d.id));
  // Dealer + Weight/Volume are steel-dealer (Tata / BMW / SRS) concepts. For
  // every other tenant (e.g. Kinematic) hide both columns entirely — the copy
  // below reads hidden.has('dealer') / hidden.has('volume_kg') in colcount,
  // header and cells. Do NOT surface these bespoke columns on the Kinematic
  // admin deals list.
  const { user } = useAuth();
  const steel = isTataTiscanActive(user as any);
  const hidden = new Set<string>(hiddenColumns ?? []);
  if (!steel) { hidden.add('volume_kg'); hidden.add('dealer'); }
  // A built-in field the admin hid on the deal forms is hidden here too.
  for (const [col, key] of Object.entries(COLUMN_FIELD)) if (fields?.isHidden(key)) hidden.add(col);
  const label = (col: string, key: string, def: string) => (fields ? fields.labelFor(key, def) : def);
  const nameHidden = !!fields?.isHidden('name');
  const accountHidden = !!fields?.isHidden('account_id');
  const probabilityHidden = !!fields?.isHidden('probability');
  const tableClass = `responsive-cards${viewMode === 'cards' ? ' cards-view' : ''}`;

  const cols = ['dealer', 'amount', 'volume_kg', 'stage', 'status', 'close_date', 'owner'].filter((c) => !hidden.has(c)).length;
  const colCount = (showSelection ? 1 : 0) + 1 + cols + (showActions ? 1 : 0);

  const num: React.CSSProperties = { ...td, fontFamily: T.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

  return (
    <div style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className={tableClass} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {showSelection && (
                <th style={{ ...th, width: 40 }}>
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all deals" style={{ width: 15, height: 15, margin: 0, display: 'block' }} />
                </th>
              )}
              <SortTh label={label('name', 'name', 'Name')} sortKey="name" sort={sort} onSort={onSort} thStyle={th} />
              {/* Dealer shows dealer_name (stamped, not a real column) → non-sortable. */}
              {!hidden.has('dealer')     && <th style={th}>Dealer</th>}
              {!hidden.has('amount')     && <SortTh label={label('amount', 'amount', 'Amount')} sortKey="amount" sort={sort} onSort={onSort} thStyle={th} align="right" />}
              {/* Volume lives inside the custom_fields jsonb → non-sortable. */}
              {!hidden.has('volume_kg')  && <th style={{ ...th, textAlign: 'right' }}>Volume (kg)</th>}
              {/* Stage renders via a join (crm_deal_stages.name); the deals row
                  has only stage_id (a UUID), so it's left non-sortable. */}
              {!hidden.has('stage')      && <th style={th}>{label('stage', 'stage_id', 'Stage')}</th>}
              {!hidden.has('status')     && <SortTh label="Status" sortKey="status" sort={sort} onSort={onSort} thStyle={th} />}
              {/* Close Date column → real column expected_close_date. */}
              {!hidden.has('close_date') && <SortTh label={label('close_date', 'expected_close_date', 'Close date')} sortKey="expected_close_date" sort={sort} onSort={onSort} thStyle={th} />}
              {/* Owner shows owner_name (stamped, not a real column) → non-sortable. */}
              {!hidden.has('owner')      && <th style={th}>{label('owner', 'owner_id', 'Owner')}</th>}
              {showActions               && <th style={{ ...th, textAlign: 'right' }}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading && deals.length === 0 && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', borderBottom: 0 }} data-label=""><div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><LogoSpinner size={38} label="Loading deals…" /></div></td></tr>}
            {!loading && deals.length === 0 && (
              <tr><td colSpan={colCount} style={{ ...td, padding: 0, borderBottom: 0 }} data-label="">
                {filtered ? (
                  <EmptyState icon={<Handshake size={18} strokeWidth={1.8} />} title="No deals match these filters"
                    description="Try another status, pipeline or search, or widen the date range in the header."
                    action={onClearFilters ? <Button size="sm" onClick={onClearFilters}>Clear filters</Button> : undefined} />
                ) : (
                  <EmptyState icon={<Handshake size={18} strokeWidth={1.8} />} title="No deals yet"
                    description="Deals are created from a lead's Convert action, so each one keeps the lead's qualification, source and history." />
                )}
              </td></tr>
            )}
            {deals.map((d) => (
              <tr key={d.id} className="km-row" style={loading ? { opacity: 0.55 } : undefined}>
                {showSelection && (
                  <td style={td} data-label="">
                    <input type="checkbox" checked={selected!.has(d.id)} onChange={() => onToggle!(d.id)} aria-label={`Select ${d.name}`} style={{ width: 15, height: 15, margin: 0, display: 'block' }} />
                  </td>
                )}
                <td style={{ ...td, minWidth: 200 }} data-label={label('name', 'name', 'Name')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <Link href={`/dashboard/crm/deals/${d.id}`} className="km-entity-link" title="Open deal detail" style={{ fontWeight: 600 }}>
                      {nameHidden ? (d.account_name || 'Open deal') : d.name}
                    </Link>
                    {/* Always-visible inline-edit pencil so editing is
                        discoverable without scrolling to the Action column. */}
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(d)}
                        title="Edit this deal"
                        aria-label="Edit deal"
                        className="km-iconbtn"
                        style={{ background: 'transparent', border: '1px solid transparent', padding: 0, width: 22, height: 22, borderRadius: 5, cursor: 'pointer', color: T.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      >
                        <Pencil size={13} strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                  {!accountHidden && !nameHidden && d.account_name && (
                    <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
                      {d.account_id ? <Link href={`/dashboard/crm/accounts/${d.account_id}`} style={{ color: 'inherit' }} title="Open account">{d.account_name}</Link> : d.account_name}
                    </div>
                  )}
                  {/* Spark & Ray: the quotation number (only Spark deal rows carry one). */}
                  {d.quotation_no && <div data-testid="deal-quotation-no" style={{ fontSize: 11.5, color: T.info, fontFamily: T.mono, marginTop: 2 }}>Quotation {d.quotation_no}</div>}
                </td>
                {!hidden.has('dealer')     && <td style={{ ...td, color: d.dealer_name ? T.text : T.mute }} data-label="Dealer">{d.dealer_name ?? '—'}</td>}
                {!hidden.has('amount')     && <td style={{ ...num, textAlign: 'right', fontWeight: 600 }} data-label={label('amount', 'amount', 'Amount')}>{formatINR(d.amount)}</td>}
                {!hidden.has('volume_kg')  && <td style={{ ...num, textAlign: 'right' }} data-label="Volume (kg)">{volumeKgCell(d)}</td>}
                {!hidden.has('stage')      && (
                  <td style={td} data-label={label('stage', 'stage_id', 'Stage')}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                      <StageBadge name={d.stage_name} won={d.status === 'won'} lost={d.status === 'lost'} />
                      {d.status === 'open' && !probabilityHidden && probabilityPct(d.probability) != null && (
                        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }} title={fields ? fields.labelFor('probability', 'Probability') : 'Probability'}>{probabilityPct(d.probability)}% likely</span>
                      )}
                    </div>
                  </td>
                )}
                {!hidden.has('status')     && <td style={td} data-label="Status"><Badge tone={STATUS_TONE[d.status] ?? 'neutral'} dot style={{ textTransform: 'capitalize' }}>{d.status}</Badge></td>}
                {!hidden.has('close_date') && (
                  <td style={{ ...num, fontFamily: 'inherit' }} data-label={label('close_date', 'expected_close_date', 'Close date')}><CloseDateCell d={d} /></td>
                )}
                {!hidden.has('owner') && (
                  <td style={td} data-label={label('owner', 'owner_id', 'Owner')}>
                    {onAssign ? (
                      <InlineOwnerAssign
                        currentOwnerId={d.owner_id}
                        currentOwnerName={d.owner_name}
                        onAssign={(uid) => onAssign(d.id, uid)}
                        recordLabel={d.name}
                      />
                    ) : (
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: d.owner_name ? T.text : T.mute }}>{d.owner_name || 'Unassigned'}</span>
                    )}
                  </td>
                )}
                {showActions && (
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} data-label="">
                    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                      {/* Inline edit — opens the edit modal in place so a rep
                          can fix one deal without leaving the list. */}
                      {onEdit && (
                        <Button size="sm" variant="ghost" onClick={() => onEdit(d)} title="Edit this deal" aria-label={`Edit ${d.name}`} icon={<Pencil size={14} strokeWidth={1.8} />}>Edit</Button>
                      )}
                      {onDelete && (
                        <Button size="sm" variant="ghost" onClick={() => onDelete(d.id)} title="Delete this deal" aria-label={`Delete ${d.name}`} icon={<Trash2 size={14} strokeWidth={1.8} />} style={{ color: T.red }}>Delete</Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
