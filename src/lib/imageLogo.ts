// Prepares an uploaded logo for invoices: trims the empty margins (logos are often exported on a big
// square canvas), downsizes it and returns a PNG data URL small enough to store inline in Finance Settings.
// Server limit: ~400 KB of base64 (see logo_url in the backend's finance.routes.ts).

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 380_000;
const INK_THRESHOLD = 244; // a pixel counts as logo ink if any channel is darker than this (white margins are ignored)

export const LOGO_DATA_URL = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    img.src = url;
  });
}

export async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Upload a PNG or JPEG image (the PDF cannot embed other formats).');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is larger than 8 MB. Please use a smaller file.');

  const img = await loadImage(file);
  // Work at no more than 3000px on the long side so a huge export can't exhaust memory.
  const shrink = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * shrink)), h = Math.max(1, Math.round(img.naturalHeight * shrink));
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('Your browser could not process the image.');
  sctx.drawImage(img, 0, 0, w, h);

  const { data } = sctx.getImageData(0, 0, w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 16 && (data[i] < INK_THRESHOLD || data[i + 1] < INK_THRESHOLD || data[i + 2] < INK_THRESHOLD)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('The image looks blank. Please choose your logo file.');

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03) + 2;
  const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad + 1) - cx, ch = Math.min(h, maxY + pad + 1) - cy;

  // Downscale until the stored size fits; most logos pass on the first try at 640px wide.
  for (let maxW = 640; maxW >= 160; maxW = Math.round(maxW * 0.75)) {
    const scale = Math.min(1, maxW / cw, 320 / ch);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cw * scale)); out.height = Math.max(1, Math.round(ch * scale));
    const octx = out.getContext('2d');
    if (!octx) break;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, cx, cy, cw, ch, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/png');
    if (url.length <= MAX_DATA_URL_CHARS) return url;
  }
  throw new Error('That image is too detailed to store as a logo. Try a simpler or smaller version.');
}
