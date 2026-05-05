import * as demo from './demoMocks';
import { isUUID } from './utils';

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

// In-memory GET cache + localStorage stale-while-revalidate + in-flight dedupe.
// - Successful GETs are cached in memory for `GET_CACHE_TTL_MS` (60s)
// - Successful GETs also persisted to localStorage so a fresh tab can paint
//   instantly with last-known data while a background refresh runs (SWR)
// - Concurrent identical GETs share one network call
// - Mutations (POST/PUT/PATCH/DELETE) clear both caches
const GET_CACHE_TTL_MS = 60_000;
const SWR_TTL_MS = 5 * 60_000; // 5 min: how long stale data is acceptable
const LS_PREFIX = 'kapi:'; // localStorage key prefix

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
    try {
      const raw = localStorage.getItem('kinematic_user');
      return raw ? JSON.parse(raw)?.org_id ?? null : null;
    } catch { return null; }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const orgId = this.getOrgId();
    if (orgId && !headers['X-Org-Id']) headers['X-Org-Id'] = orgId;

    // GLOBAL PROTECTION: Strip invalid client_id, but ALLOW "Kinematic"
    let safePath = path;
    if (path.includes('client_id=')) {
      safePath = path.replace(/client_id=([^&]*)/g, (match, val) => {
        // ALLOW "Kinematic" and any UUID
        return (val === 'Kinematic' || isUUID(val)) ? match : '';
      })
      .replace(/\?&/g, '?')
      .replace(/&&+/g, '&')
      .replace(/[&?]$/, '');
      if (safePath.endsWith('?')) safePath = safePath.slice(0, -1);
    }

    const res = await fetch(`${this.baseUrl}${safePath}`, { ...options, headers });
    if (res.status === 401) throw new Error('Unauthorized');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
    return data;
  }

  get<T>(path: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' || (options as { noCache?: boolean }).noCache) {
      return this.request<T>(path, options);
    }
    const key = `${this.getToken() || 'anon'}|${path}`;
    const now = Date.now();

    // 1) In-memory hot cache (fresh): return immediately, no network.
    const cached = responseCache.get(key);
    if (cached && cached.expiry > now) return Promise.resolve(cached.value as T);

    // 2) In-flight dedupe: identical concurrent GETs share one network call.
    const pending = inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    // Kick off network fetch
    const networkPromise = this.request<T>(path, options).then(value => {
      responseCache.set(key, { value, expiry: Date.now() + GET_CACHE_TTL_MS });
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
    return this.post<{ success: boolean; data: { user: object; access_token: string } }>(
      '/api/v1/auth/login',
      { email, password }
    );
  }

  getAnalyticsSummary(period: string) {
    return this.get(`/api/v1/analytics/summary?period=${period}`);
  }
  getActivityFeed() {
    return this.get('/api/v1/analytics/activity-feed');
  }
  getLiveLocations(params?: Record<string, string>) {
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
        if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
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
        if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
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
}

export const api = new ApiClient(API_URL);
export default api;
