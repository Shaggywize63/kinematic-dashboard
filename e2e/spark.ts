import type { Page, Route } from '@playwright/test';

/** Spark & Ray (connected-B2B) client id — mirrors src/lib/b2bClient.ts. */
export const SPARK_CLIENT_ID = 'c0218852-0a19-4dd0-b9fa-72f9e32ed0d8';

/** Scope the dashboard to Spark & Ray (the same localStorage key the client picker writes). Call before goto. */
export async function scopeToSpark(page: Page): Promise<void> {
  await page.addInitScript((id) => {
    window.localStorage.setItem('kinematic_selected_client', id);
  }, SPARK_CLIENT_ID);
}

/** The path of an intercepted request without host or query: `/api/v1/crm/...`. */
export const apiPath = (url: string): string => url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');

export const ok = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, json: { success: true, data } }).then(() => true);

export const fail = (route: Route, status: number, message: string) =>
  route.fulfill({ status, json: { success: false, error: message, message } }).then(() => true);

export const USERS = [
  { id: 'u-asha', name: 'Asha Rao' },
  { id: 'u-ravi', name: 'Ravi Kumar' },
  { id: 'u-meera', name: 'Meera Iyer' },
];

export const PRODUCTS = [
  { id: 'p-1', name: 'Spark Plug SP-100', price: 1200, currency: 'INR', is_active: true, sku: 'SP100' },
  { id: 'p-2', name: 'Ignition Coil IC-20', price: 3500, currency: 'INR', is_active: true, sku: 'IC20' },
  { id: 'p-3', name: 'Glow Plug GP-7', price: 800, currency: 'INR', is_active: true, sku: 'GP7' },
];
