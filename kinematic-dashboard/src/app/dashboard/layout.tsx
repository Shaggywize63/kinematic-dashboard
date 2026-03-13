'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, isSessionValid, clearSession, getRoleLabel } from '@/lib/auth';

const C = {
  bg: '#080B12', side: '#0E1420', border: '#1E2D45',
  white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  red: '#E01E2C', redD: 'rgba(224,30,44,0.12)',
  s3: '#131B2A',
};

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

const MAIN_NAV = [
  { href: '/dashboard',                     label: 'Dashboard',       icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { href: '/dashboard/field-executives',    label: 'Field Execs',     icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75' },
  { href: '/dashboard/attendance-overview', label: 'Attendance',      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/dashboard/analytics',           label: 'Analytics',       icon: 'M18 20V10 M12 20V4 M6 20v-6' },
  { href: '/dashboard/warehouse',           label: 'Warehouse',       icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8' },
  { href: '/dashboard/broadcast',           label: 'Broadcast',       icon: 'M18 8a6 6 0 010 8M14 11.73A2 2 0 1112 15a2 2 0 002-3.27z M21.64 4.36a12 12 0 010 15.27' },
  { href: '/dashboard/hr',                  label: 'HR',              icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0z M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { href: '/dashboard/live-tracking',       label: 'Live Tracking',   icon: 'M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z M12 13a3 3 0 100-6 3 3 0 000 6z' },
  { href: '/dashboard/notifications',       label: 'Notifications',   icon: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0' },
  { href: '/dashboard/settings',            label: 'Settings',        icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' },
];

const OTHER_NAV = [
  { href: '/dashboard/other-management/cities',     label: 'City Management',     icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { href: '/dashboard/other-management/zones',      label: 'Zone Management',     icon: 'M1 6l10.5 7L22 6M1 6v12a2 2 0 002 2h18a2 2 0 002-2V6 M1 6l10.5-4L22 6' },
  { href: '/dashboard/other-management/stores',     label: 'Store Management',    icon: 'M3 3h18v4H3z M5 7v13h14V7 M9 7v13 M15 7v13' },
  { href: '/dashboard/other-management/skus',       label: "SKU's Management",    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10' },
  { href: '/dashboard/other-management/activities', label: 'Activity Management', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2 M9 12l2 2 4-4' },
  { href: '/dashboard/other-management/assets',     label: 'Asset Management',    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8 M10 12h4' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [userName, setUserName]   = useState('');
  const [userRole, setUserRole]   = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !isSessionValid()) {
      clearSession();
      router.push('/login');
      return;
    }
    setUserName(u.name || u.email || 'Admin');
    setUserRole(getRoleLabel(u.role || ''));

    // auto-open Other Management section if on one of its pages
    if (pathname.startsWith('/dashboard/other-management')) {
      setOtherOpen(true);
    }
  }, [pathname, router]);

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(href);

  const sideW = collapsed ? 64 : 220;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sideW, flexShrink: 0, background: C.side,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
        transition: 'width .2s cubic-bezier(.4,0,.2,1)', overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{ height: 60, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 16px' : '0 20px', gap: 10, flexShrink: 0,
          borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: C.red,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, color: '#fff' }}>K</span>
          </div>
          {!collapsed && (
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16,
              color: C.white, whiteSpace: 'nowrap' }}>
              Kinematic
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 0' }}>

          {/* Main nav */}
          {MAIN_NAV.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: collapsed ? '10px 16px' : '10px 16px',
                  margin: '1px 8px', borderRadius: 9,
                  background: active ? C.redD : 'transparent',
                  color: active ? C.red : C.gray,
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  transition: 'background .14s, color .14s',
                  cursor: 'pointer',
                }}>
                  <Icon d={item.icon} size={17} />
                  {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                  {active && !collapsed && (
                    <div style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
                  )}
                </div>
              </Link>
            );
          })}

          {/* Other Management section */}
          {!collapsed && (
            <>
              <div
                onClick={() => setOtherOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', margin: '1px 8px', borderRadius: 9,
                  color: C.grayd, fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.7px', textTransform: 'uppercase',
                  cursor: 'pointer', userSelect: 'none',
                  marginTop: 8,
                }}>
                <Icon d="M4 6h16M4 12h16M4 18h16" size={14} />
                <span>Other Management</span>
                <svg style={{ marginLeft: 'auto', transform: otherOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                  width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {otherOpen && OTHER_NAV.map(item => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 16px 9px 28px',
                      margin: '1px 8px', borderRadius: 9,
                      background: active ? C.redD : 'transparent',
                      color: active ? C.red : C.gray,
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      whiteSpace: 'nowrap', overflow: 'hidden',
                      transition: 'background .14s, color .14s',
                      cursor: 'pointer',
                    }}>
                      <Icon d={item.icon} size={15} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* User + logout */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: collapsed ? '12px 10px' : '12px 14px',
          flexShrink: 0 }}>
          {!collapsed && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.white,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {userName}
              </div>
              <div style={{ fontSize: 11, color: C.grayd, marginTop: 2 }}>{userRole}</div>
            </div>
          )}
          <button onClick={handleLogout} style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: collapsed ? 0 : 8, justifyContent: collapsed ? 'center' : 'flex-start',
            padding: '8px 10px', borderRadius: 9,
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.gray, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
            transition: 'background .14s',
          }}>
            <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={15} />
            {!collapsed && 'Sign Out'}
          </button>
        </div>

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(c => !c)} style={{
          position: 'absolute', bottom: 110, right: -12,
          width: 24, height: 24, borderRadius: '50%',
          background: C.side, border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: C.gray, zIndex: 10,
        }}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
            style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </aside>

      {/* ── Main content ── */}
      <main style={{
        marginLeft: sideW, flex: 1, minHeight: '100vh',
        padding: '28px 32px', transition: 'margin-left .2s cubic-bezier(.4,0,.2,1)',
      }}>
        {children}
      </main>
    </div>
  );
}
