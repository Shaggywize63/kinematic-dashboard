'use client';
// The icon tile beside a page title, and the small tinted tile used by stat cards. A page's icon is the one its sidebar
// entry draws (lib/routeIcons.ts), so a page and its menu item always match; pass `name` to override it.

import type { CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { NavIcon, type NavIconName } from './icons';
import { iconNameForPath } from '../../lib/routeIcons';
import { ICON_SIZE, ICON_STROKE } from '../../lib/labelIcons';

/** The brand-tinted square for a page title. Renders nothing when the page has no icon. */
export function PageIcon({ name, size = 36, style }: { name?: NavIconName | null; size?: number; style?: CSSProperties }) {
  const pathname = usePathname();
  const icon = name === undefined ? iconNameForPath(pathname) : name;
  if (!icon) return null;
  return (
    <span aria-hidden data-testid="page-icon" data-icon={icon} className="km-lz" style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'color-mix(in srgb, var(--primary) 11%, transparent)', color: 'var(--primary)', ['--tint' as string]: 'var(--primary)', ...style,
    }}>
      <NavIcon name={icon} size={ICON_SIZE.page} strokeWidth={1.9} />
    </span>
  );
}

export type IconTone = 'neutral' | 'brand' | 'info' | 'ok' | 'warn' | 'red';
const TONES: Record<IconTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--s3)', fg: 'var(--dim)' },
  brand: { bg: 'color-mix(in srgb, var(--primary) 11%, transparent)', fg: 'var(--primary)' },
  info: { bg: 'var(--info-w)', fg: 'var(--info)' },
  ok: { bg: 'var(--ok-w)', fg: 'var(--ok)' },
  warn: { bg: 'var(--warn-w)', fg: 'var(--warn)' },
  red: { bg: 'var(--red-w)', fg: 'var(--red)' },
};

/** A small tinted square holding an icon: stat cards, list rows, section titles. */
export function IconTile({ icon: Icon, tone = 'neutral', size = 28, iconSize = ICON_SIZE.stat, style }: {
  icon: LucideIcon; tone?: IconTone; size?: number; iconSize?: number; style?: CSSProperties;
}) {
  const t = TONES[tone];
  return (
    <span aria-hidden className="km-lz" style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: t.bg, color: t.fg, ['--tint' as string]: t.fg, ...style,
    }}>
      <Icon size={iconSize} strokeWidth={ICON_STROKE} />
    </span>
  );
}

/** An inline icon for text and hand-styled buttons, at the shared size and stroke. */
export function InlineIcon({ icon: Icon, size = ICON_SIZE.button, style }: { icon: LucideIcon; size?: number; style?: CSSProperties }) {
  return <Icon aria-hidden size={size} strokeWidth={ICON_STROKE} style={{ flexShrink: 0, ...style }} />;
}
