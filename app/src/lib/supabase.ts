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
  },
});

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
  if (/banned/i.test(m)) return 'บัญชีนี้ถูกระงับ ติดต่อผู้ดูแลระบบ';
  return m || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}
