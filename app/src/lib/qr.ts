import { Platform } from 'react-native';

/**
 * Read a QR code from a photo the person picks or takes (web).
 * Chrome on Android has a built-in reader (BarcodeDetector); iPhone Safari doesn't, so jsQR is loaded from /vendor
 * the first time it's needed. A phone photo is tried at a few sizes because a small QR in a big photo is read best
 * around 1200 px wide, and a close-up best smaller.
 */
let lib: Promise<any> | null = null;
function loadJsQR(): Promise<any> {
  if (!lib) {
    lib = new Promise((ok, bad) => {
      const w = globalThis as any;
      if (w.jsQR) { ok(w.jsQR); return; }
      const s = document.createElement('script');
      s.src = '/vendor/jsQR.js'; s.async = true;
      s.onload = () => (w.jsQR ? ok(w.jsQR) : bad(new Error('jsQR')));
      s.onerror = () => { lib = null; bad(new Error('jsQR')); };
      document.head.appendChild(s);
    });
  }
  return lib;
}

async function bitmapOf(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number }> {
  if ('createImageBitmap' in globalThis) {
    try { const b = await createImageBitmap(file); return { img: b, w: b.width, h: b.height }; } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    await new Promise((ok, bad) => { im.onload = ok; im.onerror = bad; im.src = url; });
    return { img: im, w: im.naturalWidth, h: im.naturalHeight };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** The QR text, or null when none is found */
export async function readQrFromFile(file: Blob): Promise<string | null> {
  if (Platform.OS !== 'web') return null;
  const { img, w, h } = await bitmapOf(file);
  const BD = (globalThis as any).BarcodeDetector;
  if (BD) {
    try {
      const found = await new BD({ formats: ['qr_code'] }).detect(img);
      if (found?.[0]?.rawValue) return found[0].rawValue as string;
    } catch { /* not supported for this image; use jsQR */ }
  }
  const jsQR = await loadJsQR();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
  for (const width of [1200, 800, 1600, 600]) {
    const s = Math.min(1, width / w);
    canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
    if (r?.data) return r.data as string;
    if (s === 1) break;   // photo already smaller than this; bigger sizes won't help
  }
  return null;
}
