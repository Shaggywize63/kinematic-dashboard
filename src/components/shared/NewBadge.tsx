'use client';
import { useEffect, useState } from 'react';
import { isSectionNew } from '../../lib/whatsNew';

/**
 * A small "New" highlight for a nav section / card. Shows when the route has a
 * recent change the viewer hasn't opened (see lib/whatsNew). Self-gates after
 * mount to stay SSR-safe, and recomputes on every render so it clears the
 * moment the section is marked seen.
 *
 * `dot` renders a compact dot (for the collapsed sidebar / tight spots) instead
 * of the pill.
 */
/**
 * A dot shown on a nav GROUP when any route inside it is new.
 *
 * The default menu layout is the workspace switcher, which scopes the sidebar to one area — so a client sitting
 * in CRM never renders the Support items and never sees their `NewBadge`. Without this, "highlight it as new for
 * every client" only reaches the ones who happened to be in that workspace already.
 *
 * Same mount guard as NewBadge, so it is SSR-safe and clears as soon as the section is marked seen.
 */
export function GroupNewDot({ hrefs, style }: { hrefs: readonly string[]; style?: React.CSSProperties }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !hrefs.some((h) => isSectionNew(h))) return null;
  return (
    <span
      aria-label="New"
      title="Something new in here"
      style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', flexShrink: 0, ...style }}
    />
  );
}

export default function NewBadge({ href, dot = false, style }: { href: string; dot?: boolean; style?: React.CSSProperties }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !isSectionNew(href)) return null;

  if (dot) {
    return (
      <span
        aria-label="New"
        style={{
          position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%',
          background: '#16a34a', border: '2px solid var(--s2, #12161c)', ...style,
        }}
      />
    );
  }
  return (
    <span
      style={{
        marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
        color: '#fff', background: '#16a34a', borderRadius: 999, padding: '2px 7px', lineHeight: 1.4,
        flexShrink: 0, ...style,
      }}
    >New</span>
  );
}
