'use client';
import { X } from 'lucide-react';
import { Eyebrow, T } from '../../ui';

export interface QuickViewChip {
  id: string;
  label: string;
  title?: string;
  /** null/undefined = no count shown (still loading, or not countable). */
  count?: number | null;
  active: boolean;
  onClick: () => void;
  /** Present only on saved views — shows a remove (×) affordance. */
  onRemove?: () => void;
}

/**
 * One-tap list views ("Hot leads", "Gone quiet 7d+", your saved views).
 * Purely presentational — the page owns what each chip does to the filters.
 */
export default function LeadQuickViews({ chips }: { chips: QuickViewChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label="Views" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Eyebrow style={{ marginRight: 2 }}>Views</Eyebrow>
      {chips.map((c) => (
        <span key={c.id} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            aria-pressed={c.active}
            title={c.title}
            onClick={c.onClick}
            className="km-chip"
            style={{
              height: 28, padding: c.onRemove ? '0 26px 0 11px' : '0 11px', borderRadius: T.radius.pill, fontFamily: 'inherit',
              border: `1px ${c.onRemove && !c.active ? 'dashed' : 'solid'} ${c.active ? T.info : T.border}`,
              background: c.active ? T.infoWash : T.card, color: c.active ? T.text : T.dim,
              fontSize: 12.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {c.label}
            {c.count != null && (
              <span style={{ fontFamily: T.mono, fontSize: 11, color: c.active ? T.info : T.mute }}>{c.count.toLocaleString()}</span>
            )}
          </button>
          {c.onRemove && (
            <button
              type="button"
              aria-label={`Remove saved view ${c.label}`}
              title="Remove saved view"
              onClick={c.onRemove}
              className="km-iconbtn"
              style={{ position: 'absolute', right: 5, top: 5, width: 18, height: 18, padding: 0, border: 0, borderRadius: 999, background: 'transparent', color: T.mute, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
