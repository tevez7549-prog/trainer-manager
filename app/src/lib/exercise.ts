import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { Exercise } from './me';

/** Library rows as the picker needs them (no long how-to text; that loads when a move is opened) */
export type LibEx = Exercise & { muscle: string | null; equipment: string | null; level: string | null; media_url: string | null; created_by: string | null };
export const LIB_COLS = 'id,name_th,name_en,body_part,kind,muscle,equipment,level,media_url,created_by';

/** English name first (the app works in both languages); own moves may only have a Thai name */
export const exName = (e: { name_en?: string | null; name_th: string } | null | undefined) => (e ? e.name_en || e.name_th : '–');
/** The Thai name when it adds something */
export const exSub = (e: { name_en?: string | null; name_th: string }) => (e.name_en && e.name_th && e.name_th !== e.name_en ? e.name_th : '');

export const MUSCLE_TH: Record<string, string> = {
  chest: 'อก', shoulders: 'ไหล่', lats: 'ปีกหลัง', 'middle back': 'หลังกลาง', 'lower back': 'หลังล่าง', traps: 'บ่า',
  biceps: 'แขนหน้า', triceps: 'แขนหลัง', forearms: 'แขนท่อนล่าง', abdominals: 'หน้าท้อง',
  quadriceps: 'ต้นขาหน้า', hamstrings: 'ต้นขาหลัง', glutes: 'ก้น', calves: 'น่อง', adductors: 'ต้นขาด้านใน', abductors: 'สะโพกด้านนอก', neck: 'คอ',
};
export const EQUIP_TH: Record<string, string> = {
  'body only': 'ตัวเปล่า', dumbbell: 'ดัมเบล', barbell: 'บาร์เบล', machine: 'เครื่อง', cable: 'เคเบิล', kettlebells: 'เคตเทิลเบล',
  bands: 'ยางยืด', 'e-z curl bar': 'บาร์ EZ', 'medicine ball': 'เมดิซินบอล', 'exercise ball': 'บอลออกกำลังกาย', 'foam roll': 'โฟมโรล', other: 'อื่น ๆ',
};
export const LEVEL_TH: Record<string, string> = { beginner: 'เริ่มต้น', intermediate: 'กลาง', expert: 'สูง' };

const WEB_BASE = 'https://trainer-manager.tevez7549.workers.dev';
/** Pictures live with the web app under /ex/; the phone app needs the full address */
export const mediaUri = (u: string | null | undefined) => (!u ? null : u.startsWith('/') && Platform.OS !== 'web' ? WEB_BASE + u : u);

let cache: Promise<LibEx[]> | null = null;
/** Whole library once per app session (≈900 rows); own moves are included by RLS */
export function loadLibrary(fresh = false): Promise<LibEx[]> {
  if (!cache || fresh) {
    cache = supabase.from('exercises').select(LIB_COLS).order('name_en', { nullsFirst: false }).limit(3000)
      .then(({ data, error }) => { if (error) { cache = null; return []; } return (data as LibEx[]) ?? []; });
  }
  return cache;
}

/** Match English or Thai name, every word typed */
export function searchLib(lib: LibEx[], q: string) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return lib;
  return lib.filter(e => { const s = `${e.name_en ?? ''} ${e.name_th}`.toLowerCase(); return words.every(w => s.includes(w)); });
}
