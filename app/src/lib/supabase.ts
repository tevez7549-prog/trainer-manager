import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Publishable key: safe to ship in the app. Data is protected by row level security in the database.
export const SUPABASE_URL = 'https://tfuafjdhxzlagclbnmws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Sx2LbG2Z5Ym8B2ECq0z8tw_DMDlOUIC';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // web keeps the session in the browser's own storage; phones use AsyncStorage
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

/** Sign in with Google or LINE. On web the page goes to the provider and comes back signed in. */
export async function signInWith(provider: 'google' | 'line') {
  const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
  // LINE is set up in Supabase as a custom provider called "custom:line"
  const p = (provider === 'line' ? 'custom:line' : 'google') as any;
  return supabase.auth.signInWithOAuth({ provider: p, options: { redirectTo } });
}

/** Thai message for common Supabase errors */
export function thError(e: unknown): string {
  const m = String((e as any)?.message ?? e ?? '');
  if (/Invalid login credentials/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูก';
  if (/Email not confirmed/i.test(m)) return 'ยังไม่ได้ยืนยันอีเมล เปิดอีเมลแล้วกดลิงก์ยืนยันก่อน';
  if (/already registered|already exists/i.test(m)) return 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน';
  if (/Password should be|weak password/i.test(m)) return 'รหัสผ่านสั้นหรือง่ายเกินไป (อย่างน้อย 8 ตัว)';
  if (/profiles_phone_uq/.test(m)) return 'เบอร์นี้ใช้กับบัญชีอื่นแล้ว';
  if (/rate limit/i.test(m)) return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่';
  if (/Failed to fetch|Network request failed|NetworkError/i.test(m)) return 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
  if (/provider is not enabled|Unsupported provider/i.test(m)) return 'ช่องทางนี้ยังไม่เปิดใช้ ลองใช้อีเมลไปก่อน';
  if (/banned/i.test(m)) return 'บัญชีนี้ถูกระงับ ติดต่อผู้ดูแลระบบ';
  if (/uid not found/i.test(m)) return 'ไม่พบ UID นี้ ให้อีกฝ่ายเปิดหน้า "ฉัน" ในแอปแล้วบอก UID อีกครั้ง';
  if (/already the owner/i.test(m)) return 'คนนี้เป็นเจ้าของยิมอยู่แล้ว · เจ้าของรับลูกเทรนเองได้เลย ไม่ต้องเพิ่มเป็นเทรนเนอร์';
  if (/account suspended/i.test(m)) return 'บัญชีนี้ถูกระงับอยู่';
  if (/members_gym_phone_uq/.test(m)) return 'เบอร์นี้มีสมาชิกในยิมแล้ว ค้นหาด้วยเบอร์นี้ดูก่อน';
  if (/plan not found/i.test(m)) return 'ไม่พบแพ็กเกจนี้ อาจถูกลบไปแล้ว';
  if (/only the gym owner|not allowed|row-level security|permission denied/i.test(m)) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  if (/violates foreign key|Database error deleting user/i.test(m)) return 'ลบไม่ได้ เพราะยังมีข้อมูลอื่นผูกกับรายการนี้อยู่';
  if (/cannot invite yourself/i.test(m)) return 'เชิญตัวเองไม่ได้';
  if (/already your trainee|trainer_clients_active_uq/i.test(m)) return 'คนนี้เป็นลูกเทรนของเทรนเนอร์คนนี้อยู่แล้ว';
  if (/invite expired/i.test(m)) return 'คำเชิญหมดอายุแล้ว ให้เทรนเนอร์ส่งใหม่';
  if (/invite already answered|invite not found/i.test(m)) return 'คำเชิญนี้ตอบไปแล้ว';
  if (/trainer_clients_check/i.test(m)) return 'ตอนนี้ยังเพิ่มลูกเทรนที่ไม่มีแอปไม่ได้ (รออัปเดตระบบ) · ใช้แบบเชิญด้วย UID ไปก่อน';
  if (/freeze overlaps/i.test(m)) return 'ช่วงนี้มีการพักสมาชิกอยู่แล้ว';
  if (/no membership to freeze/i.test(m)) return 'ไม่มีแพ็กเกจที่ยังใช้อยู่ในช่วงนี้ให้พัก';
  if (/freeze already over/i.test(m)) return 'การพักนี้จบไปแล้ว';
  if (/freeze end before start/i.test(m)) return 'วันสุดท้ายต้องไม่ก่อนวันแรก';
  if (/appointment not found/i.test(m)) return 'ไม่พบนัดนี้ อาจถูกลบไปแล้ว';
  return m || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}
