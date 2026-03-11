// ─── REPLACE src/app/dashboard/layout.tsx with this ───────────────────────────
'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, isSessionValid, clearSession, getRoleLabel } from '@/lib/auth';
import { AuthUser } from '@/types';

const C = {
  bg: '#080B12', side: '#0E1420', border: '#1E2D45',
  white: '#E8EDF8', gray: '#7A8BA0', grayd: '#2E445E',
  red: '#E01E2C', redD: 'rgba(224,30,44,0.12)',
  s3: '#131B2A',
};

// ─── Icon helper ───
function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

// ─── Nav definitions ───
const MAIN_NAV = [
  { href: '/dashboard',                     label: 'Dashboard',       icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10' },
  { href: '/dashboard/field-executives',    label: 'Field Execs',     icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75' },
  { href: '/dashboard/attendance-overview', label: 'Attendance',      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/dashboard/route-plan',          label: 'Route Plan',      icon: 'M17.657 16.657L13.414 20.9...' },
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

const ALL_NAV = [...MAIN_NAV, ...OTHER_NAV];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !isSessionValid()) { clearSession(); router.push('/login'); return; }
    setUser(u);
  }, [router]);

  // Auto-expand Other Management when on those pages
  useEffect(() => {
    if (pathname.startsWith('/dashboard/other-management')) setOtherOpen(true);
  }, [pathname]);

  const logout = () => { clearSession(); router.push('/login'); };

  if (!user) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ width: 24, height: 24, border: '2.5px solid rgba(255,255,255,0.15)', borderTopColor: C.red, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  const sideW = collapsed ? 72 : 240;
  const isOnOther = pathname.startsWith('/dashboard/other-management');

  const navItem = (item: typeof MAIN_NAV[0], indent = false) => {
    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
    return (
      <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2,
          padding: indent ? '8px 12px 8px 18px' : '10px 12px',
          borderRadius: 11,
          background: active ? C.redD : 'transparent',
          color: active ? C.red : C.gray,
          transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
        }}
          onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.s3; e.currentTarget.style.color = C.white; } }}
          onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.gray; } }}
        >
          <Icon d={item.icon} size={indent ? 15 : 18} />
          {!collapsed && <span style={{ fontSize: indent ? 12 : 13, fontWeight: active ? 700 : 500, flex: 1 }}>{item.label}</span>}
          {active && !collapsed && <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, flexShrink: 0 }} />}
        </div>
      </Link>
    );
  };

  const currentLabel = ALL_NAV.find(n =>
    n.href === pathname || (n.href !== '/dashboard' && pathname.startsWith(n.href))
  )?.label || 'Dashboard';

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, overflow: 'hidden' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1E2D45; border-radius: 4px; }
      `}</style>

      {/* ── Sidebar ── */}
      <aside style={{ width: sideW, background: C.side, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', transition: 'width 0.25s cubic-bezier(0.22,1,0.36,1)', flexShrink: 0, overflow: 'hidden' }}>

        {/* Logo */}
        <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${C.border}`, gap: 12, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, background: C.red, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: '#fff' }}>K</span>
          </div>
          {!collapsed && <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap' }}>Kinematic</span>}
        </div>

        {/* Nav scroll */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 10px 0' }}>

          {/* Main nav items */}
          {MAIN_NAV.map(item => navItem(item))}

          {/* ── Other Management Section ── */}
          <div style={{ margin: '10px 0 4px' }}>
            {/* Section divider */}
            {!collapsed && (
              <div style={{ padding: '4px 4px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: C.grayd, letterSpacing: '1.2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Other Management</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
            )}
            {collapsed && <div style={{ height: 1, background: C.border, margin: '6px 4px' }} />}

            {/* Collapsed: show icons directly */}
            {collapsed && OTHER_NAV.map(item => navItem(item))}

            {/* Expanded: collapsible group */}
            {!collapsed && (
              <>
                {/* Group header button */}
                <div
                  onClick={() => setOtherOpen(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    borderRadius: 11, marginBottom: 2, cursor: 'pointer',
                    background: isOnOther ? C.redD : 'transparent',
                    color: isOnOther ? C.red : C.gray,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isOnOther) { e.currentTarget.style.background = C.s3; e.currentTarget.style.color = C.white; } }}
                  onMouseLeave={e => { if (!isOnOther) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.gray; } }}
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: isOnOther ? 700 : 500, flex: 1 }}>Other Management</span>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: otherOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Sub-items */}
                {otherOpen && (
                  <div style={{ borderLeft: `2px solid ${C.border}`, marginLeft: 18, paddingLeft: 4, marginBottom: 4 }}>
                    {OTHER_NAV.map(item => navItem(item, true))}
                  </div>
                )}
              </>
            )}
          </div>
        </nav>

        {/* User + logout */}
        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 11, overflow: 'hidden' }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(224,30,44,0.15)', border: '1.5px solid rgba(224,30,44,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: C.red }}>{user.name[0]}</span>
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                <div style={{ fontSize: 11, color: C.gray }}>{getRoleLabel(user.role)}</div>
              </div>
            )}
          </div>
          <button onClick={logout} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', color: C.gray, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8, marginTop: 4, transition: 'all 0.15s', fontFamily: "'DM Sans',sans-serif" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(224,30,44,0.4)'; e.currentTarget.style.color = C.red; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.gray; }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(c => !c)} style={{ position: 'fixed', left: sideW - 14, top: 40, zIndex: 200, width: 28, height: 28, borderRadius: '50%', background: C.side, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'left 0.25s cubic-bezier(0.22,1,0.36,1)', color: C.gray }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
        </svg>
      </button>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 64, background: C.side, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, margin: 0 }}>{currentLabel}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00D97E', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 12, color: C.gray }}>Live</span>
          </div>
          <div style={{ fontSize: 12, color: C.grayd, borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
