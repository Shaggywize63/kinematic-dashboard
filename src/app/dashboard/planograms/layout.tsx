'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import CityScopePicker from '../../../components/crm/CityScopePicker';
import { PC, useIsCompact } from './_components/planogramUi';

/**
 * Planogram module shell.
 *
 * The section navigation (Overview · Captures · Review queue · Planograms ·
 * Competitors · Insights) now lives in the MAIN dashboard sidebar under the
 * "Planogram" group, so this shell no longer renders its own left sub-nav.
 * It keeps only the top scope bar — the page title (derived from the
 * pathname), the city-scope picker and the "New planogram" action — and
 * renders {children} full-width beneath it.
 */

const BASE = '/dashboard/planograms';

type NavKey = 'overview' | 'captures' | 'review' | 'library' | 'competitors' | 'insights';

const TITLES: Record<NavKey, string> = {
  overview: 'Overview',
  captures: 'Captures',
  review: 'Review queue',
  library: 'Planograms',
  competitors: 'Competitors',
  insights: 'Insights',
};

/** UUID (or any non-reserved segment) directly under the base is the planogram
 *  editor, which belongs to the "Planograms" (library) section. */
function activeKey(pathname: string): NavKey {
  if (pathname === BASE || pathname === `${BASE}/`) return 'overview';
  const rest = pathname.slice(BASE.length);
  if (rest.startsWith('/captures')) return 'captures';
  if (rest.startsWith('/review')) return 'review';
  if (rest.startsWith('/competitors')) return 'competitors';
  if (rest.startsWith('/insights')) return 'insights';
  if (rest.startsWith('/library')) return 'library';
  // /new and /<id> (editor) both live under the Planograms section.
  return 'library';
}

export default function PlanogramModuleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || BASE;
  const isCompact = useIsCompact();
  const active = activeKey(pathname);
  const title = TITLES[active];

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {/* Top scope bar: page title + city scope + primary action. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-manrope)',
            fontSize: 20,
            fontWeight: 800,
            color: PC.text,
            margin: 0,
          }}
        >
          {title}
        </h1>
        <div
          style={{
            marginLeft: isCompact ? 0 : 'auto',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <CityScopePicker />
          <Link
            href={`${BASE}/new`}
            style={{
              background: PC.brand,
              color: '#fff',
              borderRadius: 9,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span aria-hidden style={{ fontSize: 15, lineHeight: 0 }}>+</span> New planogram
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
