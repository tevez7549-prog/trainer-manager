import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from './phone';

export type Role = 'owner' | 'admin' | 'operator' | 'trainer';
export type Gym = {
  id: string; name: string; branch: string | null; phone: string | null; walkin_price: number;
  closed_weekdays: number[]; country_code: string; address: string | null;
};
export type PtPlan = { id: string; gym_id: string; name: string; sessions: number; months: number; price: number; active: boolean; sort: number };
export type Plan = { id: string; gym_id: string; name: string; months: number; days: number; price: number; active: boolean; sort: number };

export const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', admin: 'ผู้จัดการ', operator: 'พนักงานเคาน์เตอร์', trainer: 'เทรนเนอร์' };
export const DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const PAY_TH: Record<string, string> = { cash: 'เงินสด', transfer: 'โอน', qr: 'QR', free: 'ฟรี', import: 'นำเข้า' };

/** counter work: check-in, members, walk-ins, selling */
export const isDesk = (r?: Role | null) => r === 'owner' || r === 'admin' || r === 'operator';
/** plans, import, settings, fixing records */
export const isManager = (r?: Role | null) => r === 'owner' || r === 'admin';

export const gymCountry = (g?: Pick<Gym, 'country_code'> | null): Country =>
  COUNTRIES.find(c => c.dial === (g?.country_code || '66')) ?? DEFAULT_COUNTRY;

const GYM_COLS = 'id,name,branch,phone,walkin_price,closed_weekdays,country_code,address';

/** The gym and my role in it; reloads when the screen comes back into view */
export function useGym(id: string | undefined) {
  const { profile } = useAuth();
  const [gym, setGym] = useState<Gym | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!id || !profile) return;
    let alive = true;
    (async () => {
      const [g, s] = await Promise.all([
        supabase.from('gyms').select(GYM_COLS).eq('id', id).single(),
        supabase.from('gym_staff').select('role').eq('gym_id', id).eq('user_id', profile.id).eq('active', true).maybeSingle(),
      ]);
      if (!alive) return;
      if (g.error) { setErr('เปิดยิมนี้ไม่ได้ หรือคุณไม่ได้อยู่ในทีม'); return; }
      setErr(''); setGym(g.data as Gym);
      setRole(profile.is_super_admin && !s.data ? 'owner' : ((s.data?.role as Role) ?? null));
    })();
    return () => { alive = false; };
  }, [id, profile, tick]));

  return { gym, role, err, reload: () => setTick(t => t + 1) };
}

// ---------- dates (local time, Thai Buddhist year) ----------
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((new Date(toIso + 'T00:00:00').getTime() - new Date(fromIso + 'T00:00:00').getTime()) / 86400000);
}
/** "2026-10-11" -> "11 ต.ค. 69" */
export function thDate(iso?: string | null, longYear = false) {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const by = y + 543;
  return `${d} ${MONTHS[m - 1]} ${longYear ? by : String(by).slice(2)}`;
}
/** timestamp -> local date, e.g. "11 ต.ค. 69" */
export const thDateTs = (ts: string) => thDate(isoDate(new Date(ts)));
/** timestamp -> "14:05" */
export function thTime(ts: string) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const baht = (n: number | string | null | undefined) => '฿' + Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Day range of "today" in local time, as ISO timestamps for queries */
export function todayRange() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setDate(e.getDate() + 1);
  return { from: s.toISOString(), to: e.toISOString() };
}

export function planLength(p: Pick<Plan, 'months' | 'days'>) {
  const a = [];
  if (p.months) a.push(`${p.months} เดือน`);
  if (p.days) a.push(`${p.days} วัน`);
  return a.join(' ');
}
