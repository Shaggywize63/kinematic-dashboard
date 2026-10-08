/**
 * Downscale a picked photo to a JPEG no larger than `maxEdge` px on its long side, in the browser,
 * before it is uploaded. Phone and camera photos are routinely 5–12 MB; the avatars bucket refuses
 * anything over 6 MB (and anything but JPEG/PNG/WebP/HEIC), and a profile picture never needs more
 * than a few hundred pixels. If the browser cannot decode the file (e.g. HEIC outside Safari) the
 * original is returned unchanged and the caller decides whether it is small enough.
 */
export async function downscaleToJpeg(file: File, maxEdge = 1024, quality = 0.85): Promise<File> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no alpha: paint white first so a transparent PNG does not turn black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (typeof bmp.close === 'function') bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
