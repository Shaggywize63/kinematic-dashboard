'use client';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination } from '../../../lib/crmApi';
import { IconButton, Select, T } from '../../ui';

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

/** Pager for a server-paginated CRM list (deals, accounts): rows per page, the visible range of the total, first / prev / next / last. */
export default function ServerPaginationBar({
  pagination, pageSize, onPageChange, onPageSizeChange, loading, noun = 'results',
}: {
  pagination: Pagination | null;
  pageSize: number;
  onPageChange: (n: number) => void;
  onPageSizeChange: (n: number) => void;
  loading: boolean;
  noun?: string;
}) {
  const p = pagination;
  const totalPages = p?.totalPages ?? 1;
  const currentPage = p?.page ?? 1;
  const total = p?.total ?? 0;
  const limit = p?.limit ?? pageSize;
  const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const end = Math.min(currentPage * limit, total);
  const disabled = loading || !p;
  const canPrev = !!p?.hasPrev && !disabled;
  const canNext = !!p?.hasNext && !disabled;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: -8, padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: T.dim }}>
        <span>Rows per page</span>
        <div style={{ width: 84 }}>
          <Select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} disabled={disabled} aria-label="Rows per page"
            style={{ height: 30, fontSize: 12.5, padding: '0 8px', paddingRight: 28 }}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.mute, fontVariantNumeric: 'tabular-nums' }} data-testid="pager-range">
          {total === 0 ? `No ${noun}` : `${start.toLocaleString('en-IN')}–${end.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton label="First page" onClick={() => onPageChange(1)} disabled={!canPrev}><ChevronFirst size={16} strokeWidth={1.6} /></IconButton>
        <IconButton label="Previous page" onClick={() => onPageChange(currentPage - 1)} disabled={!canPrev}><ChevronLeft size={16} strokeWidth={1.6} /></IconButton>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.dim, padding: '0 10px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{currentPage} / {totalPages}</span>
        <IconButton label="Next page" onClick={() => onPageChange(currentPage + 1)} disabled={!canNext}><ChevronRight size={16} strokeWidth={1.6} /></IconButton>
        <IconButton label="Last page" onClick={() => onPageChange(totalPages)} disabled={!canNext}><ChevronLast size={16} strokeWidth={1.6} /></IconButton>
      </div>
    </div>
  );
}
