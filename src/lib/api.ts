import * as demo from './demoMocks';
import { isUUID } from './utils';
import { getStoredProjectKey, DEFAULT_PROJECT } from './projects';

export function resolveApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url) return url;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    if (!isLocal) {
      // eslint-disable-next-line no-console
      console.error(
        '[kinematic] NEXT_PUBLIC_API_URL is not set. Falling back to http://localhost:4000 — ' +
        'this will NOT work outside local development. Set the env var in your deployment.'
      );
    }
  }
  return 'http://localhost:4000';
}

const API_URL = resolveApiUrl();

// Super-admin "Login as client": when set, every request is scoped to this
// client's org + client_id (the backend honours X-Org-Id for super_admin).
// Persisted in localStorage so it survives reloads; cleared on "Exit".
export type ActingAs = { org_id?: string; client_id?: string; name?: string };
export function getActingAs(): ActingAs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('kinematic_acting_as');
    return raw ? (JSON.parse(raw) as ActingAs) : null;
  } catch { return null; }
}
export function setActingAs(v: ActingAs | null) {
  if (typeof window === 'undefined') return;
  try {
    if (v) window.localStorage.setItem('kinematic_acting_as', JSON.stringify(v));
    else window.localStorage.removeItem('kinematic_acting_as');
  } catch { /* ignore */ }
}

// In-memory GET cache + localStorage stale-while-revalidate + in-flight dedupe.
// - Successful GETs are cached in memory for `GET_CACHE_TTL_MS` (60s)
// - Successful GETs also persisted to localStorage so a fresh tab can paint
//   instantly with last-known data while a background refresh runs (SWR)
// - Concurrent identical GETs share one network call
// - Mutations (POST/PUT/PATCH/DELETE) clear both caches
const GET_CACHE_TTL_MS = 60_000;
const SWR_TTL_MS = 5 * 60_000; // 5 min: how long stale data is acceptable
const LS_PREFIX = 'kapi:'; // localStorage key prefix

// Per-endpoint TTL overrides. Static-ish lookup data (cities, zones, SKUs,
// org settings, modules) changes rarely; analytics changes more often than
// list views. Pattern is matched in order; first hit wins.
const TTL_OVERRIDES: Array<[RegExp, number]> = [
  // Master data — long TTL, doesn't change inside a session
  [/^\/api\/v1\/misc\/(cities|zones|states)\b/,  10 * 60_000],
  [/^\/api\/v1\/(cities|zones)\b/,                10 * 60_000],
  [/^\/api\/v1\/skus\b/,                           5 * 60_000],
  [/^\/api\/v1\/crm\/(lead-sources|territories|products|email-templates|whatsapp-templates|automations|assignment-rules|custom-fields|settings)\b/, 5 * 60_000],
  // Analytics — backend already caches 60s, mirror on the client
  [/^\/api\/v1\/crm\/analytics\b/,                       60_000],
  [/^\/api\/v1\/analytics\b/,                            60_000],
  // Live ops — keep short
  [/^\/api\/v1\/live-tracking\b/,                        15_000],
];

// CRM endpoints whose backend handler actually filters by city. Anything
// not on this list (lead-sources, assignment-rules, products, settings,
// stages, hierarchy, …) goes through the generic list helper, which would
// blindly `.eq('city', …)` and 500 on tables with no city column.
const CITY_AWARE_CRM_PREFIXES = [
  '/api/v1/crm/leads',
  '/api/v1/crm/contacts',
  '/api/v1/crm/accounts',
  '/api/v1/crm/deals',
  '/api/v1/crm/activities',
  '/api/v1/crm/tasks',
  '/api/v1/crm/notes',
  '/api/v1/crm/reports',
  '/api/v1/crm/dashboard',
  '/api/v1/crm/analytics',
  '/api/v1/crm/lead-analytics',
];

function isCityAwareCrmPath(path: string): boolean {
  return CITY_AWARE_CRM_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

function ttlFor(path: string): number {
  for (const [re, ttl] of TTL_OVERRIDES) if (re.test(path)) return ttl;
  return GET_CACHE_TTL_MS;
}

type CacheEntry = { value: unknown; expiry: number };
const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

function lsGet(key: string): { value: unknown; ts: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ts !== 'number') return null;
    if (Date.now() - parsed.ts > SWR_TTL_MS) {
      window.localStorage.removeItem(LS_PREFIX + key);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function lsSet(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_PREFIX + key, JSON.stringify({ value, ts: Date.now() }));
  } catch {
    // QuotaExceededError — best-effort: clear our entries and try once more.
    try {
      Object.keys(window.localStorage)
        .filter(k => k.startsWith(LS_PREFIX))
        .forEach(k => window.localStorage.removeItem(k));
    } catch {}
  }
}

