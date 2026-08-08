'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import CityScopePicker from '../../../components/crm/CityScopePicker';
import { PC, useIsCompact } from './_components/planogramUi';

/**
 * Planogram module shell — the redesigned "Shelf IQ" navigation.
 *
 * Wraps every /dashboard/planograms/* page with a left sub-nav (Overview ·
 * Captures · Review queue · Planograms · Competitors · Insights) and a top
 * scope bar (page title + city scope picker + primary action). Active item is
 * derived from the pathname. On compact widths the sub-nav becomes a
 * horizontal scrolling strip, mirroring the approved prototype.
 */

const BASE = '/dashboard/planograms';

type NavKey = 'overview' | 'captures' | 'review' | 'library' | 'competitors' | 'insights';

interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: string;
  section: 'main' | 'setup';
}

const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', href: BASE, icon: '◱', section: 'main' },
  { key: 'captures', label: 'Captures', href: `${BASE}/captures`, icon: '▤', section: 'main' },
  { key: 'review', label: 'Review queue', href: `${BASE}/review`, icon: '◷', section: 'main' },
  { key: 'library', label: 'Planograms', href: `${BASE}/library`, icon: '▦', section: 'setup' },
  { key: 'competitors', label: 'Competitors', href: `${BASE}/competitors`, icon: '⚑', section: 'setup' },
  { key: 'insights', label: 'Insights', href: `${BASE}/insights`, icon: '↗', section: 'setup' },
];

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

  const nav = (
    <nav
      aria-label="Planogram sections"
      style={{
        display: 'flex',
        flexDirection: isCompact ? 'row' : 'column',
        gap: 4,
        overflowX: isCompact ? 'auto' : 'visible',
        paddingBottom: isCompact ? 4 : 0,
      }}
    >
      {NAV.map((item, i) => {
        const prev = NAV[i - 1];
        const showSectionLabel = !isCompact && item.section === 'setup' && (!prev || prev.section !== 'setup');
        return (
          <div key={item.key} style={{ display: 'contents' }}>
            {showSectionLabel && (
              <div
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: PC.muted,
                  fontWeight: 700,
                  padding: '12px 11px 5px',
                }}
              >
                Setup
              </div>
            )}
            <NavLink item={item} active={item.key === active} isCompact={isCompact} />
          </div>
        );
      })}
    </nav>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isCompact ? 'column' : 'row',
        gap: isCompact ? 14 : 22,
        alignItems: 'flex-start',
      }}
    >
      {/* Left sub-nav */}
      <aside
        style={{
          width: isCompact ? '100%' : 208,
          flexShrink: 0,
          position: isCompact ? 'static' : 'sticky',
          top: 16,
          alignSelf: 'stretch',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 10px 12px' }}>
          <span
            aria-hidden
            style={{
              display: 'inline-grid',
              gridTemplateColumns: 'repeat(3, 6px)',
              gap: 3,
            }}
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <i
                key={n}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: n < 3 ? PC.brand : PC.text,
                  opacity: n < 3 ? 1 : 0.85,
                  display: 'block',
                }}
              />
            ))}
          </span>
          <span>
            <span
              style={{
                fontFamily: 'var(--font-manrope)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                fontSize: 15,
                color: PC.text,
                display: 'block',
                lineHeight: 1.1,
              }}
            >
              Shelf IQ
            </span>
            <span
              style={{
                fontSize: 9.5,
                color: PC.muted,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              Planogram
            </span>
          </span>
        </div>
        {nav}
      </aside>

      {/* Main column */}
      <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
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
    </div>
  );
}

function NavLink({ item, active, isCompact }: { item: NavItem; active: boolean; isCompact: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 11px',
        borderRadius: 9,
        fontSize: 13.5,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        color: active ? PC.brand : PC.muted,
        background: active ? PC.brandWash : 'transparent',
        flexShrink: 0,
      }}
    >
      <span aria-hidden style={{ width: 18, textAlign: 'center', fontSize: 15, opacity: 0.9 }}>
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}
