'use client';
import Link from 'next/link';
import { Fragment } from 'react';

/**
 * Compact breadcrumbs for CRM detail pages.
 *
 * Pass an ordered list of crumbs — the last one (current page) is
 * rendered as plain text; everything before it is a link back up the
 * hierarchy. Built specifically for the lead / deal / contact /
 * account / activity detail pages but generic enough to drop anywhere.
 *
 * Example usage on a lead detail page:
 *
 *   <Breadcrumbs items={[
 *     { label: 'CRM', href: '/dashboard/crm/dashboard' },
 *     { label: 'Leads', href: '/dashboard/crm/leads' },
 *     { label: lead.full_name || lead.first_name },
 *   ]} />
 *
 * The component is intentionally style-light so it inherits the page
 * theme via the global CRM area CSS.
 */
export type Crumb = { label: string; href?: string };

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items?.length) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        fontSize: 12, color: 'var(--text-dim)', marginBottom: 12,
      }}
    >
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={`${c.label}-${i}`}>
            {!isLast && c.href ? (
              <Link
                href={c.href}
                style={{
                  color: 'var(--text-dim)', textDecoration: 'none',
                  padding: '2px 6px', borderRadius: 4,
                }}
                className="km-clickable"
              >
                {c.label}
              </Link>
            ) : (
              <span style={{
                color: isLast ? 'var(--text)' : 'var(--text-dim)',
                fontWeight: isLast ? 700 : 400,
                padding: '2px 6px',
                maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {c.label}
              </span>
            )}
            {!isLast && <span style={{ color: 'var(--text-dim)', opacity: 0.5 }}>›</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}
