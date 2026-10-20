'use client';
import { X } from 'lucide-react';
import { T } from '../../ui';
import type { LeadFiltersValue } from '../LeadFilters';

export interface AppliedChip {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

/**
 * Applied-filter chips — what is narrowing the list right now, each removable.
 * Built from the page's filter state so a view chip, the drawer and the AI
 * smart filter all show up (and clear) the same way.
 */
export function buildAppliedChips(args: {
  filters: LeadFiltersValue;
  onChange: (next: LeadFiltersValue) => void;
  statusLabel: (value: string) => string;
  sourceName: (id: string) => string;
  ownerName: (id: string) => string;
  /** Owner filter is hidden for this viewer — never surface a stale value. */
  showOwner: boolean;
}): AppliedChip[] {
  const { filters: f, onChange, statusLabel, sourceName, ownerName, showOwner } = args;
  const set = (patch: Partial<LeadFiltersValue>) => onChange({ ...f, ...patch });
  const chips: AppliedChip[] = [];
  if (f.status?.length) chips.push({ key: 'status', label: 'Status', value: f.status.map(statusLabel).join(', '), onRemove: () => set({ status: undefined }) });
  if (f.grade) chips.push({ key: 'grade', label: 'Grade', value: f.grade, onRemove: () => set({ grade: undefined }) });
  if (f.source) chips.push({ key: 'source', label: 'Source', value: sourceName(f.source), onRemove: () => set({ source: undefined }) });
  if (f.owner && showOwner) chips.push({ key: 'owner', label: 'Owner', value: ownerName(f.owner), onRemove: () => set({ owner: undefined }) });
  if (f.unassigned && showOwner) chips.push({ key: 'unassigned', label: 'Owner', value: 'Unassigned', onRemove: () => set({ unassigned: undefined }) });
  if (f.followupDue) chips.push({ key: 'followup', label: 'Follow-up', value: 'due or overdue', onRemove: () => set({ followupDue: undefined }) });
  const loc = [f.block, f.district, f.city, f.state].filter(Boolean).join(' › ');
  if (loc) chips.push({ key: 'loc', label: 'Location', value: loc, onRemove: () => set({ state: undefined, city: undefined, district: undefined, block: undefined }) });
  if (f.quietDays) chips.push({ key: 'quiet', label: 'Quiet', value: `${f.quietDays}d+`, onRemove: () => set({ quietDays: undefined }) });
  if (f.addedDays) chips.push({ key: 'added', label: 'Added', value: `last ${f.addedDays} days`, onRemove: () => set({ addedDays: undefined }) });
  return chips;
}

export default function LeadFilterChips({ chips, onClearAll }: { chips: AppliedChip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div role="list" aria-label="Applied filters" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {chips.map((c) => (
        <span
          key={c.key}
          role="listitem"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 6px 0 11px', borderRadius: T.radius.pill, border: `1px solid ${T.border}`, background: 'var(--s3)', fontSize: 12.5, color: T.text, maxWidth: '100%' }}
        >
          <span style={{ color: T.dim }}>{c.label}</span>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{c.value}</span>
          <button
            type="button"
            aria-label={`Remove ${c.label} filter`}
            onClick={c.onRemove}
            className="km-iconbtn"
            style={{ width: 18, height: 18, padding: 0, border: 0, borderRadius: 999, background: 'transparent', color: T.mute, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={12} strokeWidth={2} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        style={{ background: 'transparent', border: 0, padding: '0 4px', color: T.red, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Clear all
      </button>
    </div>
  );
}
