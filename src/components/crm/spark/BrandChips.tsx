'use client';
import type { CSSProperties } from 'react';
import { arr } from '../../../lib/sparkAccounts';
import { T } from '../../ui';

/** Small pills with the brands used on a deal's product lines (a brand is not a make). Renders nothing when empty. */
export function BrandChips({ brands, style }: { brands?: string[] | null; style?: CSSProperties }) {
  const list = Array.from(new Set(arr<unknown>(brands).filter((b): b is string => typeof b === 'string' && b.trim() !== '')));
  if (list.length === 0) return null;
  return (
    <div data-testid="deal-brands" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, ...style }}>
      {list.map((b) => (
        <span key={b} data-testid="deal-brand-chip" style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: 'var(--s4)', color: T.text, border: `1px solid ${T.border}` }}>{b}</span>
      ))}
    </div>
  );
}
