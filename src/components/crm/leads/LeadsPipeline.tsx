'use client';
import { T, useIsCompact } from '../../ui';

export interface PipelineTab {
  /** Status value this tab filters to; null = "All". */
  value: string | null;
  label: string;
  /** null while the count is still loading. */
  count: number | null;
  color: string;
}

/**
 * Pipeline strip — one card per lead status with a live count and its share of
 * the current result set. Doubles as the status filter: tapping a card narrows
 * the list to that status, tapping it again (or "All") clears it. The counts
 * honour every OTHER active filter, so the cards always add up to "All".
 */
export default function LeadsPipeline({ tabs, active, allActive, onSelect }: {
  tabs: PipelineTab[];
  /** Status value currently filtered to, or null when none / several are selected. */
  active: string | null;
  /** No status filter is applied, so "All" is the highlighted card. */
  allActive: boolean;
  onSelect: (value: string | null) => void;
}) {
  // Phones / tablets — or a client with a long custom status list — scroll the strip instead of squeezing the cards.
  const narrow = useIsCompact(900) || tabs.length > 7;
  const all = tabs.find((t) => t.value === null)?.count ?? null;

  return (
    <div
      role="group"
      aria-label="Pipeline"
      style={narrow
        ? { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x proximity', margin: '0 -2px' }
        : { display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, gap: 10 }}
    >
      {tabs.map((t) => {
        const on = t.value === null ? allActive : t.value === active;
        const share = all && t.count != null && t.value !== null ? Math.round((t.count / all) * 1000) / 10 : null;
        return (
          <button
            key={t.value ?? '__all'}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on && t.value !== null ? null : t.value)}
            className="km-pipe"
            style={{
              position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              flex: narrow ? '0 0 148px' : undefined, scrollSnapAlign: 'start',
              padding: '12px 14px 14px', borderRadius: T.radius.lg, minWidth: 0,
              border: `1px solid ${on ? T.info : T.border}`,
              background: on ? T.infoWash : T.card,
              boxShadow: on ? `0 0 0 3px ${T.ring}` : 'none',
              color: T.text,
              transition: 'border-color .12s ease, background .12s ease, box-shadow .12s ease',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: on ? T.text : T.dim, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.value !== null && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: t.color, flexShrink: 0 }} />}
              {t.label}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontFamily: T.heading, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                {t.count == null ? <span style={{ color: T.mute }}>—</span> : t.count.toLocaleString()}
              </span>
              {share != null && (
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>{share}%</span>
              )}
            </span>
            {/* Share-of-total bar. "All" draws a full bar in the info colour. */}
            <span aria-hidden style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${t.value === null ? 100 : Math.min(100, share ?? 0)}%`, background: t.value === null ? T.info : t.color, opacity: on ? 1 : 0.85, transition: 'width .3s ease' }} />
          </button>
        );
      })}
    </div>
  );
}
