'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronsUpDown, LogOut, PanelLeftClose, PanelLeftOpen, Pencil, Search, User as UserIcon, X } from 'lucide-react';
import BrandLogo from '../shared/BrandLogo';
import SignedImage from '../shared/SignedImage';
import NewBadge from '../shared/NewBadge';
import { NavIcon } from '../ui/icons';
import { Avatar, T } from '../ui';

export interface SidebarNavItem { href: string; label: string; icon?: string; [k: string]: unknown }
export interface SidebarNavGroup { label: string; package?: string; items: SidebarNavItem[] }

export const SIDEBAR_W = 240;
export const SIDEBAR_RAIL_W = 64;
export const SIDEBAR_DRAWER_W = 272;
export const TOPBAR_H = 56;

interface Props {
  groups: SidebarNavGroup[];
  hasAnyGroups: boolean;
  navReady: boolean;
  isMobile: boolean;
  collapsed: boolean;
  visible: boolean;
  top: number;
  onToggleCollapsed: () => void;
  onCloseDrawer: () => void;
  navQuery: string;
  onNavQuery: (q: string) => void;
  onOpenSearch: () => void;
  onEditNav: () => void;
  collapsedSections: Record<string, boolean>;
  onToggleSection: (label: string) => void;
  isActive: (href: string) => boolean;
  webChatUnread: number;
  user: { name?: string; email?: string; avatar_url?: string } | null;
  roleLabel: string;
  onLogout: () => void;
  isDemo: boolean;
}

/**
 * The dashboard's left navigation. One 240px panel (64px icon rail when
 * collapsed, a 272px drawer on phones): brand row, ⌘K search, nav groups
 * under mono eyebrows, and the signed-in user at the bottom. Purely
 * presentational — every list, filter and preference is computed by the
 * layout and handed in.
 */
