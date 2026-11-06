/**
 * Where suggestions come from. The browser Maps SDK is the default when a key is configured; the backend Places
 * proxy is used when there is no key (and the caller opted in) AND whenever the SDK is unusable — the key is rejected
 * (referrer / billing), "Places API (New)" is not enabled for it, or a request throws. A key is present => the proxy
 * is always an allowed fallback, so a broken browser key no longer leaves the rep with a dead search box.
 */
export function addressSearchMode(o: { hasKey: boolean; backendOptIn: boolean; sdkBroken: boolean }): 'sdk' | 'backend' | 'none' {
  if (!o.hasKey) return o.backendOptIn ? 'backend' : 'none';
  return o.sdkBroken ? 'backend' : 'sdk';
}
