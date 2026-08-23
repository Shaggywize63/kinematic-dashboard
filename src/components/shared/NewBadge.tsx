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
