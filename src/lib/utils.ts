// Version: 2026-03-24-1525 (Force Re-deploy)
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export function fmtHrs(h: number | null | undefined): string {
  if (h == null || isNaN(h)) return '—';
  const totalMinutes = Math.round(h * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs}h ${mins}m`;
}

export function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
export function isUUID(str: string | null | undefined): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Normalizes absolute URLs and relative Supabase storage paths into full public URLs.
 */
export function extractImageUrls(value: any): string[] {
  if (!value) return [];
  
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ocqowueomujqmvshlyqj.supabase.co';
  const bucket = 'form-responses';
  const bucketUrl = `${baseUrl}/storage/v1/object/public/${bucket}/`;

  const normalize = (v: any): string | null => {
    if (!v) return null;
    let url = typeof v === 'string' ? v.trim() : (v?.url ?? null);
    if (!url || typeof url !== 'string') return null;

    if (url.startsWith('http')) return url;
    
    const labels = ['yes', 'no', 'true', 'false', '—', 'null', 'undefined', 'ok', 'no image', 'missing'];
    if (labels.includes(url.toLowerCase())) return null;

    if (url.includes('/') || url.includes('.')) {
        if (url.includes('storage/v1/object/public/')) {
            return url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
        }
        if (url.startsWith('kinematic-') || url.startsWith('form-responses/')) {
            const parts = url.split('/');
            const b = parts[0];
            const p = parts.slice(1).join('/');
            return `${baseUrl}/storage/v1/object/public/${b}/${p}`;
        }
        return `${bucketUrl}${url.startsWith('/') ? url.slice(1) : url}`;
    }

    return null;
  };

  if (Array.isArray(value)) {
    return value.map(normalize).filter((v): v is string => !!v);
  }
  const result = normalize(value);
  return result ? [result] : [];
}
