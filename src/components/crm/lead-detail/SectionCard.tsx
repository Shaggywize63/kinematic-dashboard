'use client';
import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, T } from '../../ui';
import { InlineIcon } from '../../ui/PageIcon';

/** A titled card — the detail page's section surface. */
export default function SectionCard({
  title, count, aside, children, padding = 18, accent, icon,
}: {
  title: ReactNode;
  /** A dim icon before the title. */
  icon?: LucideIcon;
  count?: number;
  aside?: ReactNode;
  children: ReactNode;
  padding?: number;
  /** Colour of a thin left edge, to flag a card that needs attention. */
  accent?: string;
}) {
  const titleId = useId();
  return (
    <Card padding={0} style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}>
      <section aria-labelledby={titleId}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
          <h2 id={titleId} style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>
            {icon && <InlineIcon icon={icon} size={16} style={{ color: T.dim, alignSelf: 'center' }} />}
            {title}
            {typeof count === 'number' && <span style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 500, color: T.mute }}>{count}</span>}
          </h2>
          {aside}
        </div>
        <div style={{ padding }}>{children}</div>
      </section>
    </Card>
  );
}
