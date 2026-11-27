'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ChevronRight, Info, Menu, Search } from 'lucide-react';
import { useClient } from '../../context/ClientContext';
import { getActingAs } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import { isVanrakshakActive, VANRAKSHAK_CLIENT_ID } from '../../lib/clientFeatures';
import ClientSelect from '../ClientSelect';
import IndustryScopePicker from '../IndustryScopePicker';
import NotificationBell from '../crm/NotificationBell';
import ThemeToggle from '../shared/ThemeToggle';
import DesignToggle from '../shared/DesignToggle';
import TileEditControls from '../shared/TileEditControls';
import FontSizeToggle from '../shared/FontSizeToggle';
import SignedImage from '../shared/SignedImage';
import { Avatar, IconButton, T } from '../ui';
import { usePageTitleOverride, usePageTitleInfo, type Crumb } from '../../lib/pageTitle';
import { TOPBAR_H } from './Sidebar';

// Floating chat launcher (icon button + popup panel). Lazy so @dnd-kit /
// messaging code stays out of the shell bundle until the user opens it.
const ChatLauncher = dynamic(() => import('../messaging/ChatLauncher'), { ssr: false });

function GlobalClientFilter({ isPlatformAdmin, compact }: { isPlatformAdmin: boolean; compact: boolean }) {
  const { selectedClientId, setSelectedClientId, locked } = useClient();
  if (!isPlatformAdmin) return null;
  // While "acting as a client", the picker is pinned to that client and shows
  // its name (even before the clients list loads) instead of "All clients".
  const actingName = locked ? (getActingAs()?.name || undefined) : undefined;
  return (
    <div style={{ flexShrink: 1, minWidth: 0, maxWidth: compact ? 120 : 220 }}>
      <ClientSelect
        variant="chip"
        value={selectedClientId}
        onChange={(id) => setSelectedClientId(id)}
        placeholder="Client"
        disabled={locked}
        displayLabel={actingName}
      />
    </div>
  );
}

interface Props {
  isMobile: boolean;
  onOpenDrawer: () => void;
  crumbs: Crumb[];
  token: string;
  onOpenSearch: () => void;
  user: { name?: string; avatar_url?: string } | null;
  isPlatformAdmin: boolean;
  showClientFilter: boolean;
  /** BMW has no chat UI — suppress the floating chat launcher for them. */
  hideChat?: boolean;
}

/**
 * 56px header: the page's breadcrumb on the left (so the page title is the
 * biggest thing on screen), scope chips + tools on the right. Keeps the same
 * z-order as before so popovers (bell, chat, client picker) float over maps.
 */
export default function TopBar(p: Props) {
  const override = usePageTitleOverride();
  const overrideInfo = usePageTitleInfo();
  const crumbs: Crumb[] = override
    ? [...p.crumbs.slice(0, Math.max(0, p.crumbs.length - 1)).map((c, i, arr) => (i === arr.length - 1 && !c.href ? { ...c } : c)), { label: override }]
    : p.crumbs;

  // Browser tab title follows the breadcrumb.
  useEffect(() => {
    const last = crumbs[crumbs.length - 1]?.label;
    if (typeof document !== 'undefined' && last) document.title = `${last} · Kinematic`;
  }, [crumbs]);

  // Vanrakshak co-brand: show the client's logo in the top bar for a
  // Vanrakshak-bound user OR when a super-admin is VIEWING Vanrakshak — whether
  // via the client picker (selectedClientId) or "Login as client" (acting-as,
  // which the picker is pinned to but which isn't written to the saved picker
  // key, so `isVanrakshakActive` alone misses it). Resolved after mount because
  // these read localStorage — gating on `mounted` keeps server and first client
  // paint identical (no hydration mismatch).
  const { selectedClientId } = useClient();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const showVanrakshak = mounted && (
    isVanrakshakActive(getStoredUser()) ||
    selectedClientId === VANRAKSHAK_CLIENT_ID ||
    getActingAs()?.client_id === VANRAKSHAK_CLIENT_ID
  );

  return (
    <header
      style={{
        height: TOPBAR_H, flexShrink: 0, background: T.panel, borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: p.isMobile ? '0 12px' : '0 24px', position: 'sticky', top: 0, zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        {p.isMobile && (
          <IconButton label="Open menu" onClick={p.onOpenDrawer} style={{ marginLeft: -6 }}>
            <Menu size={20} strokeWidth={1.6} />
          </IconButton>
        )}
        {showVanrakshak && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/clients/vanrakshak-logo.png"
              alt="Vanrakshak"
              style={{ height: p.isMobile ? 22 : 28, width: 'auto', flexShrink: 0, display: 'block' }}
            />
            <span aria-hidden style={{ width: 1, height: 20, background: T.border, margin: '0 2px', flexShrink: 0 }} />
          </>
        )}
        <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 13.5 }}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {i > 0 && <ChevronRight size={14} strokeWidth={1.6} style={{ color: T.mute, flexShrink: 0 }} />}
                {c.href && !last
                  ? <Link href={c.href} style={{ color: T.dim, textDecoration: 'none', whiteSpace: 'nowrap' }} className="km-crumb">{c.label}</Link>
                  : <span style={{ color: last ? T.text : T.dim, fontWeight: last ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} aria-current={last ? 'page' : undefined}>{c.label}</span>}
              </span>
            );
          })}
        </nav>
        {overrideInfo && (
          <span
            tabIndex={0}
            role="img"
            aria-label={overrideInfo}
            title={overrideInfo}
            style={{ display: 'inline-flex', color: T.mute, flexShrink: 0, cursor: 'help' }}
          >
            <Info size={14} strokeWidth={1.8} />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: p.isMobile ? 2 : 6, flexShrink: 1, minWidth: 0 }}>
        {p.showClientFilter && <GlobalClientFilter isPlatformAdmin={p.isPlatformAdmin} compact={p.isMobile} />}
        {!p.isMobile && <IndustryScopePicker />}
        {(p.showClientFilter && p.isPlatformAdmin) && !p.isMobile && (
          <span aria-hidden style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />
        )}
        {p.token && p.isMobile && (
          <IconButton label="Search" onClick={p.onOpenSearch}>
            <Search size={18} strokeWidth={1.6} />
          </IconButton>
        )}
        {p.token && !p.hideChat && <ChatLauncher />}
        {/* Text-size + theme controls — desktop only; the phone header has no room. */}
        {!p.isMobile && <FontSizeToggle />}
        {!p.isMobile && <ThemeToggle compact />}
        {/* Classic ⇄ New design — renders only for accounts with access to the staged new design. */}
        {!p.isMobile && <DesignToggle />}
        {/* Customize layout — only in the new design, and only on a page with movable tiles. */}
        {!p.isMobile && <TileEditControls />}
        <NotificationBell />
        <Link href="/dashboard/profile" title="My account" aria-label="My account" style={{ display: 'flex', marginLeft: 4, borderRadius: 999 }}>
          {p.user?.avatar_url
            ? <SignedImage src={p.user.avatar_url} alt={p.user?.name || 'Profile'} style={{ width: 30, height: 30, borderRadius: 999, objectFit: 'cover', border: `1px solid ${T.border}` }} />
            : <Avatar name={p.user?.name} size={30} />}
        </Link>
      </div>
    </header>
  );
}
