'use client';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { EmptyState, T } from '../../ui';
import LogoSpinner from '../../shared/LogoSpinner';

/**
 * Shared table chrome for the CRM list tables (leads / contacts / accounts /
 * deals). Header cells are mono eyebrows on the card surface with a hairline
 * below; body cells are 13.5px with the same hairline. Keep every list table
 * on these so the lists read as one family.
 */
export const thStyle: CSSProperties = {
  padding: '12px 14px', textAlign: 'left', whiteSpace: 'nowrap',
  fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute, fontWeight: 500,
  borderBottom: `1px solid ${T.border}`, background: T.card,
};

export const tdStyle: CSSProperties = {
  padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle',
};

/** Secondary line under a primary cell value (title, website, …). */
export const subStyle: CSSProperties = { fontSize: 12, color: T.dim, marginTop: 2 };

export type SortState = { key: string; order: 'asc' | 'desc' };

/**
 * Clickable, server-side-sort table header. The actual sorting happens on
 * the backend via onSort → parent refetch; this only renders the label and
 * the asc/desc/idle affordance. Non-sortable columns pass no onSort and get
 * a plain <th>.
 */
export function SortTh({ label, sortKey, sort, onSort, align = 'left', style }: {
  label: ReactNode;
  sortKey: string;
  sort?: SortState;
  onSort?: (key: string) => void;
  align?: 'left' | 'right';
  style?: CSSProperties;
}) {
  const th: CSSProperties = { ...thStyle, textAlign: align, ...style };
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

/** Full-width loading row for a list table. */
export function LoadingRow({ colSpan, label = 'Loading…' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} data-label="" style={{ ...tdStyle, borderBottom: 'none', padding: '40px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: T.dim, fontSize: 13 }}>
          <LogoSpinner size={18} />
          {label}
        </div>
      </td>
    </tr>
  );
}

/** Full-width empty row for a list table. */
export function EmptyRow({ colSpan, icon, title, description, action }: {
  colSpan: number; icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} data-label="" style={{ ...tdStyle, borderBottom: 'none', padding: 0 }}>
        <EmptyState icon={icon} title={title} description={description} action={action} />
      </td>
    </tr>
  );
}
