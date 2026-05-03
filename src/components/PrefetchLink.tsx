'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

/**
 * <PrefetchLink href={...} prefetch={() => api.getX(id)}>
 *
 * On hover (after a tiny debounce) and on focus, fires the supplied API call
 * so its response is sat in the in-memory + SWR cache by the time the user
 * actually clicks. Combined with Next.js's own route prefetch, the detail
 * page renders against cached data — feels instant.
 *
 * Safe: the prefetch fires once per element instance (`fired` ref), errors
 * are swallowed, and Next's own router.prefetch is also called.
 */
export default function PrefetchLink({
  href,
  prefetch,
  children,
  className,
  style,
  hoverDelay = 80,
}: {
  href: string;
  prefetch?: () => Promise<unknown> | void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  hoverDelay?: number;
}) {
  const router = useRouter();
  const fired = useRef(false);
  const timer = useRef<number | null>(null);

  const fire = () => {
    if (fired.current) return;
    fired.current = true;
    try { router.prefetch?.(href); } catch {}
    if (prefetch) {
      try { Promise.resolve(prefetch()).catch(() => {}); } catch {}
    }
  };

  const onEnter = () => {
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      fire();
    }, hoverDelay);
  };
  const onLeave = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <Link
      href={href}
      className={className}
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={fire}
      onTouchStart={fire}
    >
      {children}
    </Link>
  );
}
