import { Platform } from 'react-native';

/** What goes on a story card (9:16) */
export type CardData = {
  who: string;                 // "บอส" or "บอส & มิ้นท์"
  big: string;                 // "12" or "48"
  bigLabel: string;            // "วันติด เล่นด้วยกัน" / "นาที"
  week?: boolean[];            // 7 bars, oldest first
  stats: [string, string][];   // [label, value] up to 3
  footer: string;              // invite line
};

const W = 1080, H = 1920;
const VOLT = '#C9F24B', BG = '#0E0F10', SURF = '#17191B', RAISED = '#202326', INK = '#F2F3EE', MUTED = '#9A9EA4', SOFT = '#252D10';

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Draw the card into a PNG (web only; the app's fonts are already loaded on the page) */
export async function drawCard(d: CardData): Promise<Blob | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  try { await (document as any).fonts?.ready; } catch { /* fine */ }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  const display = (w: number, s: number) => `${w} ${s}px Anuphan, "IBM Plex Sans Thai", sans-serif`;
  const body = (w: number, s: number) => `${w} ${s}px "IBM Plex Sans Thai", sans-serif`;

  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  // ring in the corner
  ctx.strokeStyle = SOFT; ctx.lineWidth = 90; ctx.beginPath(); ctx.arc(W - 40, 120, 300, 0, Math.PI * 2); ctx.stroke();
  // tally mark + name
  ctx.lineCap = 'round'; ctx.strokeStyle = VOLT; ctx.lineWidth = 12;
  [110, 140, 170, 200].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 150); ctx.lineTo(x, 230); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(95, 220); ctx.lineTo(215, 160); ctx.stroke();
  ctx.fillStyle = MUTED; ctx.font = display(600, 44); ctx.fillText(d.who, 250, 208);

  ctx.fillStyle = VOLT; ctx.font = display(700, 360); ctx.fillText(d.big, 90, 700);
  ctx.fillStyle = INK; ctx.font = display(700, 84); ctx.fillText(d.bigLabel, 96, 820);

  let y = 900;
  if (d.week) {
    const gap = 18, bw = (W - 180 - gap * 6) / 7;
    d.week.forEach((on, i) => { ctx.fillStyle = on ? VOLT : RAISED; round(ctx, 90 + i * (bw + gap), y, bw, 30, 15); ctx.fill(); });
    y += 90;
  }
  const stats = d.stats.slice(0, 3);
  stats.forEach(([label, value], i) => {
    const top = y + i * 190;
    ctx.fillStyle = SURF; round(ctx, 90, top, W - 180, 160, 40); ctx.fill();
    ctx.fillStyle = MUTED; ctx.font = body(500, 38); ctx.fillText(label, 140, top + 64);
    ctx.fillStyle = INK; ctx.font = display(700, 64); ctx.fillText(value, 140, top + 132);
  });
  ctx.fillStyle = MUTED; ctx.font = body(500, 38);
  const words = d.footer.split(' '); let line = '', ly = H - 150;
  const lines: string[] = [];
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > W - 180) { lines.push(line); line = w; } else line = t; });
  if (line) lines.push(line);
  lines.slice(-2).forEach((l, i, a) => ctx.fillText(l, 90, ly - (a.length - 1 - i) * 52));
  return await new Promise<Blob | null>(res => cv.toBlob(b => res(b), 'image/png'));
}

/** Share the card through the phone's share sheet (IG Story, Facebook, LINE …), or save it when sharing files isn't supported */
export async function shareCard(d: CardData, fileName = 'trainer-manager.png'): Promise<'shared' | 'saved' | 'none'> {
  const blob = await drawCard(d);
  if (!blob) return 'none';
  const file = new File([blob], fileName, { type: 'image/png' });
  const nav: any = navigator;
  try {
    if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], text: d.footer }); return 'shared'; }
  } catch (e: any) { if (e?.name === 'AbortError') return 'none'; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
