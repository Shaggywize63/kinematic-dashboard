'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { crmSettings } from '../../../lib/crmApi';

const ALL_LINKS = [
  { href: '/dashboard/crm/dashboard', label: 'Dashboard' },
  { href: '/dashboard/crm/leads', label: 'Leads' },
  // Customisable widget grid lives on its own route now — the CRM
  // Overview is back to the legacy stat-card + fixed-chart surface.
  { href: '/dashboard/crm/leads/analytics', label: 'Lead Analytics' },
  { href: '/dashboard/crm/contacts', label: 'Contacts' },
  { href: '/dashboard/crm/accounts', label: 'Accounts', hideForB2C: true },
  { href: '/dashboard/crm/deals', label: 'Deals' },
  { href: '/dashboard/crm/pipeline', label: 'Pipeline' },
  { href: '/dashboard/crm/products', label: 'Products' },
  // Tasks merged into Activities — tasks are now activities of type='task'.
  // /dashboard/crm/tasks redirects to /dashboard/crm/activities?type=task.
  { href: '/dashboard/crm/activities', label: 'Activities' },
  { href: '/dashboard/crm/whatsapp', label: 'WhatsApp' },
  { href: '/dashboard/crm/reports', label: 'Reports' },
  { href: '/dashboard/crm/settings', label: 'Settings' },
  // Help & lifecycle — same screen as iOS / Android so reps get the same
  // onboarding map on every surface.
  { href: '/dashboard/crm/help', label: 'Help' },
];

export default function CrmSubNav() {
  const pathname = usePathname();
  const [isB2C, setIsB2C] = useState(false);

  useEffect(() => {
    crmSettings.get().then((r) => {
      if (r.data?.business_type === 'b2c') setIsB2C(true);
    }).catch(() => {});
  }, []);

  const links = ALL_LINKS.filter((l) => !(l.hideForB2C && isB2C));
  const isActive = (href: string) => {
    // /dashboard/crm/leads/analytics must NOT match the /dashboard/crm/leads
    // tab as a prefix, so the Lead Analytics tab gets sole ownership of
    // that route. Resolve the most specific match first.
    if (href === '/dashboard/crm/leads') {
      return pathname === href || (pathname.startsWith(href + '/') && pathname !== '/dashboard/crm/leads/analytics');
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav style={{ display: 'flex', gap: 4, padding: '4px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 18, overflowX: 'auto' }}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: isActive(l.href) ? '#fff' : 'var(--text-dim)', background: isActive(l.href) ? 'var(--primary)' : 'transparent', textDecoration: 'none' }}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
