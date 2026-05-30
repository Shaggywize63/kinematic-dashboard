/**
 * Browser-side helpers for the Push API + service worker registration.
 *
 * Flow:
 *   1. registerServiceWorker() — idempotent, runs at app load.
 *   2. enableBrowserPush() — prompts the user, subscribes via PushManager,
 *      POSTs the subscription to /api/v1/messaging/push/subscribe.
 *   3. disableBrowserPush() — unsubscribes locally and tells the backend.
 *
 * Safari < 16 doesn't ship PushManager outside of installed PWAs; we
 * gracefully report 'unsupported' in those environments so the UI can
 * show a "not available on this browser" hint instead of throwing.
 */
import { messagingApi } from './messagingApi';

export type PushSupportState = 'unsupported' | 'denied' | 'granted' | 'default';

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function pushPermission(): PushSupportState {
  if (!pushSupported()) return 'unsupported';
  return (Notification.permission as PushSupportState) || 'default';
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (e) {
    console.warn('[push] SW register failed', e);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function enableBrowserPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!pushSupported()) return { ok: false, reason: 'Push notifications are not supported in this browser.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'Notification permission was declined.' };

  const reg = (await navigator.serviceWorker.ready) ?? (await registerServiceWorker());
  if (!reg) return { ok: false, reason: 'Service worker failed to register.' };

  const keyRes = await messagingApi.getVapidPublicKey();
  const pub = keyRes?.data?.publicKey;
  if (!pub) return { ok: false, reason: 'Push is not configured on the server yet.' };

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast through BufferSource — TS 5's generic Uint8Array<ArrayBufferLike>
      // doesn't structurally match the lib.dom PushSubscriptionOptions type
      // even though the runtime value is correct. Spec-wise, applicationServerKey
      // accepts a BufferSource.
      applicationServerKey: urlBase64ToUint8Array(pub) as unknown as BufferSource,
    });
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'Browser returned an incomplete subscription.' };
    }
    await messagingApi.subscribePush(json.endpoint, { p256dh: json.keys.p256dh, auth: json.keys.auth }, navigator.userAgent);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'Subscription failed.' };
  }
}

export async function disableBrowserPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try { await messagingApi.unsubscribePush(sub.endpoint); } catch { /* ignore */ }
  try { await sub.unsubscribe(); } catch { /* ignore */ }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
