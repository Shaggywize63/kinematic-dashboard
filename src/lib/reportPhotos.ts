/**
 * Photos in the Work Activities CSV.
 *
 * An image / signature / camera answer is stored on the response row as `photo_url` (one URL, or several joined by
 * commas) and leaves `value_text` empty, so an export that only read the text / number / yes-no columns printed those
 * cells blank. These helpers turn the stored URLs into links that still open once the file is downloaded: the photo
 * buckets are private, so each stored URL is exchanged for a signed link that lasts a week (the backend's maximum).
 */
import { extractImageUrls } from './utils';

/** Seconds the exported links stay valid — the backend caps `ttl` at 7 days. */
export const REPORT_PHOTO_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Stored URLs signed per request (the backend accepts at most 200). */
export const SIGN_BATCH_SIZE = 200;

interface ResponseLike {
  photo_url?: unknown;
  value_text?: unknown;
  qtype?: unknown;
  builder_questions?: { qtype?: unknown } | null;
}

const IMAGE_QTYPES = new Set(['image', 'signature', 'photo', 'camera']);

/** Stored photo URLs of one form response (empty for a plain text / number / yes-no answer). */
export function responsePhotoUrls(r: ResponseLike): string[] {
  const qtype = String(r.builder_questions?.qtype ?? r.qtype ?? '').toLowerCase();
  // photo_url is only ever set for attachments; value_text counts only when the question is an image type.
  const src = r.photo_url || (IMAGE_QTYPES.has(qtype) ? r.value_text : null);
  if (!src) return [];
  return extractImageUrls(src as never);
}

/** Every distinct stored photo URL across the exported submissions. */
export function collectPhotoUrls(submissions: Array<{ form_responses?: ResponseLike[] | null }>): string[] {
  const out = new Set<string>();
  for (const s of submissions) for (const r of s.form_responses ?? []) for (const u of responsePhotoUrls(r)) out.add(u);
  return Array.from(out);
}

/** The cell text for a photo answer: the links separated by " | " (one row of the CSV stays one line), signed when possible. */
export function photoCell(urls: string[], signed: Record<string, string | null | undefined>): string {
  return urls.map((u) => signed[u] || u).join(' | ');
}

/**
 * Signs every stored URL for the export. `sign` is one batch call (stored URLs in, stored -> signed map out); a
 * failed batch is skipped, so those photos keep their stored URL and the rest of the report is unaffected.
 */
export async function signPhotoUrls(
  urls: string[],
  sign: (batch: string[]) => Promise<Record<string, string | null>>,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < urls.length; i += SIGN_BATCH_SIZE) {
    try {
      Object.assign(out, await sign(urls.slice(i, i + SIGN_BATCH_SIZE)));
    } catch { /* keep the stored URLs for this batch */ }
  }
  return out;
}
