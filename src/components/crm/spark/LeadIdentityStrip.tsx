'use client';
import { useEffect, useState } from 'react';
import { T } from '../../ui';
import { leadIdentitySlots, missingSlots, structureCompleteness, type IdentitySlot, type LeadIdentitySource } from '../../../lib/leadStructure';

/**
 * The lead IDENTITY STRIP — the chain from the proposal mail, rendered as labelled cards:
 *
 *   ACCOUNT › PLANT › DEPARTMENT › CONTACT › REQUIREMENT › SERIAL › OWNER
 *
 * Two variants, same component so the two never drift apart:
 *
 *  - `detail` — on an existing lead. Red-accented: this is the lead's identity, and a blank
 *    link is a look-alike waiting to happen.
 *  - `form`   — on the create form. Green-accented, and it fills in live as the rep types, so
 *    they can watch the identity assemble itself instead of being told off at submit.
 *
 * An empty slot always renders — as a dashed placeholder carrying its caption — because a gap
 * you can see is a gap that gets filled. That is also why this is not conditional on being
 * complete.
 */

export type IdentityStripVariant = 'detail' | 'form';

const ACCENT: Record<IdentityStripVariant, { line: string; wash: string; title: string }> = {
  detail: { line: T.red, wash: 'color-mix(in srgb, var(--red) 4%, transparent)', title: 'Every opportunity carries a recognizable identity — no more look-alikes' },
  form: { line: T.ok, wash: 'color-mix(in srgb, var(--ok) 5%, transparent)', title: 'Lead identity — builds itself as you fill the form' },
};

function Slot({ slot, accent }: { slot: IdentitySlot; accent: string }) {
  const filled = !!slot.value;
  return (
    <div
      data-testid={`identity-slot-${slot.key}`}
      data-filled={filled ? 'yes' : 'no'}
      title={filled ? `${slot.label}: ${slot.value}` : `${slot.label} — ${slot.fix}. ${slot.why}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flexShrink: 0,
        padding: '5px 11px', borderRadius: 8,
        border: filled ? `1px solid ${T.border}` : `1px dashed color-mix(in srgb, ${accent} 45%, transparent)`,
        background: filled ? T.card : 'transparent',
      }}
    >
      <span style={{
        fontFamily: T.mono, fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase',
        color: filled ? T.mute : accent, fontWeight: 600, whiteSpace: 'nowrap',
      }}>{slot.label}</span>
      <span data-testid={`identity-value-${slot.key}`} style={{
        fontSize: 13, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180,
        color: filled ? T.text : accent, opacity: filled ? 1 : 0.8,
      }}>{filled ? slot.value : 'Not set'}</span>
    </div>
  );
}

export default function LeadIdentityStrip({
  source, variant = 'detail', showHeading = true, style,
}: {
  source: LeadIdentitySource;
  variant?: IdentityStripVariant;
  /** Set false to render just the cards (e.g. inside a header that already has a title). */
  showHeading?: boolean;
  style?: React.CSSProperties;
}) {
  // Client-only. Whether this strip renders at all depends on the active client scope, which
  // is read from localStorage — so the server renders nothing here and the first client render
  // must match that, or React tears the tree down with a hydration error. Mounting first and
  // rendering second keeps both passes agreeing.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const slots = leadIdentitySlots(source);
  const accent = ACCENT[variant];
  const { filled, total } = structureCompleteness(slots);
  const gaps = missingSlots(slots);

  // The owner reads as the outcome of the chain rather than another link in it, so it is
  // tinted and sits after a wider gap — matching the mail's layout.
  const chain = slots.filter((s) => s.key !== 'owner');
  const owner = slots.find((s) => s.key === 'owner');

  if (!mounted) return null;

  return (
    <section
      data-testid="lead-identity-strip"
      data-variant={variant}
      data-complete={gaps.length === 0 ? 'yes' : 'no'}
      aria-label="Lead identity"
      style={{
        border: `1px dashed color-mix(in srgb, ${accent.line} 40%, transparent)`,
        background: accent.wash, borderRadius: 12, padding: '10px 12px', minWidth: 0, ...style,
      }}
    >
      {showHeading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
          {variant === 'form' && <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: accent.line, flexShrink: 0 }} />}
          <span style={{
            fontFamily: T.mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            fontWeight: 700, color: accent.line,
          }}>{accent.title}</span>
          <span data-testid="identity-progress" style={{ fontSize: 11, fontWeight: 600, color: T.mute, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {filled} of {total}
          </span>
        </div>
      )}

      {/* Horizontal scroll rather than wrapping: the chain reads left-to-right, and a wrapped
          chain loses that. The gutter keeps the last card reachable on a phone. */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto', paddingBottom: 2, minWidth: 0 }}>
        {chain.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 0 }}>
            {i > 0 && <span aria-hidden style={{ color: T.mute, fontSize: 12, flexShrink: 0 }}>›</span>}
            <Slot slot={s} accent={accent.line} />
          </div>
        ))}
        {owner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4, flexShrink: 0 }}>
            <span aria-hidden style={{ color: T.mute, fontSize: 12 }}>›</span>
            <div style={{ borderRadius: 8, background: owner.value ? 'color-mix(in srgb, var(--ok) 12%, transparent)' : 'transparent' }}>
              <Slot slot={owner} accent={owner.value ? T.ok : accent.line} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
