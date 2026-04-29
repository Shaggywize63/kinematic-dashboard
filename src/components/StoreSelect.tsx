'use client';
import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

const C = {
  s3: 'var(--s3)',
  border: 'var(--border)',
  white: 'var(--text)',
  gray: 'var(--textSec)',
  grayd: 'var(--textTert)',
  blue: '#3E9EFF',
  red: '#E01E2C',
};

interface Store {
  id: string;
  name?: string;
  store_name?: string;
  outlet_name?: string;
  address?: string;
  city_name?: string;
  zone_name?: string;
}

interface Props {
  value: string;
  onChange: (id: string, label: string) => void;
  placeholder?: string;
}

/**
 * Searchable picker for registered stores/outlets.
 * Pulls from /api/v1/stores and lets managers pick by name instead of pasting UUIDs.
 */
export default function StoreSelect({ value, onChange, placeholder = 'Select store…' }: Props) {
  const [stores, setStores] = useState<Store[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Fetch stores once on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getStores()
      .then((res: any) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res)
          ? res
          : [];
        setStores(list);
      })
      .catch((e: any) => !cancelled && setError(e.message || 'Failed to load stores'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Click-outside to close
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);

  const labelOf = (s: Store) =>
    s.name || s.store_name || s.outlet_name || s.id.slice(0, 8) + '…';

  const subtitleOf = (s: Store) =>
    [s.city_name, s.zone_name].filter(Boolean).join(' · ') || s.address || '';

  const q = search.trim().toLowerCase();
  const filtered = q
    ? stores.filter((s) =>
        [labelOf(s), subtitleOf(s), s.id].some((field) =>
          field.toLowerCase().includes(q),
        ),
      )
    : stores;

  const selected = stores.find((s) => s.id === value);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: C.s3,
          border: `1px solid ${C.border}`,
          color: value ? C.white : C.grayd,
          borderRadius: 11,
          padding: '10px 13px',
          fontSize: 13,
          outline: 'none',
          fontFamily: "'DM Sans',sans-serif",
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? (
            <>
              <span style={{ fontWeight: 600 }}>{labelOf(selected)}</span>
              {subtitleOf(selected) && (
                <span style={{ color: C.gray, marginLeft: 6, fontSize: 11 }}>
                  · {subtitleOf(selected)}
                </span>
              )}
            </>
          ) : value ? (
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.gray }}>{value}</span>
          ) : (
            placeholder
          )}
        </div>
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.6 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            background: C.s3,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            zIndex: 100,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, city, or zone…"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: C.white,
                fontSize: 13,
                outline: 'none',
                fontFamily: "'DM Sans',sans-serif",
              }}
            />
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 14, fontSize: 12, color: C.gray, textAlign: 'center' }}>
                Loading stores…
              </div>
            ) : error ? (
              <div style={{ padding: 14, fontSize: 12, color: C.red, textAlign: 'center' }}>
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: C.gray, textAlign: 'center' }}>
                {q ? 'No stores match' : 'No registered stores'}
              </div>
            ) : (
              filtered.map((s) => {
                const isSelected = value === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      onChange(s.id, labelOf(s));
                      setOpen(false);
                      setSearch('');
                    }}
                    style={{
                      padding: '10px 14px',
                      fontSize: 13,
                      color: isSelected ? C.blue : C.white,
                      background: isSelected ? 'rgba(62,158,255,0.1)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(122,139,160,0.08)',
                    }}
                  >
                    <div style={{ fontWeight: isSelected ? 700 : 500 }}>{labelOf(s)}</div>
                    {subtitleOf(s) && (
                      <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
                        {subtitleOf(s)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div
            style={{
              padding: '6px 14px',
              borderTop: `1px solid ${C.border}`,
              fontSize: 10,
              color: C.gray,
              textAlign: 'center',
            }}
          >
            {stores.length} registered store{stores.length === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
}
