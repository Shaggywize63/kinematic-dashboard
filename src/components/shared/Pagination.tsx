'use client';
import React, { useEffect, useMemo, useState } from 'react';

/**
 * Shared list pagination for the dashboard.
 *
 * Most dashboard lists fetch their full result set into state and render it
 * with `.map`. `usePagination(items)` slices that array to the current page
 * and hands back a ready-to-render <PaginationBar/> — default 50 rows/page
 * with a size selector (25 / 50 / 100 / 200 / All), matching the look the
 * leads / deals / activities pages already ship.
 *
 *   const { pageItems, bar } = usePagination(filteredRows);
 *   // render pageItems instead of filteredRows, then drop {bar} below the list
 *
 * The three big CRM lists (leads, deals, activities) keep their own
 * server-side bars (they page on the backend); everything else uses this.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;
// Sentinel page size meaning "show everything".
export const ALL_PAGE_SIZE = Number.MAX_SAFE_INTEGER;

export function usePagination<T>(items: T[], opts?: { pageSize?: number }) {
  const [pageSize, setPageSizeState] = useState<number>(opts?.pageSize ?? DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = pageSize >= ALL_PAGE_SIZE ? 1 : Math.max(1, Math.ceil(total / pageSize));

  // Clamp the page when the data set shrinks (search/filter) or the size grows,
  // so we never sit on an empty page past the end.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    if (pageSize >= ALL_PAGE_SIZE) return items;
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const setPageSize = (n: number) => { setPageSizeState(n); setPage(1); };

  const bar = (
    <PaginationBar
      total={total}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />
  );

  return { pageItems, page, setPage, pageSize, setPageSize, total, totalPages, bar };
}

/**
 * Presentational pagination bar. Can also be driven by server-side pagination
 * (pass the backend total + current page); `usePagination` wires it for the
 * common client-side case.
 */
export function PaginationBar({
  total, page, pageSize, onPageChange, onPageSizeChange, loading = false, showAll = true,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (n: number) => void;
  onPageSizeChange: (n: number) => void;
  loading?: boolean;
  showAll?: boolean;
}) {
  const isAll = pageSize >= ALL_PAGE_SIZE;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : isAll ? 1 : (currentPage - 1) * pageSize + 1;
  const end = isAll ? total : Math.min(currentPage * pageSize, total);

  const canPrev = currentPage > 1 && !loading;
  const canNext = currentPage < totalPages && !loading;

  const btn = (active: boolean): React.CSSProperties => ({
    background: 'var(--s3)', border: '1px solid var(--border)', color: active ? 'var(--text)' : 'var(--text-dim)',
    padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: active ? 'pointer' : 'not-allowed', opacity: active ? 1 : 0.5, minWidth: 32,
  });

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 14, padding: '10px 14px', background: 'var(--s2)',
      border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-dim)' }}>
        <span>Rows per page:</span>
        <select
          value={isAll ? 'all' : pageSize}
          onChange={(e) => onPageSizeChange(e.target.value === 'all' ? ALL_PAGE_SIZE : Number(e.target.value))}
          disabled={loading}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}
        >
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          {showAll && <option value="all">All</option>}
        </select>
        <span>
          {total === 0 ? 'No results' : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => onPageChange(1)} disabled={!canPrev} style={btn(canPrev)} title="First page">«</button>
        <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={!canPrev} style={btn(canPrev)} title="Previous page">‹</button>
        <span style={{ fontSize: 12, color: 'var(--text)', padding: '0 8px' }}>
          Page <strong>{currentPage}</strong> of {totalPages}
        </span>
        <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={!canNext} style={btn(canNext)} title="Next page">›</button>
        <button type="button" onClick={() => onPageChange(totalPages)} disabled={!canNext} style={btn(canNext)} title="Last page">»</button>
      </div>
    </div>
  );
}
