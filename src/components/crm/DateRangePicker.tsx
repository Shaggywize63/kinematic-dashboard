'use client';
import { useEffect, useState } from 'react';
import { useCrmDateRange, type DateRangePreset } from '../../stores/crmDateRangeStore';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'qtd', label: 'Quarter to date' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom…' },
];

function toInputDate(iso?: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

// Build a local-time ISO from a YYYY-MM-DD string + boundary kind. Using
// `new Date('YYYY-MM-DDTHH:mm:ss')` is fine on modern browsers (parsed as
// local), but older Safari treats it as UTC — that shifts the window by
// the user's offset (e.g. 5h30m in IST) and pushes most rows out of
// range, producing the "Custom date shows 0 results" bug. The explicit
// component constructor `new Date(y, m-1, d, …)` is unambiguous.
function buildIso(ymd: string, kind: 'start' | 'end'): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = kind === 'start'
    ? new Date(y, m - 1, d, 0, 0, 0, 0)
    : new Date(y, m - 1, d, 23, 59, 59, 999);
  return dt.toISOString();
}

export default function DateRangePicker() {
  const { preset, from, to, setPreset, setCustom } = useCrmDateRange();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(toInputDate(from));
  const [draftTo, setDraftTo] = useState(toInputDate(to));

  // Re-sync drafts with the current store window every time the picker
  // opens. Without this the drafts are frozen at mount-time values — so
  // a user who switched preset to "30d" and then re-opens the picker to
  // switch to Custom sees the OLD date strings as defaults, applies
  // them, and gets back an empty window.
  useEffect(() => {
    if (!open) return;
    setDraftFrom(toInputDate(from));
    setDraftTo(toInputDate(to));
  }, [open, from, to]);

  const apply = () => {
    if (!draftFrom || !draftTo) return;
    // Swap if the user picked them in reverse — otherwise from > to and
    // the backend filter returns zero rows.
    const [lo, hi] = draftFrom <= draftTo ? [draftFrom, draftTo] : [draftTo, draftFrom];
    const fromIso = buildIso(lo, 'start');
    const toIso = buildIso(hi, 'end');
    if (!fromIso || !toIso) return;
    setCustom(fromIso, toIso);
    setOpen(false);
  };

  const label = (() => {
    const found = PRESETS.find((p) => p.value === preset);
    if (preset === 'custom' && from && to) {
      return `${toInputDate(from)} → ${toInputDate(to)}`;
    }
    return found?.label ?? 'Date range';
  })();

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'var(--s3)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '8px 14px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14 }}>📅</span>
        {label}
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>▾</span>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: 'var(--s2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: 8,
            zIndex: 50,
            width: 220,
          }}
        >
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setPreset(p.value);
                if (p.value !== 'custom') setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: preset === p.value ? 'var(--s3)' : 'transparent',
                border: 'none',
                color: 'var(--text)',
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase' }}>From</div>
              <input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                style={inputCss}
              />
              <div style={{ fontSize: 10, color: 'var(--text-dim)', margin: '8px 0 4px', textTransform: 'uppercase' }}>To</div>
              <input
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                style={inputCss}
              />
              <button
                onClick={apply}
                disabled={!draftFrom || !draftTo}
                style={{
                  background: 'var(--primary)',
                  border: 'none',
                  color: '#fff',
                  padding: '7px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: '100%',
                  marginTop: 8,
                  opacity: !draftFrom || !draftTo ? 0.5 : 1,
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          aria-hidden
        />
      )}
    </div>
  );
}

const inputCss: React.CSSProperties = {
  background: 'var(--s3)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '6px 8px',
  borderRadius: 6,
  fontSize: 12,
  width: '100%',
};