export default function Sidebar(p: Props) {
  const rail = p.collapsed && !p.isMobile;
  const width = p.isMobile ? SIDEBAR_DRAWER_W : (p.collapsed ? SIDEBAR_RAIL_W : SIDEBAR_W);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const rowBase: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, height: 32,
    padding: rail ? 0 : '0 10px', margin: rail ? '2px 12px' : '1px 12px',
    justifyContent: rail ? 'center' : 'flex-start',
    borderRadius: T.radius.sm, fontSize: 13.5, fontWeight: 500, color: T.dim,
    textDecoration: 'none', position: 'relative', whiteSpace: 'nowrap',
    transition: 'background .12s ease, color .12s ease',
  };

  return (
    <aside
      aria-label="Main navigation"
      style={{
        width,
        background: T.panel,
        borderRight: `1px solid ${T.border}`,
        position: 'fixed', top: p.top, left: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        transition: 'transform .25s ease, width .2s ease',
        transform: p.visible ? 'translateX(0)' : `translateX(-${width}px)`,
        zIndex: p.isMobile ? 999 : 10,
        boxShadow: p.isMobile && p.visible ? '8px 0 32px rgba(0,0,0,0.35)' : 'none',
      }}
    >
      {/* Brand row */}
      <div style={{
        height: TOPBAR_H, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: rail ? 'center' : 'space-between',
        padding: rail ? 0 : '0 12px 0 16px', borderBottom: `1px solid ${T.border}`, gap: 10,
      }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textDecoration: 'none', color: T.text }} title="Kinematic">
          <BrandLogo size={24} />
          {!rail && <span style={{ fontFamily: T.heading, fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Kinematic</span>}
        </Link>
        {!rail && !p.isMobile && (
          <button type="button" onClick={p.onToggleCollapsed} aria-label="Collapse sidebar" title="Collapse sidebar" className="km-iconbtn"
            style={{ width: 28, height: 28, padding: 0, borderRadius: T.radius.sm, background: 'transparent', border: 0, color: T.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <PanelLeftClose size={16} strokeWidth={1.6} />
          </button>
        )}
        {p.isMobile && (
          <button type="button" onClick={p.onCloseDrawer} aria-label="Close menu" className="km-iconbtn"
            style={{ width: 28, height: 28, padding: 0, borderRadius: T.radius.sm, background: 'transparent', border: 0, color: T.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={16} strokeWidth={1.6} />
          </button>
        )}
      </div>

      {rail && (
        <button type="button" onClick={p.onToggleCollapsed} aria-label="Expand sidebar" title="Expand sidebar" className="km-iconbtn"
          style={{ margin: '10px auto 2px', width: 32, height: 32, padding: 0, borderRadius: T.radius.sm, background: 'transparent', border: `1px solid ${T.border}`, color: T.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PanelLeftOpen size={16} strokeWidth={1.6} />
        </button>
      )}

      {/* Search + customise (expanded only) */}
      {!rail && p.navReady && p.hasAnyGroups && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 12px 4px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search size={15} strokeWidth={1.6} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
            <input
              type="text"
              value={p.navQuery}
              onChange={(e) => p.onNavQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') p.onNavQuery(''); }}
              placeholder="Search"
              aria-label="Search menu"
              className="km-input"
              style={{
                width: '100%', boxSizing: 'border-box', height: 32,
                padding: p.navQuery ? '0 26px 0 30px' : '0 44px 0 30px',
                borderRadius: T.radius.sm, background: T.canvas, border: `1px solid ${T.border}`,
                color: T.text, fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }}
            />
            {p.navQuery ? (
              <button type="button" aria-label="Clear menu search" onClick={() => p.onNavQuery('')}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: T.mute, cursor: 'pointer', padding: 2, display: 'flex' }}>
                <X size={14} strokeWidth={1.6} />
              </button>
            ) : (
              <button type="button" onClick={p.onOpenSearch} title="Search everything (⌘K / Ctrl-K)" aria-label="Open global search"
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: T.card, border: `1px solid ${T.border}`, color: T.mute, borderRadius: 4, padding: '1px 5px', fontFamily: T.mono, fontSize: 10.5, cursor: 'pointer', lineHeight: 1.4 }}>
                ⌘K
              </button>
            )}
          </div>
          <button type="button" onClick={p.onEditNav} title="Customise menu" aria-label="Customise menu" className="km-iconbtn"
            style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: T.radius.sm, background: 'transparent', border: `1px solid ${T.border}`, color: T.mute, cursor: 'pointer' }}>
            <Pencil size={14} strokeWidth={1.6} />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: rail ? '6px 0 10px' : '6px 0 12px' }}>
        {!p.navReady && (
          <div style={{ padding: '12px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} style={{ height: 10, width: rail ? 20 : `${55 + ((i * 17) % 35)}%`, borderRadius: 5, background: T.rule, opacity: 0.7 }} />
            ))}
          </div>
        )}
        {p.navReady && p.navQuery.trim() && p.groups.length === 0 && !rail && (
          <div style={{ padding: '8px 22px 12px', fontSize: 12.5, color: T.mute }}>
            No menu items match “{p.navQuery.trim()}”.
          </div>
        )}
        {p.groups.map((g, gi) => {
          const sectionClosed = !!p.collapsedSections[g.label] && !p.navQuery.trim();
          return (
            <div key={g.label} style={{ marginTop: gi === 0 ? 6 : 0 }}>
              {rail ? (
                gi > 0 && <div style={{ height: 1, background: T.border, margin: '8px 18px' }} />
              ) : (
                <button
                  type="button"
                  onClick={() => p.onToggleSection(g.label)}
                  aria-expanded={!sectionClosed}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 22px 6px', background: 'transparent', border: 'none', cursor: 'pointer',
                    fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: T.mute, fontWeight: 500,
                  }}
                >
                  <span>{g.label}</span>
                  <ChevronDown size={12} strokeWidth={1.6} style={{ transition: 'transform .15s ease', transform: sectionClosed ? 'rotate(-90deg)' : 'none', opacity: 0.8 }} />
                </button>
              )}
              {(rail || !sectionClosed) && g.items.map((i) => {
                const active = p.isActive(i.href);
                const badge = i.href === '/dashboard/crm/website-chats' && p.webChatUnread > 0 ? p.webChatUnread : 0;
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    title={rail ? i.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className="km-navrow"
                    data-active={active ? 'true' : undefined}
                    style={{
                      ...rowBase,
                      color: active ? T.text : T.dim,
                      background: active ? 'var(--s3)' : 'transparent',
                      boxShadow: active ? `inset 2px 0 0 ${T.red}` : 'none',
                    }}
                  >
                    <span style={{ position: 'relative', display: 'flex', flexShrink: 0, color: active ? T.text : T.dim }}>
                      <NavIcon name={i.icon} size={18} />
                      {rail && badge > 0 && (
                        <span style={{ position: 'absolute', top: -5, right: -6, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 999, background: T.red, color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: T.mono, boxShadow: `0 0 0 2px ${T.panel}` }}>{badge > 9 ? '9+' : badge}</span>
                      )}
                      {rail && <NewBadge href={i.href} dot />}
                    </span>
                    {!rail && (
                      <>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.label}</span>
                        <NewBadge href={i.href} />
                        {badge > 0 && (
                          <span style={{ fontFamily: T.mono, fontSize: 11, color: '#fff', background: T.red, borderRadius: 999, padding: '1px 6px', lineHeight: 1.4 }}>{badge > 99 ? '99+' : badge}</span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Signed-in user */}
      <div ref={menuRef} style={{ position: 'relative', borderTop: `1px solid ${T.border}`, padding: rail ? '10px 0' : '10px 12px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={rail ? (p.user?.name || 'Account') : undefined}
          style={{
            width: rail ? 36 : '100%', height: rail ? 36 : 44, margin: rail ? '0 auto' : 0,
            display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 10,
            padding: rail ? 0 : '0 6px', borderRadius: T.radius.md, background: menuOpen ? 'var(--s3)' : 'transparent',
            border: 0, cursor: 'pointer', color: T.text, textAlign: 'left', fontFamily: 'inherit',
          }}
          className="km-navrow"
        >
          {p.user?.avatar_url
            ? <SignedImage src={p.user.avatar_url} alt={p.user?.name || 'Profile'} style={{ width: 30, height: 30, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
            : <Avatar name={p.user?.name} size={30} />}
          {!rail && (
            <>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.user?.name || 'Signed in'}</span>
                <span style={{ fontSize: 11, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.roleLabel || '—'}</span>
              </span>
              <ChevronsUpDown size={14} strokeWidth={1.6} style={{ color: T.mute, flexShrink: 0 }} />
            </>
          )}
        </button>

        {menuOpen && (
          <div role="menu" style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: rail ? 8 : 12, width: rail ? 200 : 'calc(100% - 24px)',
            background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.md, boxShadow: 'var(--shadow-pop)',
            padding: 6, zIndex: 20,
          }}>
            <div style={{ padding: '6px 8px 8px', borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.user?.name || 'Signed in'}</div>
              <div style={{ fontSize: 11.5, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.user?.email || p.roleLabel}</div>
            </div>
            <Link href="/dashboard/profile" role="menuitem" onClick={() => setMenuOpen(false)} className="km-navrow"
              style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 8px', borderRadius: T.radius.sm, fontSize: 13, color: T.text, textDecoration: 'none' }}>
              <UserIcon size={16} strokeWidth={1.6} style={{ color: T.dim }} /> My profile
            </Link>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); p.onLogout(); }} className="km-navrow"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 8px', borderRadius: T.radius.sm, fontSize: 13, color: T.red, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <LogOut size={16} strokeWidth={1.6} /> Sign out
            </button>
            {p.isDemo && (
              <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: T.radius.sm, background: T.redWash, fontFamily: T.mono, fontSize: 10, letterSpacing: '0.06em', color: T.red, textTransform: 'uppercase' }}>
                Demo active · mock intercept
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
