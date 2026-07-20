'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

/**
 * Drop-in replacement for <img> that renders images stored in PRIVATE Supabase
 * Storage buckets (attendance selfies, form photos, etc.). It exchanges the
 * stored object URL for a short-lived signed URL via GET /api/v1/media/sign,
 * so the buckets can be private (SECURITY_AUDIT_2026-07.md PR-1) while images
 * still display.
 *
 * Safe by design: URLs that are NOT one of the signable private buckets (public
 * assets, external images, blob/data previews) are passed through unchanged, and
 * if signing fails for any reason the component falls back to the original URL —
 * so it is never worse than a plain <img>.
 */

// Object URLs from these buckets are private and must be signed. Everything else
// renders as-is. Keep in sync with SIGNABLE_BUCKETS in the backend media controller.
const SIGNABLE_RE =
  /\/storage\/v1\/object\/(?:public|sign|authenticated)\/(?:kinematic-selfies|kinematic-form-photos|form-responses|kinematic-avatars|kinematic-materials)\//;

// Cache signed URLs by original stored URL. TTL a little under the 300s the
// backend grants, so we never hand back an about-to-expire URL.
const SIGNED_TTL_MS = 4 * 60 * 1000;
const cache = new Map<string, { url: string; exp: number }>();

export async function resolveSignedUrl(stored: string): Promise<string> {
  if (!stored || !SIGNABLE_RE.test(stored)) return stored;
  const hit = cache.get(stored);
  if (hit && hit.exp > Date.now()) return hit.url;
  try {
    const res = await api.get<{ data?: { url?: string }; url?: string }>(
      `/api/v1/media/sign?url=${encodeURIComponent(stored)}`,
    );
    const signed = res?.data?.url ?? res?.url;
    if (!signed) return stored;
    cache.set(stored, { url: signed, exp: Date.now() + SIGNED_TTL_MS });
    return signed;
  } catch {
    return stored; // graceful fallback — no worse than a plain <img>
  }
}

/**
 * Open a stored object URL full-size in a new tab. Private-bucket URLs (the
 * `/object/public/…` form the upload API stores) now 404 with "Bucket not
 * found" because those buckets were made private — so exchange the stored URL
 * for a short-lived signed URL first. The tab is opened SYNCHRONOUSLY (about:blank)
 * so the user-gesture survives the async sign call and popup blockers don't fire;
 * we then point it at the signed URL. Non-signable URLs open directly.
 *
 * Use as an onClick handler on the existing <a> (keep the href for middle-click /
 * "open in new tab" fallback): onClick={(e) => openSignedUrl(e, url)}.
 */
export function openSignedUrl(e: React.MouseEvent | undefined, stored?: string | null): void {
  if (!stored) return;
  // Let modified clicks (cmd/ctrl/middle) use the native href fallback.
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as React.MouseEvent).button === 1)) return;
  e?.preventDefault();
  if (!SIGNABLE_RE.test(stored)) { window.open(stored, '_blank', 'noopener,noreferrer'); return; }
  const w = window.open('about:blank', '_blank');
  resolveSignedUrl(stored)
    .then((u) => { if (w) w.location.href = u; })
    .catch(() => { if (w) w.close(); });
}

type Props = React.ImgHTMLAttributes<HTMLImageElement> & { src?: string | null };

export default function SignedImage({ src, ...rest }: Props) {
  const needsSigning = !!src && SIGNABLE_RE.test(src);
  // Non-signable URLs render immediately; signable ones resolve async.
  const [resolved, setResolved] = useState<string | undefined>(
    needsSigning ? undefined : src || undefined,
  );

  useEffect(() => {
    let alive = true;
    if (!src) { setResolved(undefined); return; }
    if (!SIGNABLE_RE.test(src)) { setResolved(src); return; }
    setResolved(undefined);
    resolveSignedUrl(src).then((u) => { if (alive) setResolved(u); });
    return () => { alive = false; };
  }, [src]);

  if (!resolved) return null; // brief blank while signing, then the image appears
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved} {...rest} />;
}
