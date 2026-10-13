/**
 * Read the QR code printed on an InBody result sheet.
 *
 * The QR is a link: https://qrcode.inbody.com?IBData=<model>-<serial><ID>!!!!<ID>!!!!<data>
 * <data> is fixed-width digits; everything printed on the sheet is in it. The layout below was worked out from an
 * InBody270 sheet and checked field by field against the printout. InBody doesn't publish it, so every result is
 * checked (protein + minerals + fat + water must add up to the weight) before it is offered for saving.
 * The ID part is the phone number the gym typed in; it is never kept.
 */
export type Seg = { ra: [number, number]; la: [number, number]; tr: [number, number]; rl: [number, number]; ll: [number, number] };
export type InBody = {
  model: string; measured_at: string; height_cm: number; age: number; sex: 'm' | 'f';
  weight_kg: number; smm_kg: number; fat_kg: number; pbf: number; bmi: number; score: number | null;
  tbw_l: number; protein_kg: number; mineral_kg: number; ffm_kg: number;
  bmr: number | null; whr: number | null; visceral: number | null;
  target_weight: number | null; weight_ctrl: number | null; fat_ctrl: number | null; muscle_ctrl: number | null;
  seg_lean: Seg | null; seg_fat: Seg | null;
  raw: string;
};

export type ParseResult = { ok: true; v: InBody } | { ok: false; why: 'not-inbody' | 'unknown-layout' };

const n = (s: string, div = 10) => { const x = Number(s); return Number.isFinite(x) ? x / div : NaN; };
const signed = (s: string, div = 10) => (s[0] === '-' ? -1 : 1) * n(s.slice(1), div);

/** Pull IBData out of whatever the camera read (the full link, or just the data) */
export function ibData(text: string): string | null {
  const t = text.trim();
  const m = t.match(/IBData=([^&#\s]+)/i);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return /^\d{3,4}[A-Z]?-/.test(t) && t.includes('!!!!') ? t : null;
}

export function parseInBody(text: string): ParseResult {
  const d = ibData(text);
  if (!d) return { ok: false, why: 'not-inbody' };
  const model = d.split('-')[0];
  // the measurements start with height(4) age(4) sex(1) date-time(14), right after the second "!!!!"
  const at = d.search(/\d{8}[MF]\d{14}/);
  if (at < 0) return { ok: false, why: 'unknown-layout' };
  const b = d.slice(at);
  const g = (i: number, len = 4) => b.slice(i, i + len);
  const dt = g(9, 14);
  const measured_at = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}T${dt.slice(8, 10)}:${dt.slice(10, 12)}:${dt.slice(12, 14)}+07:00`;

  const v: InBody = {
    model, measured_at,
    height_cm: n(g(0)), age: Math.round(n(g(4))), sex: b[8] === 'F' ? 'f' : 'm',
    protein_kg: n(g(23)), mineral_kg: n(g(35), 100), fat_kg: n(g(47)), tbw_l: n(g(59)), ffm_kg: n(g(71)),
    weight_kg: n(g(75)), smm_kg: n(g(91)), bmi: n(g(104)), pbf: n(g(108)),
    score: /^\d{3}$/.test(g(112, 3)) ? Number(g(112, 3)) : null,
    target_weight: n(g(115)),
    weight_ctrl: signed(g(119, 5)), fat_ctrl: signed(g(124, 5)), muscle_ctrl: signed(g(129, 5)),
    bmr: Number(g(134)) || null, whr: n(g(138), 100) || null, visceral: Number(g(150, 2)) || null,
    seg_lean: null, seg_fat: null,
    raw: b,
  };

  // segmental lean / fat: second block after "PASS…!!!!"
  const s2 = b.indexOf('!!!!', b.indexOf('PASS'));
  if (s2 > 0) {
    const s = b.slice(s2 + 4);
    const q = (i: number, len = 4, div = 10) => n(s.slice(i, i + len), div);
    const lean = [20, 24, 28, 32, 36].map(i => q(i, 4, i === 28 ? 10 : 100));    // arms/legs in 0.01 kg, trunk in 0.1 kg
    const fat = [40, 44, 48, 52, 56].map(i => q(i));
    const leanPct = [60, 64, 68, 72, 76].map(i => q(i));
    const fatPct = [80, 85, 90, 95, 100].map(i => q(i, 5));
    const seg = (kg: number[], pct: number[]): Seg => ({ ra: [kg[0], pct[0]], la: [kg[1], pct[1]], tr: [kg[2], pct[2]], rl: [kg[3], pct[3]], ll: [kg[4], pct[4]] });
    const okSeg = (xs: number[]) => xs.every(x => Number.isFinite(x) && x >= 0);
    if (okSeg(lean) && okSeg(leanPct)) v.seg_lean = seg(lean, leanPct);
    if (okSeg(fat) && okSeg(fatPct)) v.seg_fat = seg(fat, fatPct);
  }

  // the parts must add up to the weight, and the main numbers must be human; otherwise the layout is one we don't know
  const sum = v.protein_kg + v.mineral_kg + v.fat_kg + v.tbw_l;
  const sane = v.weight_kg > 20 && v.weight_kg < 300 && v.height_cm > 90 && v.height_cm < 250 && v.pbf > 1 && v.pbf < 75
    && v.smm_kg > 5 && v.smm_kg < v.weight_kg && Math.abs(sum - v.weight_kg) < 0.6 && !Number.isNaN(Date.parse(measured_at));
  if (!sane) return { ok: false, why: 'unknown-layout' };
  if (v.score != null && (v.score < 20 || v.score > 120)) v.score = null;
  for (const k of ['target_weight', 'weight_ctrl', 'fat_ctrl', 'muscle_ctrl'] as const) if (!Number.isFinite(v[k] as number)) v[k] = null;
  return { ok: true, v };
}
