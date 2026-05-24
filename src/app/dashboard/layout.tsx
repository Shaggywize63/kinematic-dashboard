'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getStoredUser, isSessionValid, clearSession } from '../../lib/auth';
import api from '../../lib/api';
import { ClientProvider, useClient } from '../../context/ClientContext';
import { CityScopeProvider } from '../../context/CityScopeContext';
import ClientSelect from '../../components/ClientSelect';
import NotificationBell from '../../components/crm/NotificationBell';

// KINI chat is ~250 lines + 4 card components + markdown helpers; load it on
// demand so the main dashboard JS stays lean. ssr:false avoids hydration cost.
const KinematicAI = dynamic(() => import('../../components/KinematicAI'), { ssr: false });

function GlobalClientFilter({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const { selectedClientId, setSelectedClientId } = useClient();
  if (!isPlatformAdmin) return null;
  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <ClientSelect
        value={selectedClientId}
        onChange={(id) => setSelectedClientId(id)}
        placeholder="Filter by Client..."
      />
    </div>
  );
}

const C = {
  bg: 'var(--bg)',
  side: 'var(--s1)',
  border: 'var(--border)',
  borderL: 'var(--border-l)',
  white: 'var(--text)',
  gray: 'var(--text-dim)',
  grayd: 'var(--text-dim)',
  red: 'var(--primary)',
  redD: 'rgba(224,30,44,0.12)',
  redB: 'rgba(224,30,44,0.2)',
  s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  green: 'var(--green)', blue: 'var(--accent)',
};

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [token, setToken] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile(1024);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !isSessionValid()) { clearSession(); router.push('/login'); return; }
    setUser(u);
    if (typeof window !== 'undefined') {
      setToken(localStorage.getItem('kinematic_token') || '');
    }
    (async () => {
      try {
        const fresh: any = await api.get('/api/v1/auth/me');
        const next = fresh?.data ?? fresh;
        if (next && (next.enabled_modules || next.enabled_packages)) {
          try {
            localStorage.setItem('kinematic_user', JSON.stringify(next));
          } catch { /* ignore */ }
          setUser(next);
        }
      } catch { /* keep cached user */ }
    })();
  }, [router]);

  const handleLogout = () => { clearSession(); router.push('/login'); };
  const userRole = user?.role || '';
  const userPerms = user?.permissions || [];
  // Fetch the hierarchy role label once so the top header can show "Name ·
  // Business Manager" (the hierarchy name) instead of just the legacy
  // preset role. Cached in localStorage so repeat visits skip the round
  // trip. Resolves quietly if the API isn't reachable — falls back to the
  // preset label.
  const [hierarchyRoleName, setHierarchyRoleName] = useState<string>('');
  useEffect(() => {
    // Prefer the role name baked into the user object itself —
    // /auth/me now joins org_roles and returns `org_role: { id, name }`.
    // Falls back to a one-time fetch + cache for older sessions that
    // pre-date the join, so a stale localStorage doesn't blank the
    // designation forever.
    const joined = (user as any)?.org_role?.name as string | undefined;
    if (joined) { setHierarchyRoleName(joined); return; }
    const orgRoleId = (user as any)?.org_role_id;
    if (!orgRoleId) { setHierarchyRoleName(''); return; }
    const cacheKey = `kin_role_name_${orgRoleId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setHierarchyRoleName(cached); return; }
    } catch { /* ignore */ }
    api.get<any>(`/api/v1/roles/${orgRoleId}`)
      .then((r: any) => {
        const name = (r?.data?.name || r?.name || '') as string;
        if (name) {
          setHierarchyRoleName(name);
          try { localStorage.setItem(cacheKey, name); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* fall back to preset role */ });
  }, [user?.id]);
  const enabledModules: string[] = Array.isArray(user?.enabled_modules) ? user.enabled_modules : [];
  const enabledPackages: string[] = Array.isArray(user?.enabled_packages) ? user.enabled_packages : [];
  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
  const sideW = isMobile ? 0 : (collapsed ? 64 : 220);
  const drawerW = isMobile ? 240 : (collapsed ? 64 : 220);
  const sidebarVisible = isMobile ? drawerOpen : true;

  useEffect(() => { if (isMobile) setDrawerOpen(false); }, [pathname, isMobile]);

  const isPlatformAdmin = (() => {
    if ((user as any)?.client_id) return false;
    const role = (userRole || '').toLowerCase().trim().replace(/-/g, '_');
    const name = (user?.name || '').toLowerCase().trim();
    return ['super_admin', 'admin', 'main_admin', 'sub_admin', 'master_admin'].includes(role) ||
           role.includes('admin') ||
           name === 'sagar';
  })();

  const isSuperAdmin = (userRole || '').toLowerCase().replace(/-/g, '_') === 'super_admin';

  const hasModule = (m: string) => {
    if (!m) return true;
    if (enabledModules.length > 0) return enabledModules.includes(m);
    return userPerms.includes(m);
  };

  const filterNav = (items: any[]) => {
    const visibleAfterRole = items.filter((i) => !i.superAdminOnly || isSuperAdmin);
    // Hide demo-only nav items (e.g. the Nurturing module preview) for
    // every account except demo@kinematic.com. Real customers shouldn't
    // see a half-built feature surfaced as if it's ready.
    const visibleAfterDemo = visibleAfterRole.filter(
      (i) => !i.demoOnly || user?.email === 'demo@kinematic.com'
    );
    if (isPlatformAdmin) return visibleAfterDemo;
    return visibleAfterDemo.filter(i => hasModule(i.module));
  };

  const isCrmOnlyClient =
    !isPlatformAdmin &&
    enabledPackages.includes('crm') &&
    !enabledPackages.includes('field_force') &&
    !enabledPackages.includes('distribution');

  const sectionVisible = (pkg: string | undefined, items: any[]) => {
    if (items.length === 0) return false;
    if (!pkg) return true;
    if (isPlatformAdmin) return true;
    if (isCrmOnlyClient && pkg !== 'crm') return false;
    if (['business', 'system', 'people', 'audit'].includes(pkg)) return true;
    if (enabledPackages.length === 0) return true;
    return enabledPackages.includes(pkg);
  };

  const ICON_WHATSAPP = 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z';
  const ICON_SETTINGS = 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
  // Lucide "indian-rupee" — top + middle horizontal bars, the hook tail
  // and the diagonal stroke. Replaces the previous USD "$" path so the
  // Deals nav matches the rupee-denominated business.
  const ICON_RUPEE = 'M6 3h12 M6 8h12 M6 13h3a4.5 4.5 0 0 0 0-9 M6 13l8 8';

  const rawNavGroups = [
    { label: 'Field Force', package: 'field_force', items: [
      { href: '/dashboard',                              label: 'Dashboard',           icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10', module: 'dashboard' },
      { href: '/dashboard/attendance-overview',          label: 'Attendance',          icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', module: 'attendance' },
      { href: '/dashboard/analytics',                    label: 'Analytics',           icon: 'M18 20V10 M12 20V4 M6 20v-6', module: 'analytics' },
      { href: '/dashboard/live-tracking',                label: 'Live Tracking',       icon: 'M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z', module: 'live_tracking' },
      { href: '/dashboard/other-management/activities',  label: 'Activity Management', icon: 'M12 2v20 M2 12h20', module: 'activities' },
      { href: '/dashboard/planograms',                   label: 'Planograms',          icon: 'M3 5h18 M3 12h18 M3 19h18 M7 5v14 M17 5v14', module: 'planograms' },
      { href: '/dashboard/form-builder',                 label: 'Form Builder',        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', module: 'form_builder' },
      { href: '/dashboard/route-plan',                   label: 'Route Plan',          icon: 'M9 20l-5.44-2.72A2 2 0 013 15.49V4.5a2 2 0 012.89-1.8L9 4 M9 4v16 M15 1l5.44 2.72A2 2 0 0121 5.51v10.98a2 2 0 01-2.89 1.8L15 17 M15 1v16', module: 'orders' },
      { href: '/dashboard/work-activities',              label: 'Work Activities',     icon: 'M12 2v20 M2 12h20 M5 5l14 14 M19 5L5 14', module: 'work_activities' },
    ]},
    { label: 'Lead Management', package: 'crm', items: [
      { href: '/dashboard/crm/dashboard',        label: 'Dashboard',      icon: 'M3 3v18h18 M7 14l4-4 4 4 5-5', module: 'crm_dashboard' },
      { href: '/dashboard/crm/leads',            label: 'Leads',          icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z', module: 'crm_leads' },
      { href: '/dashboard/crm/leads/analytics',  label: 'Lead Analytics', icon: 'M18 20V10 M12 20V4 M6 20v-6', module: 'crm_leads' },
      { href: '/dashboard/crm/contacts',         label: 'Contacts',       icon: 'M20 21v-2a4 4 0 00-3-3.87 M4 21v-2a4 4 0 014-4h4a4 4 0 014 4v2 M16 3.13a4 4 0 010 7.75 M8 11a4 4 0 100-8 4 4 0 000 8z', module: 'crm_contacts' },
      { href: '/dashboard/crm/accounts',         label: 'Accounts',       icon: 'M3 21h18 M3 7v14 M21 7v14 M3 7l9-4 9 4 M9 12h6', module: 'crm_accounts' },
      { href: '/dashboard/crm/deals',            label: 'Deals',          icon: ICON_RUPEE, module: 'crm_deals' },
      { href: '/dashboard/crm/pipeline',         label: 'Pipeline',       icon: 'M3 5h6v14H3z M9 9h6v6H9z M15 5h6v14h-6z', module: 'crm_pipeline' },
      { href: '/dashboard/crm/products',         label: 'Products',       icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', module: 'crm_products' },
      { href: '/dashboard/crm/activities',       label: 'Activities',     icon: 'M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3', module: 'crm_activities' },
      { href: '/dashboard/crm/whatsapp',         label: 'WhatsApp',       icon: ICON_WHATSAPP, module: 'crm_whatsapp' },
      { href: '/dashboard/crm/nurturing',        label: 'Nurturing',      icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', module: 'crm_dashboard', demoOnly: true },
      { href: '/dashboard/crm/reports',          label: 'Reports',        icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8', module: 'crm_reports' },
      { href: '/dashboard/crm/settings',         label: 'Settings',       icon: ICON_SETTINGS, module: 'crm_settings' },
      { href: '/dashboard/crm/help',             label: 'Help',           icon: 'M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3 M12 17h.01 M22 12a10 10 0 11-20 0 10 10 0 0120 0z', module: 'crm_dashboard' },
    ]},
    { label: 'Supply Chain & Distribution', package: 'distribution', items: [
      { href: '/dashboard/distribution',                  label: 'Overview',     icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10', module: 'distribution' },
      { href: '/dashboard/distribution/brands',           label: 'Brands',       icon: 'M5 3a2 2 0 00-2 2v2a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5z M5 11a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2H5z', module: 'distribution_brands' },
      { href: '/dashboard/distribution/distributors',     label: 'Distributors', icon: 'M3 7l9-4 9 4-9 4-9-4z M3 12l9 4 9-4 M3 17l9 4 9-4', module: 'distribution_distributors' },
      { href: '/dashboard/distribution/price-lists',      label: 'Price Lists',  icon: 'M9 7h6 M9 11h6 M9 15h4 M5 5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2z', module: 'distribution_pricing' },
      { href: '/dashboard/distribution/schemes',          label: 'Schemes',      icon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z', module: 'distribution_schemes' },
      { href: '/dashboard/distribution/orders',           label: 'Orders',       icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M9 12h6 M9 16h6', module: 'distribution_orders' },
      { href: '/dashboard/distribution/invoices',         label: 'Invoices',     icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M9 13h6 M9 17h6', module: 'distribution_invoicing' },
      { href: '/dashboard/distribution/dispatches',       label: 'Dispatches',   icon: 'M3 6h18 M16 10l5 5-5 5 M21 15H3', module: 'distribution_invoicing' },
      { href: '/dashboard/distribution/payments',         label: 'Payments',     icon: 'M2 6h20v12H2z M2 10h20', module: 'distribution_payments' },
      { href: '/dashboard/distribution/returns',          label: 'Returns',      icon: 'M9 14l-4-4 4-4 M5 10h11a4 4 0 014 4v0a4 4 0 01-4 4h-3', module: 'distribution_returns' },
      { href: '/dashboard/distribution/ledger',           label: 'Ledger',       icon: 'M3 6l9-3 9 3 M5 6v15h14V6 M9 11h6 M9 15h6', module: 'distribution_ledger' },
      { href: '/dashboard/distribution/secondary-sales',  label: 'Consumer',     icon: 'M3 3h18v18H3z M3 9h18 M9 21V9', module: 'distribution_consumer' },
      { href: '/dashboard/distribution/integrations',     label: 'Integrations', icon: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71', module: 'distribution' },
    ]},
    { label: 'Business', package: 'business', items: [
      { href: '/dashboard/clients',                  label: 'Clients',   icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z', module: 'clients' },
      { href: '/dashboard/warehouse',                label: 'Warehouse', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', module: 'inventory' },
      { href: '/dashboard/other-management/assets',  label: 'Assets',    icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', module: 'assets' },
      { href: '/dashboard/other-management/skus',    label: 'SKU',       icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', module: 'skus' },
    ]},
    { label: 'People & Support', package: 'people', items: [
      { href: '/dashboard/manpower-directory', label: 'Users',         icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75', module: 'users' },
      { href: '/dashboard/hr',                 label: 'HR & Recruitment', icon: 'M20 7H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16', module: 'hr' },
      { href: '/dashboard/grievances',         label: 'Grievances',    icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01', module: 'grievances' },
      { href: '/dashboard/visit-logs',         label: 'Visit Logs',    icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', module: 'visit_logs' },
      { href: '/dashboard/broadcast',          label: 'Broadcast',     icon: 'M12 19V5 M5 12l7-7 7 7', module: 'broadcast' },
      { href: '/dashboard/notifications',      label: 'Notifications', icon: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0', module: 'notifications' },
    ]},
    { label: 'System Management', package: 'system', items: [
      { href: '/dashboard/other-management/cities',  label: 'Cities',          icon: 'M3 21h18 M3 7v1a3 3 0 006 0V7m6 0v1a3 3 0 006 0V7', module: 'cities' },
      { href: '/dashboard/other-management/zones',   label: 'Zones',           icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 10a3 3 0 100-6 3 3 0 000 6z', module: 'zones' },
      { href: '/dashboard/other-management/stores',  label: 'Outlets',         icon: 'M3 21h18 M9 8h10 M9 12h10 M9 16h10 M3 4h18', module: 'stores' },
      { href: '/dashboard/security-alerts',          label: 'Security Alerts', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', module: 'security_alerts' },
      { href: '/dashboard/settings',                 label: 'Settings',        icon: ICON_SETTINGS, module: 'settings' },
    ]},
    { label: 'Audit', package: 'audit', items: [
      { href: '/dashboard/audit-log', label: 'Activity Log', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M12 11h4 M12 15h4 M8 11h.01 M8 15h.01', module: 'audit_log', superAdminOnly: true },
    ]},
  ];

  const navGroups = rawNavGroups
    .map(g => ({ ...g, items: filterNav(g.items) }))
    .filter(g => sectionVisible(g.package, g.items));



  return (
    <ClientProvider>
      <CityScopeProvider>
      <div style={{ display:'flex', minHeight:'100vh', background:C.bg, color:C.white }}>
        {isMobile && drawerOpen && (
          <div onClick={() => setDrawerOpen(false)} style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:998,
          }}/>
        )}

        <aside style={{
          width: isMobile ? drawerW : sideW,
          background:C.side,
          borderRight:`1px solid ${C.border}`,
          position:'fixed', top:0, left:0, bottom:0,
          display:'flex', flexDirection:'column',
          transition:'transform .25s ease, width .2s',
          transform: sidebarVisible ? 'translateX(0)' : `translateX(-${drawerW}px)`,
          zIndex: isMobile ? 999 : 10,
          boxShadow: isMobile && drawerOpen ? '4px 0 24px rgba(0,0,0,0.4)' : 'none',
        }}>
          <div style={{ height:65, display:'flex', alignItems:'center', padding:'0 20px', borderBottom:`1px solid ${C.border}`, gap:12 }}>
            <img src="/logo-mark.png" alt="K" style={{ width:28, height:28, objectFit:'contain' }} />
            {(isMobile || !collapsed) && <span style={{ fontWeight:800, fontSize:18, letterSpacing:'-0.5px' }}>Kinematic</span>}
          </div>

          <nav style={{ flex:1, padding:'15px 0', overflowY:'auto' }}>
            {navGroups.map((g, gi) => (
              <div key={gi} style={{ marginBottom:20 }}>
                {(isMobile || !collapsed) && <div style={{ padding:'0 20px', fontSize:10, color:C.grayd, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>{g.label}</div>}
                {g.items.map((i:any) => (
                  <Link key={i.href} href={i.href}>
                    <div style={{ display:'flex', alignItems:'center', padding:'10px 20px', gap:12, color:isActive(i.href)?C.red:C.gray, background:isActive(i.href)?C.redD:'transparent', cursor:'pointer' }}>
                      <Icon d={i.icon} size={18} />
                      {(isMobile || !collapsed) && <span style={{ fontSize:14 }}>{i.label}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div style={{ padding:20, borderTop:`1px solid ${C.border}` }}>
            {(isMobile || !collapsed) && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.white, lineHeight:1.2 }}>{user?.name || 'Admin'}</div>
                {/* Designation = hierarchy role name (e.g. "Business Manager",
                    "Consumer Champion"). Falls back to the legacy preset role
                    label so we never show an empty descriptor. */}
                <div style={{ fontSize:11, color:C.gray, marginTop:2, lineHeight:1.2 }}>
                  {/* Show only the hierarchy designation (Business Manager,
                      Consumer Champion, etc.). Never expose the legacy preset
                      role like "Sub-Admin" — admins consider that an
                      implementation detail. */}
                  {hierarchyRoleName || 'Team Member'}
                </div>
              </div>
            )}
            <button onClick={handleLogout} style={{ width:'100%', padding:'10px', background:'transparent', border:`1px solid ${C.border}`, color:C.gray, borderRadius:8, cursor:'pointer' }}>Sign Out</button>

            {user?.email === 'demo@kinematic.com' && (
              <div style={{ marginTop:15, padding:10, background:'rgba(255,59,48,0.1)', border:'1px solid rgba(255,59,48,0.2)', borderRadius:8, textAlign:'center' }}>
                <div style={{ color:C.red, fontSize:9, fontWeight:900 }}>DEMO ACTIVE</div>
                <div style={{ fontSize:8, color:C.grayd }}>Stable Mock Intercept</div>
              </div>
            )}
          </div>
        </aside>

        <main style={{ marginLeft:sideW, flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          <header style={{
            height:65, background:C.s1, borderBottom:`1px solid ${C.border}`,
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding: isMobile ? '0 14px' : '0 25px', gap:10,
            position: 'relative',
          }}>
            {/*
             * CRM mark sits centred in the header strip when the user is on
             * a CRM route. Absolute-positioned so left + right groups don't
             * have to share width with it. Hidden on mobile to keep the
             * compact name + actions clear.
             */}
            {pathname.startsWith('/dashboard/crm') && !isMobile && (
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  fontWeight: 900, fontSize: 24, color: C.white, letterSpacing: '-0.5px',
                }}>
                  CRM
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999,
                    background: 'rgba(224,30,44,0.12)', color: C.red,
                    border: `1px solid rgba(224,30,44,0.3)`, letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}>
                    powered by Kini AI
                  </span>
                </div>
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0, flex:1, zIndex: 1 }}>
              {isMobile && (
                <button
                  onClick={() => setDrawerOpen(o => !o)}
                  aria-label="Open menu"
                  style={{ background:'transparent', border:'none', color:C.white, cursor:'pointer', padding:6, display:'flex', alignItems:'center' }}
                >
                  <Icon d="M3 12h18 M3 6h18 M3 18h18" size={22} />
                </button>
              )}
              {/* User identity badge — name + hierarchy role label. The
                  hierarchy name comes from /api/v1/roles/:id (cached); falls
                  back to the legacy preset role label so we never render an
                  empty descriptor. Tappable: routes to the new /profile
                  page so the rep can change their avatar. */}
              <Link
                href="/dashboard/profile"
                style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                title="My profile"
              >
                {/* Avatar uses the user's uploaded image when available,
                    falling back to a neutral initial chip so the layout
                    never reserves an empty hole. Red is reserved for
                    KINI AI elsewhere — initial chip stays neutral. */}
                {user?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt={user?.name || 'Profile'}
                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.border}` }}
                  />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: C.s4, color: C.white, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 13, border: `1px solid ${C.border}`,
                  }}>
                    {(user?.name || 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
                  <span style={{ fontWeight: 700, fontSize: isMobile ? 13 : 14, color: C.white, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {user?.name || 'Signed in'}
                  </span>
                  <span style={{ fontSize: isMobile ? 10 : 11, color: C.gray, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {/* Show only the hierarchy designation (Business Manager,
                      Consumer Champion, etc.). Never expose the legacy preset
                      role like "Sub-Admin" — admins consider that an
                      implementation detail. */}
                  {hierarchyRoleName || 'Team Member'}
                  </span>
                </div>
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, zIndex: 1 }}>
              <NotificationBell />
              <GlobalClientFilter isPlatformAdmin={isPlatformAdmin} />
            </div>
          </header>
          <div style={{ padding: isMobile ? 14 : 25, flex:1, minWidth:0 }}>{children}</div>
          <footer style={{ padding:15, borderTop:`1px solid ${C.border}`, textAlign:'center', fontSize:9, color:C.grayd }}>
            Kinematic Registry: STABLE-ENV | Interception Enabled
          </footer>
        </main>
        {token && <KinematicAI token={token} />}
      </div>
      </CityScopeProvider>
    </ClientProvider>
  );
}
