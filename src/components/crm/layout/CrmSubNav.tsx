'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { isConsumerChampion, isTataTiscon, isKinematicActive } from '../../../lib/clientFeatures';

type CrmLink = {
  href: string;
  label: string;
  championHidden?: boolean;
  /** Hidden for Consumer Champions AND for TATA Tiscon users */
  tataTisconHidden?: boolean;
  /** Hidden for the parent Kinematic tenant */
  kinematicHidden?: boolean;
  /** Visible ONLY to the Kinematic super admin (role super_admin). */
  superAdminOnly?: boolean;
};
const LINKS: CrmLink[] = [
  { href: '/dashboard/crm/dashboard', label: 'Dashboard' },
  { href: '/dashboard/crm/leads', label: 'Leads' },
  // Customisable widget grid lives on its own route now — the CRM
  // Overview is back to the legacy stat-card + fixed-chart surface.
  // championHidden: Consumer Champion FEs don't need the analytics tab.
  { href: '/dashboard/crm/leads/analytics', label: 'Lead Analytics', championHidden: true },
  { href: '/dashboard/crm/market-intelligence', label: 'Market Intelligence', championHidden: true },
  // Contacts + Accounts removed from the CRM sub-nav — Tata's flow
  // goes lead → deal without those records. Re-add here when a tenant
  // that actually uses them needs the surface.
  { href: '/dashboard/crm/deals', label: 'Deals' },
  { href: '/dashboard/crm/pipeline', label: 'Pipeline' },
  { href: '/dashboard/crm/products', label: 'Products', kinematicHidden: true },
  // Tasks merged into Activities — tasks are now activities of type='task'.
  // /dashboard/crm/tasks redirects to /dashboard/crm/activities?type=task.
  { href: '/dashboard/crm/activities', label: 'Activities' },
  { href: '/dashboard/crm/whatsapp', label: 'WhatsApp' },
  // KINI website-chatbot conversations + the leads they capture. This is the
  // Kinematic platform's own website funnel, so it's visible only to the
  // Kinematic super admin — not client tenants or their admins.
  { href: '/dashboard/crm/website-chats', label: 'Website Chats', superAdminOnly: true },
  { href: '/dashboard/crm/reports', label: 'Reports' },
  { href: '/dashboard/crm/settings', label: 'Settings' },
  // Help & lifecycle — same screen as iOS / Android so reps get the same
  // onboarding map on every surface.
  { href: '/dashboard/crm/help', label: 'Help' },
];

export default function CrmSubNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const champion = isConsumerChampion(user as any);
  const tataTiscon = isTataTiscon(user as any);
  const superAdmin = ((user as any)?.role || '').toLowerCase().replace(/-/g, '_') === 'super_admin';
  // Resolve the Kinematic tenant after mount — isKinematicActive reads the
  // super-admin client picker off localStorage, which isn't available during
  // SSR. Starting false keeps server/client markup in sync (no hydration
  // mismatch); the hidden tabs disappear on the first client render.
  const [kinematic, setKinematic] = useState(false);
  useEffect(() => { setKinematic(isKinematicActive(user as any)); }, [user]);
  const visibleLinks = LINKS.filter((l) => {
    if (l.superAdminOnly && !superAdmin) return false;
    if (l.championHidden && champion) return false;
    if (l.tataTisconHidden && tataTiscon) return false;
    if (l.kinematicHidden && kinematic) return false;
    return true;
  });

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
      {visibleLinks.map((l) => (
        <Link key={l.href} href={l.href} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: isActive(l.href) ? '#fff' : 'var(--text-dim)', background: isActive(l.href) ? 'var(--primary)' : 'transparent', textDecoration: 'none' }}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
