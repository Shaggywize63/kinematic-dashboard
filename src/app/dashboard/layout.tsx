'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getStoredUser, isSessionValid, clearSession, getDesignationLabel } from '../../lib/auth';
import api, { getActingAs, setActingAs, getImpersonateUser, stopImpersonation } from '../../lib/api';
import { webChatsApi } from '../../lib/webChatsApi';
import { WHATS_NEW, markSectionSeen } from '../../lib/whatsNew';
import StagingBoot from './StagingBoot';
import StagingDeployModal from './StagingDeployModal';
import { getStoredProjectKey } from '../../lib/projects';
import { ClientProvider } from '../../context/ClientContext';
import { CityScopeProvider } from '../../context/CityScopeContext';
import { IndustryScopeProvider } from '../../context/IndustryScopeContext';
import { useNavPrefs, applyNavOrder } from '../../lib/navPrefs';
import { deriveCrumbs } from '../../lib/pageTitle';
import Sidebar, { SIDEBAR_W, SIDEBAR_RAIL_W } from '../../components/dashboard/Sidebar';
import TopBar from '../../components/dashboard/TopBar';

// KINI chat is ~250 lines + 4 card components + markdown helpers; load it on
// demand so the main dashboard JS stays lean. ssr:false avoids hydration cost.
const KinematicAI = dynamic(() => import('../../components/KinematicAI'), { ssr: false });
// Sidebar "Customise menu" editor (drag-to-reorder). Only mounted when the
// user opens it, so @dnd-kit stays out of the main dashboard bundle.
const SidebarEditor = dynamic(() => import('../../components/dashboard/SidebarEditor'), { ssr: false });
// Global smart-search command palette (⌘/Ctrl-K). Lazy — only pulled in when
// the shell mounts; the panel itself renders nothing until opened.
const SmartSearch = dynamic(() => import('../../components/shared/SmartSearch'), { ssr: false });


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
  // Super-admin "acting as client" context (set from Client Management → Login).
  // Resolved after mount to avoid SSR hydration mismatch.
  const [actingAs, setActingAsState] = useState<{ name?: string; modules?: string[]; staging?: boolean; project?: string; org_id?: string } | null>(null);
  const [showDeploy, setShowDeploy] = useState(false);
  useEffect(() => { setActingAsState(getActingAs()); }, []);
  // Master-admin user impersonation ("Viewing as <user>"). Resolved after mount
  // to avoid SSR hydration mismatch. Drives the fixed top banner below.
  const [impersonate, setImpersonateState] = useState<{ id: string; name?: string; email?: string } | null>(null);
  useEffect(() => { setImpersonateState(getImpersonateUser()); }, []);
  const stagingProject = actingAs?.project || getStoredProjectKey() || 'default';
  // Per-org UI flags (e.g. hide the global client filter). Re-fetched on mount;
  // entering an org triggers a full reload so this reflects the current org.
  const [hideClientFilter, setHideClientFilter] = useState(false);
  useEffect(() => { (async () => {
    try {
      const r: any = await api.get('/api/v1/org-settings/ui-flags');
      const d = r?.data ?? r;
      const hide = !!d?.hide_client_filter;
      setHideClientFilter(hide);
      if (typeof window !== 'undefined') {
        if (hide) {
          // The org hides the global client filter → no client scope should be
          // sent. Persist a flag api.ts reads BEFORE attaching X-Client-Id, and
          // drop any stale selection (+ its cached responses) so the admin sees
          // the full org instead of whatever client was last picked.
          window.localStorage.setItem('kinematic_hide_client_filter', '1');
          if (window.localStorage.getItem('kinematic_selected_client')) {
            window.localStorage.removeItem('kinematic_selected_client');
            Object.keys(window.localStorage).filter((k) => k.startsWith('kapi:')).forEach((k) => window.localStorage.removeItem(k));
          }
        } else {
          window.localStorage.removeItem('kinematic_hide_client_filter');
        }
      }
    }
    catch { /* default: show */ }
  })(); }, []);
  // Persist the desktop collapse preference so the rep gets the same
  // sidebar width on every reload. Mobile uses a hamburger drawer and
  // ignores this flag.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem('kin_sidebar_collapsed');
      if (v === '1') setCollapsed(true);
    } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('kin_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [otherOpen, setOtherOpen] = useState(false);
  const [token, setToken] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Per-user sidebar customisation (drag-to-reorder sections + items). The
  // saved order is applied to the entitlement-filtered nav below; the editor
  // modal opens from the "Customise" button in the nav.
  const [editingNav, setEditingNav] = useState(false);
  const [navQuery, setNavQuery] = useState('');
  // Global smart-search command palette open state (⌘/Ctrl-K, and the header
  // Search button). See the keydown effect below.
  const [searchOpen, setSearchOpen] = useState(false);
  const { prefs: navPrefs, save: saveNavPrefs, reset: resetNavPrefs } = useNavPrefs(user?.id ?? null);
  // True once /auth/me has resolved. Until then, if the cached profile has no
  // explicit permissions, we hold the role-gated nav back to avoid a flash of
  // modules (e.g. Settings) the user shouldn't see.
  const [hydrated, setHydrated] = useState(false);
  const isMobile = useIsMobile(1024);
  const router = useRouter();
  const pathname = usePathname();

  // Clear a section's "New" highlight once the viewer opens it (this route or
  // any sub-route of it). Runs on every navigation; the badges recompute on the
  // resulting re-render.
  useEffect(() => {
    if (!pathname) return;
    for (const key of Object.keys(WHATS_NEW)) {
      if (pathname === key || pathname.startsWith(key + '/')) markSectionSeen(key);
    }
  }, [pathname]);

  // Global ⌘/Ctrl-K toggles the smart-search command palette from anywhere in
  // the dashboard. preventDefault stops the browser's own bookmark shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !isSessionValid()) { clearSession(); router.push('/login'); return; }
    // Force a password change before the app is usable. Redirect fast off the
    // cached flag; the /auth/me refresh below re-checks for sessions that
    // pre-date the flag (existing users flagged by the backfill).
    if ((u as any).must_change_password) { router.replace('/set-password'); return; }
    setUser(u);
    if (typeof window !== 'undefined') {
      setToken(localStorage.getItem('kinematic_token') || '');
      // Register the push service worker once per dashboard session so a
      // user who already granted notification permission keeps receiving
      // them without visiting /dashboard/inbox first.
      void import('../../lib/webPush').then((wp) => wp.registerServiceWorker()).catch(() => { /* ignore */ });
    }
    (async () => {
      try {
        const fresh: any = await api.get('/api/v1/auth/me');
        const next = fresh?.data ?? fresh;
        if (next && (next.enabled_modules || next.enabled_packages)) {
          try {
            localStorage.setItem('kinematic_user', JSON.stringify(next));
          } catch { /* ignore */ }
          // Existing users flagged by the backfill won't have the flag on
          // their cached profile — catch it here on the fresh /me and force
          // the set-password screen.
          if (next.must_change_password) { router.replace('/set-password'); return; }
          setUser(next);
        }
      } catch { /* keep cached user */ }
      finally { setHydrated(true); }
    })();
  }, [router]);

  const handleLogout = () => { clearSession(); router.push('/login'); };
  const userRole = user?.role || '';
  const userPerms = user?.permissions || [];

  // ── Website-chat unread badge (super-admin only) ──────────────────────────
  // The public-site KINI chatbot has no server-side read flag, so "new" means
  // any conversation whose last_seen_at is newer than the last time this admin
  // opened the Website Chats page (persisted in localStorage). Poll every 60s;
  // the badge clears the moment the page is opened. Purely additive — the item
  // itself is already super-admin-only in the nav.
  const [webChatUnread, setWebChatUnread] = useState(0);
  const isSuperAdminRole = (userRole || '').toLowerCase().replace(/-/g, '_') === 'super_admin';
  useEffect(() => {
    if (!isSuperAdminRole) { setWebChatUnread(0); return; }
    let alive = true;
    const SEEN_KEY = 'kinematic_webchats_seen_at';
    const readSeen = (): number => {
      try {
        const v = localStorage.getItem(SEEN_KEY);
        if (v) return Number(v) || 0;
        // First run: baseline to now so we only flag genuinely NEW activity,
        // never light up with the entire backlog of historical conversations.
        const now = Date.now();
        localStorage.setItem(SEEN_KEY, String(now));
        return now;
      } catch { return Date.now(); }
    };
    const poll = async () => {
      try {
        const { rows } = await webChatsApi.list({ limit: 50 });
        if (!alive) return;
        const seen = readSeen();
        const n = rows.reduce((acc, r) => {
          const t = new Date(r.last_seen_at || r.created_at).getTime();
          return acc + (Number.isFinite(t) && t > seen ? 1 : 0);
        }, 0);
        setWebChatUnread(n);
      } catch { /* transient — keep the last known count */ }
    };
    poll();
    const id = setInterval(poll, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [isSuperAdminRole]);

  // Clear the badge the moment the admin opens the Website Chats surface.
  useEffect(() => {
    if (pathname.startsWith('/dashboard/crm/website-chats')) {
      try { localStorage.setItem('kinematic_webchats_seen_at', String(Date.now())); } catch { /* ignore */ }
      setWebChatUnread(0);
    }
  }, [pathname]);
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
  // Exact-match hrefs: the root '/dashboard' AND the planogram Overview
  // ('/dashboard/planograms'). The latter is a *prefix* of every other
  // planogram route (/captures, /review, /library, …), so a plain
  // `startsWith` would keep Overview highlighted on all those sub-pages.
  // Match those two only when the path is exactly them; everything else
  // keeps the normal prefix match.
  const isActive = (href: string) =>
    (href === '/dashboard' || href === '/dashboard/planograms')
      ? pathname === href
      : pathname.startsWith(href);
  const sideW = isMobile ? 0 : (collapsed ? SIDEBAR_RAIL_W : SIDEBAR_W);
  const sidebarVisible = isMobile ? drawerOpen : true;

  useEffect(() => { if (isMobile) setDrawerOpen(false); }, [pathname, isMobile]);

  const isPlatformAdmin = (() => {
    // Same camelCase/snake_case defence as tataActive below — a Tata
    // sub_admin whose session returns `clientId` (not `client_id`)
    // would otherwise be incorrectly treated as a platform admin
    // and the role-gated nav (and the Tata hide list) would mis-apply.
    if ((user as any)?.client_id || (user as any)?.clientId) return false;
    const role = (userRole || '').toLowerCase().trim().replace(/-/g, '_');
    const name = (user?.name || '').toLowerCase().trim();
    return ['super_admin', 'admin', 'main_admin', 'sub_admin', 'master_admin'].includes(role) ||
           role.includes('admin') ||
           name === 'sagar';
  })();

  const isSuperAdmin = (userRole || '').toLowerCase().replace(/-/g, '_') === 'super_admin';

  // A scoped, read-only cross-tenant VIEWER (e.g. the SRS + BMW "Lead Viewer"
  // account). Such a user IS treated as a platform admin for the client picker
  // — it must switch between the tenants it may view — but must NOT inherit the
  // platform-admin nav bypass: its sidebar is gated to the modules its org_role
  // grants, exactly like an ordinary rep. Detected as read-only + non-super_admin
  // (a read-only super_admin, the older look-but-don't-touch account, keeps full
  // nav). This is the ONLY thing that un-bypasses the platform-admin nav below.
  const isViewer = !!(user?.is_read_only) && !isSuperAdmin;

  // Only build the nav once we can trust the permission set. Platform admins
  // and cached profiles that already carry permissions render immediately;
  // everyone else waits for the fresh /auth/me so role-gated items don't flash.
  const cachedHasPerms = Array.isArray(user?.permissions) && (user!.permissions as string[]).length > 0;
  const navReady = hydrated || isPlatformAdmin || cachedHasPerms;

  const hasModule = (m: string) => {
    if (!m) return true;
    // Two independent gates must BOTH pass:
    //   1. Entitlement — the client must own the module SKU.
    //   2. Role grant — the user's designation must include the module.
    // Previously an entitlement alone was sufficient, so every user in an
    // entitled client saw modules (e.g. Settings) their role omitted. We now
    // intersect: when the user has an explicit permission set, the module must
    // be in it; legacy accounts with no granular permissions fall back to the
    // entitlement so they aren't locked out.
    // Supply Chain & Distribution is a paid SKU: NEVER grant its modules via the
    // empty-entitlement fallback — they must be explicitly present. (Every other
    // module keeps the legacy "empty = allow" behaviour for un-provisioned
    // sessions.) This stops SCM leaking in by default.
    const isSellableDist = m === 'distribution' || m.startsWith('distribution_');
    const entitled = isSellableDist
      ? enabledModules.includes(m)
      : (enabledModules.length === 0 || enabledModules.includes(m));
    if (!entitled) return false;
    if (userPerms.length > 0) return userPerms.includes(m);
    return true;
  };

  // Detect the active Tata Tiscon scope so we can hide the Home nav
  // entry for now. Users pinned to Tata (client_id in JWT) always count;
  // super-admins viewing-as-Tata via the picker also count, so the
  // experience is consistent with whichever scope the rep is in.
  // selectedClientId lives on the ClientProvider context which is
  // mounted further down the tree, so we read the persisted picker
  // value off localStorage directly — same key the api client uses.
  const TATA_TISCON_CLIENT_ID = 'a1f67468-526e-4734-be3a-2cb132cc2804';
  // Read client_id defensively: the /auth/me endpoint has historically
  // returned both snake_case (`client_id`) and camelCase (`clientId`)
  // depending on which controller path normalised the user record. If
  // we only checked `client_id`, a logged-in Tata rep whose session
  // happened to carry `clientId` would silently fall through to the
  // generic nav (Contacts / Accounts / Email-* re-appearing) — exactly
  // the bug Sagar reported on Hema's session.
  const u = user as any;
  const userClientId = (u?.client_id || u?.clientId) as string | undefined;
  const [pickerClientId, setPickerClientId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setPickerClientId(localStorage.getItem('kinematic_selected_client')); }
    catch { /* ignore — storage disabled */ }
  }, []);
  // Re-read the picker on every window focus too — the API client
  // store updates `kinematic_selected_client` synchronously, but if
  // the rep switches tenants in another tab the layout would
  // otherwise keep the stale value until a full reload.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => {
      try { setPickerClientId(localStorage.getItem('kinematic_selected_client')); }
      catch { /* ignore */ }
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const tataActive = userClientId === TATA_TISCON_CLIENT_ID || pickerClientId === TATA_TISCON_CLIENT_ID;
  // The Kaiyo/TATA production org (internally "Horizon", org id
  // 00000000-…-0001). Its only real client is TATA Tiscon (a1f67468), but
  // the org also has a super-admin and a login "client" account that carry
  // a NULL client_id and so slip past the client-scoped `tataActive` check
  // above. Gating on the org id too ensures `hiddenForTata` items are
  // removed for the WHOLE org, not just its client-pinned reps.
  const KAIYO_TATA_ORG_ID = '00000000-0000-0000-0000-000000000001';
  const userOrgId = (u?.org_id || u?.orgId) as string | undefined;
  const tataOrgActive = userOrgId === KAIYO_TATA_ORG_ID || (actingAs as any)?.org_id === KAIYO_TATA_ORG_ID;
  // Combined driver for the tenant hide list: bound client, super-admin
  // picker, OR membership in the Kaiyo/TATA org.
  const tataHideActive = tataActive || tataOrgActive;
  // Parent Kinematic tenant — trims CRM surfaces it doesn't use. Same
  // bound-client-OR-picker logic as Tata above.
  const KINEMATIC_CLIENT_ID = '7ecd47d7-9268-4ea2-a8ce-384978c13667';
  const kinematicActive = userClientId === KINEMATIC_CLIENT_ID || pickerClientId === KINEMATIC_CLIENT_ID;
  // PM Corporation — a lean van-sales distribution + field-force demo tenant.
  // Hides Lead Management, Business, People & Support and the Distribution →
  // Integrations item. Driven by PMC's client OR org id (same bound-client-OR-
  // picker-OR-org membership logic used for Tata above).
  const PMC_CLIENT_ID = 'c0000000-0000-4000-a000-000000000002';
  const PMC_ORG_ID = 'c0000000-0000-4000-a000-000000000001';
  const pmcHideActive =
    userClientId === PMC_CLIENT_ID || pickerClientId === PMC_CLIENT_ID ||
    userOrgId === PMC_ORG_ID || (actingAs as any)?.org_id === PMC_ORG_ID;
  // MoiSoi — a retail-execution (planogram) demo tenant. Hides the Business
  // and People & Support sections wholesale (it doesn't use them). Driven by
  // MoiSoi's client OR org id (same bound-client-OR-picker-OR-org membership
  // logic used for PMC/Tata above), so the MoiSoi client-admin is covered too.
  const MOISOI_CLIENT_ID = 'd0000000-0000-4000-a000-000000000002';
  const MOISOI_ORG_ID = 'd0000000-0000-4000-a000-000000000001';
  const moisoiHideActive =
    userClientId === MOISOI_CLIENT_ID || pickerClientId === MOISOI_CLIENT_ID ||
    userOrgId === MOISOI_ORG_ID || (actingAs as any)?.org_id === MOISOI_ORG_ID;

  const filterNav = (items: any[]) => {
    const visibleAfterRole = items.filter((i) => !i.superAdminOnly || isSuperAdmin);
    // Hide demo-only nav items (e.g. the Nurturing module preview) for
    // every account except demo@kinematic.com. Real customers shouldn't
    // see a half-built feature surfaced as if it's ready.
    const visibleAfterDemo = visibleAfterRole.filter(
      (i) => !i.demoOnly || user?.email === 'demo@kinematic.com'
    );
    // Tenant-specific hide list. Each item can opt-in via `hiddenForTata`.
    // Driven by client OR org membership so the whole Kaiyo/TATA org is covered.
    const visibleAfterTata = visibleAfterDemo.filter((i) => !(i.hiddenForTata && tataHideActive));
    // Parent Kinematic tenant hide list (opt-in via `hiddenForKinematic`).
    const visibleAfterKinematic = visibleAfterTata.filter((i) => !(i.hiddenForKinematic && kinematicActive));
    // PM Corporation hide list (opt-in via `hiddenForPMC`, e.g. Integrations).
    const visibleAfterPmc = visibleAfterKinematic.filter((i) => !(i.hiddenForPMC && pmcHideActive));
    // While acting-as a client (super-admin "Login as"), restrict the nav to
    // the modules granted to that client in Client Management — even though the
    // impersonated account itself may be a full admin in its own project.
    const actingModules = actingAs?.modules;
    const scoped = Array.isArray(actingModules) && actingModules.length
      ? visibleAfterPmc.filter(i => !i.module || actingModules.includes(i.module))
      : visibleAfterPmc;
    // Scoped viewers are gated to their granted modules (fall through to
    // hasModule); only a true platform admin gets the unfiltered nav.
    if (isPlatformAdmin && !isViewer) return scoped;
    return scoped.filter(i => hasModule(i.module));
  };

  const isCrmOnlyClient =
    !isPlatformAdmin &&
    enabledPackages.includes('crm') &&
    !enabledPackages.includes('field_force') &&
    !enabledPackages.includes('distribution');

  const sectionVisible = (pkg: string | undefined, items: any[]) => {
    if (items.length === 0) return false;
    if (!pkg) return true;
    // Planogram section — a promoted group whose items are ALL
    // `module:'planograms'`. Its visibility is driven purely by that module,
    // NOT by a package SKU (there is no 'planograms' entry in
    // `enabled_packages`). `filterNav` has already dropped every item the
    // user/tenant can't access, so a non-empty item list here means the
    // planograms module is enabled (or the viewer is a platform admin, who
    // should always see it) — mirroring exactly where the old single
    // Field-Force "Planograms" item used to appear. Returned early so the
    // section is NEVER wholesale-hidden for MoiSoi (the planogram demo
    // tenant), whose only wholesale hides are Business + People & Support.
    if (pkg === 'planograms') return true;
    // PM Corporation: lean distribution + field-force nav — drop Lead
    // Management, Business and People & Support sections wholesale.
    if (pmcHideActive && ['crm', 'business', 'people'].includes(pkg)) return false;
    // MoiSoi: retail-execution demo tenant — drop the Business and People &
    // Support sections wholesale. Placed before the platform-admin bypass
    // below so the MoiSoi client-admin loses them too, not just its reps.
    if (moisoiHideActive && ['business', 'people'].includes(pkg)) return false;
    // Supply Chain & Distribution is a paid SKU — its whole section is
    // deny-by-default. Show it ONLY when 'distribution' is an explicitly
    // enabled package. Placed BEFORE the platform-admin and empty-packages
    // bypasses below so a tenant/client-admin (isPlatformAdmin, but with a
    // client_id-less org-admin role) doesn't get SCM leaking in by default.
    // The true platform operator (super_admin) is exempt so support/config
    // still sees every section; while a super-admin is "Login as" a client,
    // filterNav has already scoped the items to that client's modules.
    if (pkg === 'distribution' && !isSuperAdmin && !enabledPackages.includes('distribution')) return false;
    // A scoped viewer shows a section only if it contains at least one module
    // its role grants — so the SRS+BMW Lead Viewer sees just the CRM section.
    if (isViewer) return items.some((i: any) => hasModule(i.module));
    if (isPlatformAdmin) return true;
    // CRM-only clients hide every non-CRM section. A universal item may opt
    // back in via `crmVisible`, but NOTHING is flagged `crmVisible` today (Leave
    // used to be, and was removed so People & Support disappears entirely for
    // these tenants), so this currently resolves to `false` for every non-CRM
    // package — i.e. a CRM-only client sees only the CRM section. The hook is
    // kept so a future must-show universal can be re-surfaced without new logic.
    if (isCrmOnlyClient && pkg !== 'crm') return items.some((i: any) => i.crmVisible);
    if (['business', 'system', 'people', 'audit'].includes(pkg)) return true;
    if (enabledPackages.length === 0) return true;
    return enabledPackages.includes(pkg);
  };

  // WhatsApp keeps its brand glyph as a raw path (NavIcon draws unknown names as paths).
  const ICON_WHATSAPP = 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z';

  // KEEP-IN-SYNC: every `module` ID below MUST exist in `ALL_MODULES`
  // (src/lib/modules.ts). The module access checklist (settings/page.tsx,
  // settings/roles/page.tsx, clients/page.tsx) renders permissions from
  // ALL_MODULES — a menu item whose module ID is missing from that list
  // cannot be granted to anyone and will silently disappear from the nav
  // for non-super-admin roles.
  const rawNavGroups = [
    { label: 'Field Force', package: 'field_force', items: [
      { href: '/dashboard',                              label: 'Dashboard',           icon: 'home', module: 'dashboard' },
      { href: '/dashboard/attendance-overview',          label: 'Attendance',          icon: 'calendarCheck', module: 'attendance' },
      { href: '/dashboard/analytics',                    label: 'Analytics',           icon: 'analytics', module: 'analytics' },
      { href: '/dashboard/live-tracking',                label: 'Live Trailing',       icon: 'mapPinned', module: 'live_tracking' },
      { href: '/dashboard/other-management/activities',  label: 'Activity Management', icon: 'activity', module: 'activities' },
      { href: '/dashboard/form-builder',                 label: 'Form Builder',        icon: 'clipboard', module: 'form_builder' },
      { href: '/dashboard/route-plan',                   label: 'Route Plan',          icon: 'route', module: 'orders' },
      { href: '/dashboard/beat-productivity',            label: 'Beat Productivity',   icon: 'trending', module: 'beat_productivity' },
      { href: '/dashboard/work-activities',              label: 'Work Activities',     icon: 'listChecks', module: 'work_activities' },
      // FFM Reports hub — parity with the Lead Management Reports entry
      // a few groups down. Surfaces attendance, visit coverage, hours &
      // idle time, route adherence, and the rep leaderboard in one place
      // so admins don't have to hop between sidebar surfaces to build a
      // monthly review pack.
      { href: '/dashboard/ffm-reports',                  label: 'Reports',             icon: 'fileText', module: 'ffm_reports' },
    ]},
    // Planogram — retail-execution module, promoted from a single Field-Force
    // item to its own section. Every item is `module:'planograms'` so the
    // whole group is gated exactly like the old single item (visible wherever
    // the planograms module is enabled, including MoiSoi). The `planograms`
    // package is NOT an entitlement SKU — sectionVisible() special-cases it to
    // show whenever the module-gated items survive filterNav (see above).
    { label: 'Planogram', package: 'planograms', items: [
      { href: '/dashboard/planograms',             label: 'Overview',     icon: 'dashboard', module: 'planograms' },
      { href: '/dashboard/planograms/captures',    label: 'Captures',     icon: 'camera', module: 'planograms' },
      { href: '/dashboard/planograms/review',      label: 'Review queue', icon: 'clipboardCheck', module: 'planograms' },
      { href: '/dashboard/planograms/library',     label: 'Planograms',   icon: 'layers', module: 'planograms' },
      { href: '/dashboard/planograms/competitors', label: 'Competitors',  icon: 'target', module: 'planograms' },
      { href: '/dashboard/planograms/insights',    label: 'Insights',     icon: 'lineChart', module: 'planograms' },
    ]},
    { label: 'Lead Management', package: 'crm', items: [
      // Daily mission control — target + near-to-close + next actions
      // + productivity tips. Mounted above Dashboard so reps land on
      // their action list, not the analytics widgets.
      // Hidden for Tata Tiscon (a1f67468-…) while the surface is
      // being tuned for their consumer-only workflow; reachable on
      // every other tenant. Toggle the `tataHideKeys` filter below.
      { href: '/dashboard/crm/home',             label: 'Home',           icon: 'home', module: 'crm_dashboard', hiddenForTata: true },
      { href: '/dashboard/crm/dashboard',        label: 'Dashboard',      icon: 'dashboard', module: 'crm_dashboard' },
      { href: '/dashboard/crm/leads',            label: 'Leads',          icon: 'users', module: 'crm_leads' },
      { href: '/dashboard/crm/leads/analytics',  label: 'Lead Analytics', icon: 'lineChart', module: 'crm_leads' },
      // Conversation Analysis — positioned directly under the lead entries:
      // managers review consented sales / service calls (transcript +
      // diarization + AI insights). Gated by crm_conversation_intel; hidden
      // for the Kaiyo/TATA org.
      { href: '/dashboard/crm/conversations',    label: 'Conversation Analysis', icon: 'mic', module: 'crm_conversation_intel', hiddenForTata: true },
      { href: '/dashboard/crm/market-intelligence', label: 'Market Intelligence', icon: 'trending', module: 'crm_lead_analytics' },
      { href: '/dashboard/crm/contacts',         label: 'Contacts',       icon: 'contact', module: 'crm_contacts', hiddenForTata: true },
      // Address book for dealers / influencers / referrers — per-client,
      // CRM-Admin gated (the entitlement key matches the module the
      // backend's requireModuleAccess gate honours).
      { href: '/dashboard/crm/people-directory', label: 'People Directory', icon: 'book', module: 'crm_people_directory', hiddenForKinematic: true },
      { href: '/dashboard/crm/accounts',         label: 'Accounts',       icon: 'building', module: 'crm_accounts', hiddenForTata: true },
      { href: '/dashboard/crm/deals',            label: 'Deals',          icon: 'rupee', module: 'crm_deals' },
      { href: '/dashboard/crm/pipeline',         label: 'Pipeline',       icon: 'kanban', module: 'crm_pipeline' },
      { href: '/dashboard/crm/products',         label: 'Products',       icon: 'package', module: 'crm_products', hiddenForKinematic: true },
      { href: '/dashboard/crm/activities',       label: 'Activities',     icon: 'clipboardCheck', module: 'crm_activities' },
      { href: '/dashboard/crm/whatsapp',         label: 'WhatsApp',       icon: ICON_WHATSAPP, module: 'crm_whatsapp' },
      { href: '/dashboard/crm/campaigns',        label: 'Campaigns',      icon: 'megaphone', module: 'crm_whatsapp' },
      { href: '/dashboard/crm/email-campaigns',  label: 'Email Campaigns', icon: 'send', module: 'crm_email', hiddenForTata: true },
      // KINI website-chatbot conversations from kinematicapp.com + the leads
      // they capture. This is the Kinematic platform's own website funnel, so
      // it's restricted to the Kinematic super admin — no client tenant (BMW,
      // Tata, …) or client-admin should see it. `superAdminOnly` already
      // subsumes the old `hiddenForTata` gate (no super admin is on Tata).
      { href: '/dashboard/crm/website-chats',    label: 'Website Chats',  icon: 'chatText', module: 'crm_dashboard', superAdminOnly: true },
      // Email alerts + verified senders — the marketing-side email surface.
      // Templates live at the existing /crm/email-templates page; alerts
      // composes them with a verified From + scheduler.
      { href: '/dashboard/crm/email-alerts',     label: 'Email Alerts',   icon: 'mailPlus', module: 'crm_email', hiddenForTata: true },
      { href: '/dashboard/crm/email-templates',  label: 'Email Templates', icon: 'fileText', module: 'crm_email', hiddenForTata: true },
      { href: '/dashboard/crm/email-senders',    label: 'Email Senders',  icon: 'mailCheck', module: 'crm_email', hiddenForTata: true },
      { href: '/dashboard/crm/reports',          label: 'Reports',        icon: 'fileSheet', module: 'crm_reports' },
      { href: '/dashboard/crm/settings',         label: 'Settings',       icon: 'settings', module: 'crm_settings' },
      { href: '/dashboard/crm/help',             label: 'Help',           icon: 'help', module: 'crm_dashboard' },
    ]},
    { label: 'Distribution', package: 'distribution', items: [
      { href: '/dashboard/distribution/control-tower',    label: 'Control Tower', icon: 'gauge', module: 'distribution' },
      { href: '/dashboard/distribution/ai',               label: 'AI Copilot',    icon: 'sparkles', module: 'distribution' },
      { href: '/dashboard/distribution/setup',            label: 'Network Setup', icon: 'network', module: 'distribution' },
      { href: '/dashboard/distribution',                  label: 'Overview',     icon: 'dashboard', module: 'distribution' },
      { href: '/dashboard/distribution/brands',           label: 'Brands',       icon: 'tag', module: 'distribution_brands' },
      { href: '/dashboard/distribution/distributors',     label: 'Distributors', icon: 'truck', module: 'distribution_distributors' },
      { href: '/dashboard/distribution/receivables',       label: 'Receivables',  icon: 'wallet', module: 'distribution_distributors' },
      { href: '/dashboard/distribution/price-lists',      label: 'Price Lists',  icon: 'receipt', module: 'distribution_pricing' },
      { href: '/dashboard/distribution/schemes',          label: 'Schemes',      icon: 'badgePercent', module: 'distribution_schemes' },
      { href: '/dashboard/distribution/promotions',       label: 'Promotions',   icon: 'gift', module: 'distribution_promotions' },
      { href: '/dashboard/distribution/orders',           label: 'Orders',       icon: 'cart', module: 'distribution_orders' },
      { href: '/dashboard/distribution/invoices',         label: 'Invoices',     icon: 'fileText', module: 'distribution_invoicing' },
      { href: '/dashboard/distribution/dispatches',       label: 'Dispatches',   icon: 'send', module: 'distribution_invoicing' },
      { href: '/dashboard/distribution/payments',         label: 'Payments',     icon: 'creditCard', module: 'distribution_payments' },
      { href: '/dashboard/distribution/returns',          label: 'Returns',      icon: 'undo', module: 'distribution_returns' },
      { href: '/dashboard/distribution/ledger',           label: 'Ledger',       icon: 'book', module: 'distribution_ledger' },
      { href: '/dashboard/distribution/van-loads',        label: 'Van Sales',    icon: 'truck', module: 'distribution_van' },
      { href: '/dashboard/distribution/claims',           label: 'Claims',       icon: 'claims', module: 'distribution_claims' },
      { href: '/dashboard/distribution/reconciliation',   label: 'Reconciliation', icon: 'swap', module: 'distribution_reconciliation' },
      { href: '/dashboard/distribution/secondary-sales',  label: 'Consumer',     icon: 'store', module: 'distribution_consumer' },
      // Last-mile dashboards (Phase 1): retailer → consumer visibility.
      { href: '/dashboard/distribution/last-mile',                  label: 'Last Mile',          icon: 'route', module: 'distribution_consumer' },
      { href: '/dashboard/distribution/last-mile/consumers',        label: 'Consumer Registry',  icon: 'users', module: 'distribution_consumer' },
      { href: '/dashboard/distribution/last-mile/tertiary-sales',   label: 'Retailer Sales',     icon: 'check', module: 'distribution_consumer' },
      { href: '/dashboard/distribution/capture',                    label: 'Consumer Capture',   icon: 'camera', module: 'distribution_consumer' },
      { href: '/dashboard/distribution/integrations',     label: 'Integrations', icon: 'link', module: 'distribution', hiddenForPMC: true },
    ]},
    // Supply Chain — the stock/inventory surface, unified in one section.
    // package:'business' keeps it universal (always-visible, and hidden
    // wholesale for the same MoiSoi/PMC/CRM-only tenants as the old Business
    // section — no access change). The universal masters (Warehouse/SKU/Asset)
    // always show; the distribution_* items self-gate deny-by-default via
    // filterNav, so they appear only for clients granted those SCM modules.
    { label: 'Supply Chain', package: 'business', items: [
      { href: '/dashboard/warehouse',                label: 'Warehouse',      icon: 'warehouse', module: 'inventory' },
      { href: '/dashboard/other-management/skus',    label: 'SKU Management', icon: 'boxes', module: 'skus' },
      { href: '/dashboard/other-management/assets',  label: 'Assets',         icon: 'package', module: 'assets' },
      { href: '/dashboard/distribution/stock',       label: 'Distributor Stock', icon: 'packageCheck', module: 'distribution_stock' },
      { href: '/dashboard/distribution/batches',     label: 'Batch & Expiry', icon: 'timer', module: 'distribution_batches' },
      { href: '/dashboard/distribution/damage',      label: 'Damaged / Expiry', icon: 'packageX', module: 'distribution_damage' },
    ]},
    { label: 'Business', package: 'business', items: [
      { href: '/dashboard/clients',                  label: 'Clients',   icon: 'briefcase', module: 'clients' },
    ]},
    { label: 'People & Support', package: 'people', items: [
      { href: '/dashboard/manpower-directory', label: 'Users',         icon: 'users', module: 'users' },
      { href: '/dashboard/hr',                 label: 'HR & Recruitment', icon: 'userPlus', module: 'hr' },
      // Leave Management + Attendance Regularization. The top-level entry is
      // universal (every rep applies for leave / sees their balances). The
      // Approvals + Settings surfaces inside the module self-gate to manager /
      // admin via useLeaveRoles, so they never render for a plain field rep.
      // `leave` is a universal module so it can't be revoked via entitlement.
      // The entire People & Support section is now hidden for CRM-only clients
      // (BMW, SRS, and every new lean-CRM tenant), so Leave carries NO
      // `crmVisible` — it must not survive into a CRM-only tenant's nav. Full
      // field-force tenants still see it; `hiddenForTata` removes it for the
      // Kaiyo/TATA org among those.
      { href: '/dashboard/leave',              label: 'Leave',         icon: 'calendar', module: 'leave', hiddenForTata: true },
      // Field Expense / Travel Claims. Non-universal (entitlement-gated), so it
      // only appears for clients granted `field_expenses` — hidden for Tata and
      // any tenant without the grant automatically (no hiddenForTata needed).
      { href: '/dashboard/expenses',           label: 'Expenses',      icon: 'banknote', module: 'field_expenses' },
      { href: '/dashboard/grievances',         label: 'Grievances',    icon: 'alert', module: 'grievances' },
      { href: '/dashboard/visit-logs',         label: 'Visit Logs',    icon: 'mapPin', module: 'visit_logs' },
      { href: '/dashboard/broadcast',          label: 'Broadcast',     icon: 'radio', module: 'broadcast' },
      { href: '/dashboard/notifications',      label: 'Notifications', icon: 'bell', module: 'notifications' },
    ]},
    { label: 'System Management', package: 'system', items: [
      { href: '/dashboard/other-management/cities',  label: 'Cities',          icon: 'landmark', module: 'cities' },
      { href: '/dashboard/other-management/zones',   label: 'Zones',           icon: 'map', module: 'zones' },
      { href: '/dashboard/other-management/stores',  label: 'Outlets',         icon: 'store', module: 'stores' },
      { href: '/dashboard/security-alerts',          label: 'Security Alerts', icon: 'shield', module: 'security_alerts' },
      { href: '/dashboard/settings',                 label: 'Settings',        icon: 'settings', module: 'settings' },
    ]},
    // Messaging is surfaced as a floating chat box at the bottom-right of
    // every dashboard page (see ChatLauncher) — there is intentionally no
    // sidebar entry. The full-page /dashboard/inbox route still works for
    // direct links from notifications but isn't promoted in the nav.
    { label: 'Audit', package: 'audit', items: [
      { href: '/dashboard/audit-log', label: 'Activity Log', icon: 'audit', module: 'audit_log', superAdminOnly: true },
      { href: '/dashboard/audit-log/messages', label: 'Message Log', icon: 'chat', module: 'audit_log', superAdminOnly: true },
    ]},
  ];

  const navGroups = !navReady ? [] : rawNavGroups
    .map(g => {
      let items = filterNav(g.items);
      // A CRM-only client hides non-CRM sections wholesale. Only universal
      // items flagged `crmVisible` would survive — but none are flagged today
      // (Leave's flag was removed so People & Support no longer leaks into
      // CRM-only tenants like BMW / SRS), so this filters every non-CRM section
      // down to an empty list, and sectionVisible then drops it entirely.
      if (isCrmOnlyClient && g.package && g.package !== 'crm') {
        items = items.filter((i: any) => i.crmVisible);
      }
      return { ...g, items };
    })
    .filter(g => sectionVisible(g.package, g.items));

  // Apply the user's saved section/item order on top of the entitlement-
  // filtered nav. Unknown (newly added) sections/items append after the
  // remembered ones, so a saved order never hides anything.
  const orderedNavGroups = applyNavOrder(navGroups, navPrefs);
  // Header breadcrumb: derived from the route + the user's own nav labels.
  const crumbs = deriveCrumbs(pathname, navReady ? orderedNavGroups : rawNavGroups);
  // Sidebar menu search — filter items by label; drop groups with no match.
  const navFilter = navQuery.trim().toLowerCase();
  const displayNavGroups = navFilter
    ? orderedNavGroups
        .map((g) => ({ ...g, items: (g.items as any[]).filter((i: any) => (i.label || '').toLowerCase().includes(navFilter)) }))
        .filter((g) => g.items.length > 0)
    : orderedNavGroups;

  // Collapsible nav sections (Field Force, Lead Management, …). Per-section
  // open/closed state persisted to localStorage so it survives reloads.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { const s = localStorage.getItem('nav.collapsedSections'); if (s) setCollapsedSections(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  const toggleSection = (label: string) => setCollapsedSections((prev) => {
    const next = { ...prev, [label]: !prev[label] };
    try { localStorage.setItem('nav.collapsedSections', JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });



  // Master-admin impersonation banner height. Pushes the whole shell (fixed
  // sidebar + main column) down so the fixed bar never overlaps content.
  const impBannerH = impersonate ? 44 : 0;
  const exitImpersonation = () => {
    stopImpersonation(); // drops minted token + acting-as, restores the master's project, clears caches
    window.location.reload();
  };

  return (
    <ClientProvider>
      <CityScopeProvider>
      <IndustryScopeProvider>
      {impersonate && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: impBannerH,
          zIndex: 1000, background: 'var(--warn)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
          padding: '0 16px', fontSize: 13, fontWeight: 600,
        }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Viewing as <strong>{impersonate.name || 'user'}</strong>
            {impersonate.email ? <> ({impersonate.email})</> : null}
          </span>
          <button
            onClick={exitImpersonation}
            style={{
              background: '#fff', color: 'var(--warn)', border: 'none', borderRadius: 6, height: 28,
              padding: '0 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}
          >
            Exit impersonation
          </button>
        </div>
      )}
      <div style={{ display:'flex', minHeight:'100vh', background:'var(--canvas)', color:'var(--text)', paddingTop: impBannerH }}>
        <StagingBoot />
        {showDeploy && actingAs?.staging && actingAs.org_id && (
          <StagingDeployModal project={stagingProject} stagingOrgId={actingAs.org_id} name={actingAs.name} onClose={() => setShowDeploy(false)} />
        )}
        {isMobile && drawerOpen && (
          <div onClick={() => setDrawerOpen(false)} style={{
            position:'fixed', inset:0, background:'rgba(10,14,26,0.45)', zIndex:998,
          }}/>
        )}

        <Sidebar
          groups={displayNavGroups as any}
          hasAnyGroups={orderedNavGroups.length > 0}
          navReady={navReady}
          isMobile={isMobile}
          collapsed={collapsed}
          visible={sidebarVisible}
          top={impBannerH}
          onToggleCollapsed={toggleCollapsed}
          onCloseDrawer={() => setDrawerOpen(false)}
          navQuery={navQuery}
          onNavQuery={setNavQuery}
          onOpenSearch={() => setSearchOpen(true)}
          onEditNav={() => setEditingNav(true)}
          collapsedSections={collapsedSections}
          onToggleSection={toggleSection}
          isActive={isActive}
          webChatUnread={webChatUnread}
          user={user}
          roleLabel={hierarchyRoleName || getDesignationLabel(user)}
          onLogout={handleLogout}
          isDemo={user?.email === 'demo@kinematic.com'}
        />

        <main style={{ marginLeft:sideW, flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          <TopBar
            isMobile={isMobile}
            onOpenDrawer={() => setDrawerOpen(true)}
            crumbs={crumbs}
            token={token}
            onOpenSearch={() => setSearchOpen(true)}
            user={user}
            isPlatformAdmin={isPlatformAdmin}
            showClientFilter={!actingAs?.staging && !hideClientFilter}
          />
          <div style={{ padding: isMobile ? '16px 14px 32px' : '24px 32px 40px', flex:1, minWidth:0 }}>
            {/* Impersonation sets acting-as under the hood to scope org/client,
                so suppress the "Acting as client" banner while impersonating —
                the fixed top "Viewing as" banner owns that state (and its Exit). */}
            {actingAs && !impersonate && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginBottom: 20, background: actingAs.staging ? 'var(--warn-w)' : 'var(--info-w)', color: 'var(--text)', fontSize: 13, borderRadius: 8, border: `1px solid ${actingAs.staging ? 'var(--warn)' : 'var(--info)'}` }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: actingAs.staging ? 'var(--warn)' : 'var(--info)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{actingAs.staging
                    ? <>Editing <strong>{actingAs.name || 'Staging'}</strong> — pick changes to deploy to production.</>
                    : <>Acting as client <strong>{actingAs.name || 'Unknown'}</strong> — you are viewing their data.</>}</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {actingAs.staging && (
                  <button onClick={() => setShowDeploy(true)}
                    style={{ background: 'var(--warn)', border: 'none', color: '#fff', height: 28, padding: '0 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                    Deploy to production
                  </button>
                )}
                <button onClick={() => {
                  // Restore the saved super-admin session (token/refresh/user/project/client).
                  try {
                    const raw = localStorage.getItem('kinematic_su_session');
                    if (raw) {
                      const su = JSON.parse(raw);
                      const set = (k: string, v: any) => { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); };
                      set('kinematic_token', su.token);
                      set('kinematic_refresh_token', su.refresh);
                      set('kinematic_user', su.user);
                      set('kinematic_supabase_project', su.project);
                      set('kinematic_selected_client', su.client);
                    }
                  } catch { /* ignore */ }
                  localStorage.removeItem('kinematic_su_session');
                  setActingAs(null);
                  window.location.href = '/dashboard/clients';
                }} style={{ background: 'var(--card)', border: '1px solid var(--border-l)', color: 'var(--text)', height: 28, padding: '0 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{actingAs.staging ? 'Exit staging' : 'Exit client view'}</button>
                </div>
              </div>
            )}
            {children}
          </div>
        </main>
        {token && <KinematicAI token={token} />}
        {token && (
          <SmartSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            navGroups={orderedNavGroups}
            userId={user?.id}
          />
        )}
        {editingNav && (
          <SidebarEditor
            groups={orderedNavGroups.map((g: any) => ({
              label: g.label,
              items: g.items.map((i: any) => ({ href: i.href, label: i.label, icon: i.icon })),
            }))}
            onSave={saveNavPrefs}
            onReset={resetNavPrefs}
            onClose={() => setEditingNav(false)}
          />
        )}
      </div>
      </IndustryScopeProvider>
      </CityScopeProvider>
    </ClientProvider>
  );
}