function lsClear() {
  if (typeof window === 'undefined') return;
  try {
    Object.keys(window.localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .forEach(k => window.localStorage.removeItem(k));
  } catch {}
}

// Backend errors come back as `{ success:false, error:{ code, message } }` but
// some older handlers use a flat `{ error: "msg" }` or `{ message }`. Pull a
// human string out of any of these shapes (a naive `data.error` would render
// "[object Object]" for the nested form).
function extractApiError(data: any): string {
  if (!data || typeof data !== 'object') return 'Request failed';
  const e = data.error;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && typeof e.message === 'string') return e.message;
  if (typeof data.message === 'string') return data.message;
  return 'Request failed';
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /** Drop everything in the GET cache. Called after every mutating request. */
  clearCache() {
    responseCache.clear();
    lsClear();
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('kinematic_token');
  }

  private getUserEmail(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('kinematic_user');
      return raw ? JSON.parse(raw)?.email ?? null : null;
    } catch { return null; }
  }

  private getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    // When acting as a client, scope to that client's org.
    const acting = getActingAs();
    if (acting?.org_id) return acting.org_id;
    try {
      const raw = localStorage.getItem('kinematic_user');
      return raw ? JSON.parse(raw)?.org_id ?? null : null;
    } catch { return null; }
  }

  /**
   * Promise that resolves to the new access token after a /auth/refresh
   * round-trip. Coalesces concurrent 401s — a burst of failing GETs only
   * triggers one POST to /auth/refresh.
   */
  private refreshInFlight: Promise<string | null> | null = null;

  private async refreshAccessToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    if (this.refreshInFlight) return this.refreshInFlight;
    const refreshToken = localStorage.getItem('kinematic_refresh_token');
    if (!refreshToken) return null;
    this.refreshInFlight = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const data = json?.data ?? json;
        const newAccess = data?.access_token as string | undefined;
        const newRefresh = data?.refresh_token as string | undefined;
        const expiresAt = data?.expires_at as number | undefined;
        if (!newAccess) return null;
        localStorage.setItem('kinematic_token', newAccess);
        if (newRefresh) localStorage.setItem('kinematic_refresh_token', newRefresh);
        if (expiresAt) localStorage.setItem('kinematic_expiry', String(expiresAt));
        return newAccess;
      } catch {
        return null;
      } finally {
        // Allow the next 401 burst to trigger another refresh.
        setTimeout(() => { this.refreshInFlight = null; }, 0);
      }
    })();
    return this.refreshInFlight;
  }

  private async request<T>(path: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
    // Demo mock intercept — when demo@kinematic.com is logged in, hand back
    // canned JSON instead of touching the network so every dashboard renders
    // populated values. That email is the single demo account; no other
    // email triggers the demo experience.
    if (this.getUserEmail() === demo.DEMO_USER_EMAIL) {
      // Pass the parsed body so mocks that need to persist user input (e.g.
      // creating a WhatsApp template) can read it.
      let parsedBody: unknown;
      if (options.body && typeof options.body === 'string') {
        try { parsedBody = JSON.parse(options.body); } catch { parsedBody = undefined; }
      }
      const mocked = demo.matchDemoMock<T>(path, (options.method || 'GET').toUpperCase(), parsedBody);
      if (mocked !== undefined) return mocked;
    }

    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const orgId = this.getOrgId();
    if (orgId && !headers['X-Org-Id']) headers['X-Org-Id'] = orgId;

    // Multi-project routing: tell the backend which Supabase project this
    // session belongs to (resolved from the user's email at login, stored in
    // localStorage as kinematic_supabase_project). Omitted for the default
    // project so existing single-project traffic is byte-for-byte unchanged.
    if (!headers['X-Kinematic-Project']) {
      const project = getStoredProjectKey();
      if (project && project !== DEFAULT_PROJECT) headers['X-Kinematic-Project'] = project;
    }

    // Multi-tenant: auto-attach the active client_id (chosen via the global
    // header picker, persisted in localStorage as kinematic_selected_client) on
    // every backend call. The backend honours it for super_admin and other
    // org-level admins; client-level users have client_id pinned in their JWT
    // so the header is treated as advisory and ignored when it conflicts.
    // Acting-as a client (super-admin Login) pins X-Client-Id to that client.
    const actingClient = getActingAs()?.client_id;
    if (actingClient && !headers['X-Client-Id']) headers['X-Client-Id'] = actingClient;
    if (!headers['X-Client-Id']) {
      try {
        const sel = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_client') : null;
        if (sel && isUUID(sel)) headers['X-Client-Id'] = sel;
      } catch { /* ignore */ }
    }

    // Demo-only industry vertical switcher — auto-attach the selected vertical
    // (kinematic_selected_industry) so the backend demo middleware serves the
    // matching fixtures. Harmless for non-demo accounts (backend ignores it).
    if (!headers['X-Demo-Industry']) {
      try {
        const ind = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_industry') : null;
        if (ind) headers['X-Demo-Industry'] = ind;
      } catch { /* ignore */ }
    }

    // CRM city scope — auto-attach the picked city to GET requests that
    // genuinely accept a `city` filter. Picker source is the
    // CityScopePicker (stored in localStorage as
    // kinematic_selected_city). Skipped if the caller already specified
    // `city=` (their value wins) or if no city is picked. Backend still
    // caps results via the user's assigned_city_names, so this can only
    // narrow within scope.
    //
    // IMPORTANT: only the city-aware CRM endpoints below are whitelisted.
    // Attaching `?city=` to lookup/config endpoints (lead-sources,
    // assignment-rules, products, …) makes the backend's generic list
    // handler run `.eq('city', …)` against a table with no `city` column,
    // which 500s — the FE then renders an empty dropdown ("only Unspecified").
    let pathWithCity = path;
    try {
      const method = (options.method || 'GET').toUpperCase();
      if (method === 'GET' && isCityAwareCrmPath(path) && !/[?&]city=/i.test(path)) {
        const city = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_city') : null;
        if (city) {
          const sep = path.includes('?') ? '&' : '?';
          pathWithCity = `${path}${sep}city=${encodeURIComponent(city)}`;
        }
      }
    } catch { /* ignore */ }

    // GLOBAL PROTECTION: Strip invalid client_id, but ALLOW "Kinematic"
    let safePath = pathWithCity;
    if (pathWithCity.includes('client_id=')) {
      safePath = pathWithCity.replace(/client_id=([^&]*)/g, (match, val) => {
        // ALLOW "Kinematic" and any UUID
        return (val === 'Kinematic' || isUUID(val)) ? match : '';
      })
      .replace(/\?&/g, '?')
      .replace(/&&+/g, '&')
      .replace(/[&?]$/, '');
      if (safePath.endsWith('?')) safePath = safePath.slice(0, -1);
    }

    const res = await fetch(`${this.baseUrl}${safePath}`, { ...options, headers });
    if (res.status === 401) {
      // Silent refresh-on-401: try once, swap the Bearer, replay the
      // original request. The user only ever sees the failure if the
      // refresh token itself is rejected (revoked / 30d-stale). We do
      // NOT auto-logout here — only an explicit Sign Out clears the
      // local session.
      if (!_isRetry && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
        const newAccess = await this.refreshAccessToken();
        if (newAccess) {
          return this.request<T>(path, options, true);
        }
      }
      throw new Error('Unauthorized');
    }
    // 204 No Content / empty body: don't try to JSON-parse (would throw
    // "Unexpected end of JSON input"). This is how every DELETE comes back.
    if (res.status === 204 || res.headers.get('content-length') === '0') {
      if (!res.ok) throw new Error('Request failed');
      return undefined as unknown as T;
    }
    const text = await res.text();
    if (!text) {
      if (!res.ok) throw new Error('Request failed');
      return undefined as unknown as T;
    }
    let data: any;
    try { data = JSON.parse(text); }
    catch { throw new Error(text.slice(0, 200)); }
    if (!res.ok) throw new Error(extractApiError(data));
    return data;
  }

  private getSelectedClient(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const sel = window.localStorage.getItem('kinematic_selected_client');
      return sel && isUUID(sel) ? sel : null;
    } catch { return null; }
  }

  get<T>(path: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' || (options as { noCache?: boolean }).noCache) {
      return this.request<T>(path, options);
    }
    // Include selected client in cache keys for any client-scoped path so
    // switching clients via the picker invalidates per-tenant data.
    const clientPart = `|c:${this.getSelectedClient() || 'org'}`;
    // Include the CRM city-scope picker in the key. request() appends the
    // picked city as `?city=` to CRM GETs AFTER this key is computed, so
    // without this the key would be identical across cities and changing
    // the picker would return the previous city's cached rows (the list
    // would only update on a hard reload that clears the cache). Mirror the
    // exact append condition in request() so non-CRM paths are unaffected.
    let cityPart = '';
    try {
      const selCity = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_city') : null;
      if (selCity && isCityAwareCrmPath(path) && !/[?&]city=/i.test(path)) {
        cityPart = `|city:${selCity}`;
      }
    } catch { /* ignore */ }
    // Include the demo industry vertical so flipping the switcher invalidates
    // cached fixtures for the demo account.
    let industryPart = '';
    try {
      const selInd = typeof window !== 'undefined' ? window.localStorage.getItem('kinematic_selected_industry') : null;
      if (selInd) industryPart = `|ind:${selInd}`;
    } catch { /* ignore */ }
    const key = `${this.getToken() || 'anon'}|${path}${clientPart}${cityPart}${industryPart}`;
    const now = Date.now();

    // 1) In-memory hot cache (fresh): return immediately, no network.
    const cached = responseCache.get(key);
    if (cached && cached.expiry > now) return Promise.resolve(cached.value as T);

    // 2) In-flight dedupe: identical concurrent GETs share one network call.
    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    // Kick off network fetch
    const ttl = ttlFor(path);
    const networkPromise = this.request<T>(path, options).then(value => {
      responseCache.set(key, { value, expiry: Date.now() + ttl });
      lsSet(key, value);
      inFlight.delete(key);
      return value;
    }).catch(err => {
      inFlight.delete(key);
      throw err;
    });
    inFlight.set(key, networkPromise as Promise<unknown>);

    // 3) Stale-while-revalidate from localStorage: if we have last-known data
    //    (within SWR_TTL), resolve with it immediately AND let the network
    //    refresh fill the in-memory cache for the next paint.
    const stale = lsGet(key);
    if (stale) {
      // Don't await network — return stale instantly. The refresh continues
      // in the background and updates responseCache for the next call.
      networkPromise.catch(() => {}); // swallow background errors here
      return Promise.resolve(stale.value as T);
    }

    return networkPromise;
  }
  post<T>(path: string, body: unknown, options: RequestInit = {}) {
    this.clearCache();
    return this.request<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) });
  }
  put<T>(path: string, body: unknown, options: RequestInit = {}) {
    this.clearCache();
    return this.request<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) });
  }
  patch<T>(path: string, body: unknown, options: RequestInit = {}) {
    this.clearCache();
    return this.request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });
  }
  delete<T>(path: string, options: RequestInit = {}) {
    this.clearCache();
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  private sanitizeParams(params?: Record<string, string>) {
    if (!params) return '';
    const filtered = { ...params };
    // ALLOW "Kinematic"
    if (filtered.client_id && filtered.client_id !== 'Kinematic' && !isUUID(filtered.client_id)) {
      delete filtered.client_id;
    }
    const qs = new URLSearchParams(filtered).toString();
    return qs ? '?' + qs : '';
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  login(email: string, password: string) {
    return this.post<{
      success: boolean;
      data: {
        user: object;
        access_token: string;
        refresh_token?: string;
        expires_at?: number;
      };
    }>(
      '/api/v1/auth/login',
      { email, password }
    );
  }

  /**
   * Public — always resolves with {ok:true} regardless of whether the
   * email is registered. The backend's anti-enumeration guard makes
   * unknown addresses look identical to known ones. Used by the
   * /auth/forgot-password page.
   */
  forgotPassword(email: string) {
    return this.post<{
      success: boolean;
      data: { ok: true };
    }>('/api/v1/auth/forgot-password', { email });
  }

  /**
   * Public — verifies the Supabase recovery token + writes the new
   * password + returns a fresh session so callers can saveSession()
   * and land the user straight on the dashboard.
   */
  resetPassword(email: string, token: string, password: string) {
    return this.post<{
      success: boolean;
      data: {
        user: object;
        access_token: string;
        refresh_token?: string;
        expires_at?: number;
      };
    }>('/api/v1/auth/reset-password', { email, token, password });
  }

  getAnalyticsSummary(period: string) {
    return this.get(`/api/v1/analytics/summary?period=${period}`);
  }
  getActivityFeed() {
    return this.get('/api/v1/analytics/activity-feed');
  }
  getLiveLocations(params?: Record<string, string>) {
    // This method uses a raw fetch (bypasses request()), so the demo mock
    // intercept must be applied here too — otherwise the demo account hits the
    // network with a fake token and the live map never gets locations.
    if (this.getUserEmail() === demo.DEMO_USER_EMAIL) {
      const m = demo.matchDemoMock<unknown>('/api/v1/analytics/live-locations', 'GET');
      if (m !== undefined) return Promise.resolve(m);
    }
    const base = typeof window !== 'undefined' ? window.location.origin : this.baseUrl;
    const token = this.getToken();
    const orgId = this.getOrgId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (orgId) headers['X-Org-Id'] = orgId;
    const qs = this.sanitizeParams(params);
    return fetch(`${base}/api/v1/analytics/live-locations${qs}`, { headers, cache: 'no-store' })
      .then(async res => {
        if (res.status === 401) throw new Error('Unauthorized');
        const data = await res.json();
        if (!res.ok) throw new Error(extractApiError(data));
        return data;
      });
  }

  getFieldExecutives(params?: Record<string, string>) {
    return this.get(`/api/v1/users${this.sanitizeParams(params)}`);
  }
  getFieldExecutive(id: string) {
    return this.get(`/api/v1/users/${id}`);
  }
  updateUser(id: string, data: object) {
    return this.patch(`/api/v1/users/${id}`, data);
  }

  getAttendanceTeam(params?: Record<string, string>) {
    return this.get(`/api/v1/attendance/team${this.sanitizeParams(params)}`);
  }
  getAttendanceHistory(params?: Record<string, string>) {
    return this.get(`/api/v1/attendance/history${this.sanitizeParams(params)}`);
  }

  getAdminSubmissions(params?: Record<string, string>) {
    // Raw fetch (bypasses request()) → apply the demo intercept here so the
    // demo account's Work Activities page shows submissions instead of failing.
    if (this.getUserEmail() === demo.DEMO_USER_EMAIL) {
      const m = demo.matchDemoMock<unknown>('/api/v1/forms/admin/submissions', 'GET');
      if (m !== undefined) return Promise.resolve(m);
    }
    const qs = this.sanitizeParams(params);
    // Use window.location.origin so this goes through the Next.js API route
    // instead of Railway (which has a broken filter select clause → 400 errors).
    const base = typeof window !== 'undefined' ? window.location.origin : this.baseUrl;
    const token = this.getToken();
    const orgId = this.getOrgId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (orgId) headers['X-Org-Id'] = orgId;
    return fetch(`${base}/api/v1/forms/admin/submissions${qs}`, { headers })
      .then(async res => {
        if (res.status === 401) throw new Error('Unauthorized');
        const data = await res.json();
        if (!res.ok) throw new Error(extractApiError(data));
        return data;
      });
  }
  getSubmission(id: string) {
    return this.get(`/api/v1/forms/submissions/${id}`);
  }
  getForms(params?: Record<string, string>) {
    return this.get(`/api/v1/forms/templates${this.sanitizeParams(params)}`);
  }

  getGrievances() {
    return this.get('/api/v1/grievances');
  }
  updateGrievance(id: string, data: { status: string; admin_remarks?: string }) {
    return this.patch(`/api/v1/grievances/${id}`, data);
  }

  getStockAllocations(params?: Record<string, string>) {
    return this.get(`/api/v1/stock/allocations${this.sanitizeParams(params)}`);
  }
  allocateStock(feId: string, items: Array<{ item_id: string; qty: number }>) {
    return this.post('/api/v1/stock/allocations', { fe_id: feId, items });
  }
  updateStockItem(id: string, data: object) {
    return this.patch(`/api/v1/stock/items/${id}`, data);
  }

  getBroadcast() { return this.get('/api/v1/broadcast'); }
  createBroadcast(data: object) { return this.post('/api/v1/broadcast', data); }
  getBroadcastResponses(id: string) { return this.get(`/api/v1/broadcast/${id}/responses`); }
  closeBroadcast(id: string) { return this.patch(`/api/v1/broadcast/${id}/close`, {}); }

  getNotifications() { return this.get('/api/v1/notifications'); }
  markNotificationsRead() { return this.patch('/api/v1/notifications/read', {}); }
  // Permanently delete every notification for the signed-in user (the
  // "Clear all" action empties the feed, not just marks it read).
  clearNotifications() { return this.delete('/api/v1/notifications/clear'); }

  getLeaderboard() { return this.get('/api/v1/leaderboard'); }

  getSOSAlerts() { return this.get('/api/v1/sos'); }
  acknowledgeSOSAlert(id: string) { return this.patch(`/api/v1/sos/${id}/acknowledge`, {}); }
  resolveSOSAlert(id: string) { return this.patch(`/api/v1/sos/${id}/resolve`, {}); }

  getVisitLogs() { return this.get('/api/v1/visits'); }
  getVisitLogTeam(date: string, clientId?: string) {
    const params: Record<string, string> = { date };
    if (clientId) params.client_id = clientId;
    return this.get(`/api/v1/visits/team${this.sanitizeParams(params)}`);
  }

  getUsers(params?: Record<string, string>) {
    return this.get(`/api/v1/users${this.sanitizeParams(params)}`);
  }
  getZones(params?: Record<string, string>) {
    return this.get(`/api/v1/zones${this.sanitizeParams(params)}`);
  }
  getCities(params?: Record<string, string>) {
    return this.get(`/api/v1/cities${this.sanitizeParams(params)}`);
  }
  getStores(params?: Record<string, string>) {
    return this.get(`/api/v1/stores${this.sanitizeParams(params)}`);
  }
  getActivities(params?: Record<string, string>) {
    return this.get(`/api/v1/activities${this.sanitizeParams(params)}`);
  }

  getSecurityAlerts(params?: Record<string, string>) {
    return this.get(`/api/v1/misc/security/alerts/all${this.sanitizeParams(params)}`);
  }

  // ── Organisation (current user's org) ───────────────────────────────
  getMyOrg() { return this.get('/api/v1/organisations/me'); }
  updateMyOrg(data: object) { return this.patch('/api/v1/organisations/me', data); }

  // ── Distribution: GSTIN verify + states ──────────────────────────────
  verifyGstin(gstin: string) { return this.post<{ success: boolean; data: any }>('/api/v1/distribution/gstin/verify', { gstin }); }
  getDistStates() { return this.get('/api/v1/distribution/gstin/states'); }

  // ── Distribution: Brands ─────────────────────────────────────────────
  getBrands(params?: Record<string, string>) { return this.get(`/api/v1/distribution/brands${this.sanitizeParams(params)}`); }
  getBrand(id: string) { return this.get(`/api/v1/distribution/brands/${id}`); }
  createBrand(data: object) { return this.post('/api/v1/distribution/brands', data); }
  updateBrand(id: string, data: object) { return this.patch(`/api/v1/distribution/brands/${id}`, data); }
  deleteBrand(id: string) { return this.delete(`/api/v1/distribution/brands/${id}`); }

  // ── Distribution: Distributors ───────────────────────────────────────
  getDistributors(params?: Record<string, string>) { return this.get(`/api/v1/distribution/distributors${this.sanitizeParams(params)}`); }
  getDistributor(id: string) { return this.get(`/api/v1/distribution/distributors/${id}`); }
  createDistributor(data: object) { return this.post('/api/v1/distribution/distributors', data); }
  updateDistributor(id: string, data: object) { return this.patch(`/api/v1/distribution/distributors/${id}`, data); }
  getDistributorBilling(id: string) { return this.get(`/api/v1/distribution/distributors/${id}/billing-summary`); }

  // ── Distribution: Price Lists ────────────────────────────────────────
  getPriceLists() { return this.get('/api/v1/distribution/price-lists'); }
  getPriceList(id: string) { return this.get(`/api/v1/distribution/price-lists/${id}`); }
  createPriceList(data: object) { return this.post('/api/v1/distribution/price-lists', data); }
  bulkAddPriceItems(id: string, items: Array<object>) { return this.post(`/api/v1/distribution/price-lists/${id}/items:bulk`, { items }); }
  activatePriceList(id: string) { return this.post(`/api/v1/distribution/price-lists/${id}/activate`, {}); }

  // ── Distribution: Orders (admin) ─────────────────────────────────────
  getDistOrders(params?: Record<string, string>) { return this.get(`/api/v1/distribution/orders${this.sanitizeParams(params)}`); }
  getDistOrder(id: string) { return this.get(`/api/v1/distribution/orders/${id}`); }
  approveDistOrder(id: string) { return this.post(`/api/v1/distribution/orders/${id}/approve`, {}); }
  cancelDistOrder(id: string, reason?: string) { return this.post(`/api/v1/distribution/orders/${id}/cancel`, { reason }); }

  // ── Distribution: Invoices (M2) ──────────────────────────────────────
  getInvoices(params?: Record<string, string>) { return this.get(`/api/v1/distribution/invoices${this.sanitizeParams(params)}`); }
  getInvoice(id: string) { return this.get(`/api/v1/distribution/invoices/${id}`); }
  issueInvoice(orderId: string) { return this.post('/api/v1/distribution/invoices', { order_id: orderId }); }
  cancelInvoice(id: string, reason?: string) { return this.post(`/api/v1/distribution/invoices/${id}/cancel`, { reason }); }

  // ── Distribution: Dispatches (M2) ────────────────────────────────────
  getDispatches(params?: Record<string, string>) { return this.get(`/api/v1/distribution/dispatches${this.sanitizeParams(params)}`); }
  createDispatch(data: object) { return this.post('/api/v1/distribution/dispatches', data); }
  attachEwayBill(id: string, data: object) { return this.post(`/api/v1/distribution/dispatches/${id}/eway-bill`, data); }
  markDispatchOut(id: string) { return this.post(`/api/v1/distribution/dispatches/${id}/mark-out`, {}); }

  // ── Distribution: Payments + Returns + Ledger (M2/M3) ────────────────
  getDistPayments(params?: Record<string, string>) { return this.get(`/api/v1/distribution/payments${this.sanitizeParams(params)}`); }
  getDistReturns(params?: Record<string, string>) { return this.get(`/api/v1/distribution/returns${this.sanitizeParams(params)}`); }
  approveDistReturn(id: string) { return this.post(`/api/v1/distribution/returns/${id}/approve`, {}); }
  rejectDistReturn(id: string, reason?: string) { return this.post(`/api/v1/distribution/returns/${id}/reject`, { reason }); }
  getLedger(params?: Record<string, string>) { return this.get(`/api/v1/distribution/ledger${this.sanitizeParams(params)}`); }
  getAgeing(params?: Record<string, string>) { return this.get(`/api/v1/distribution/ledger/ageing${this.sanitizeParams(params)}`); }

  // ── Distribution: Schemes (M3) ───────────────────────────────────────
  getSchemes() { return this.get('/api/v1/distribution/schemes'); }
  getScheme(id: string) { return this.get(`/api/v1/distribution/schemes/${id}`); }
  createScheme(data: object) { return this.post('/api/v1/distribution/schemes', data); }
  updateScheme(id: string, data: object) { return this.patch(`/api/v1/distribution/schemes/${id}`, data); }
  previewScheme(data: object) { return this.post('/api/v1/distribution/schemes/preview', data); }

  // ── Distribution: Consumer / Secondary Sales (M3) ────────────────────
  getSecondarySales(params?: Record<string, string>) { return this.get(`/api/v1/distribution/secondary-sales${this.sanitizeParams(params)}`); }
  createSecondarySale(data: object) { return this.post('/api/v1/distribution/secondary-sales', data); }

  // ── Distribution: Last-Mile (Phase 1) ────────────────────────────────
  // Tertiary sales = retailer → consumer hop. Tracked across organized +
  // unorganized channels via the captured_by enum.
  getTertiarySales(params?: Record<string, string>) { return this.get(`/api/v1/distribution/tertiary-sales${this.sanitizeParams(params)}`); }
  createTertiarySale(data: object) { return this.post('/api/v1/distribution/tertiary-sales', data); }
  // Consumer registrations — the single endpoint that closes the chain:
  // creates a registration row, spawns a tertiary_sales row, and creates
  // a CRM lead with appropriate attribution all in one round-trip.
  getConsumerRegistrations(params?: Record<string, string>) { return this.get(`/api/v1/distribution/consumer-registrations${this.sanitizeParams(params)}`); }
  createConsumerRegistration(data: object) { return this.post('/api/v1/distribution/consumer-registrations', data); }
}

export const api = new ApiClient(API_URL);
export default api;

/** Re-exported so non-class consumers (e.g. the CSV download hook on
 *  the leads page) can build absolute URLs without duplicating the
 *  resolveApiUrl logic. */
export const API_BASE_URL = API_URL;
