import { supabase } from './supabase';
import { addDays, isoDate, thDate } from './gym';
import { prettyPhone } from './phone';

export type TC = {
  id: string; trainer_id: string; client_id: string | null; member_id: string | null; gym_id: string | null;
  goal: string | null; status: 'active' | 'removed'; client_name: string | null; client_phone: string | null; created_at: string;
  client: { display_name: string; uid: number; phone: string | null } | null;
  member: { name: string; code: string; phone_norm: string | null } | null;
  trainer: { display_name: string; uid: number } | null;
  gym: { name: string } | null;
};
export type Pkg = {
  id: string; trainer_client_id: string; label: string; sessions_total: number; sessions_left: number;
  start_date: string; end_date: string | null; price: number; days_overdue: number | null; created_at: string;
};
export type ApptStatus = 'scheduled' | 'in_progress' | 'done' | 'noshow' | 'cancelled';
export type Appt = {
  id: string; trainer_id: string; trainer_client_id: string; gym_id: string | null; starts_at: string; duration_min: number;
  status: ApptStatus; note: string | null; tc?: Pick<TC, 'id' | 'client_name' | 'client' | 'member'> | null;
};
export type Leave = { id: string; start_at: string; end_at: string; reason: string | null };

export const TC_COLS = 'id,trainer_id,client_id,member_id,gym_id,goal,status,client_name,client_phone,created_at,'
  + 'client:profiles!trainer_clients_client_id_fkey(display_name,uid,phone),'
  + 'trainer:profiles!trainer_clients_trainer_id_fkey(display_name,uid),'
  + 'member:members(name,code,phone_norm),gym:gyms(name)';
export const APPT_COLS = 'id,trainer_id,trainer_client_id,gym_id,starts_at,duration_min,status,note,'
  + 'tc:trainer_clients(id,client_name,client:profiles!trainer_clients_client_id_fkey(display_name,uid,phone),member:members(name,code,phone_norm))';

export const DURATIONS = [30, 45, 60, 90] as const;

export const APPT_TH: Record<ApptStatus, { t: string; k: 'ok' | 'warn' | 'bad' | 'info' | 'mute' }> = {
  scheduled: { t: 'นัดไว้', k: 'mute' },
  in_progress: { t: 'กำลังเทรน', k: 'info' },
  done: { t: 'มาแล้ว', k: 'ok' },
  noshow: { t: 'ไม่มา', k: 'bad' },
  cancelled: { t: 'ยกเลิก', k: 'mute' },
};

export function tcName(tc?: Pick<TC, 'client_name' | 'client' | 'member'> | null) {
  return tc?.client?.display_name || tc?.member?.name || tc?.client_name || '(ไม่มีชื่อ)';
}
export function tcPhone(tc?: Pick<TC, 'client_phone' | 'client' | 'member'> | null) {
  return prettyPhone(tc?.client?.phone || tc?.member?.phone_norm || tc?.client_phone || '');
}
export const hasApp = (tc: Pick<TC, 'client_id'>) => !!tc.client_id;

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function apptRange(a: Pick<Appt, 'starts_at' | 'duration_min'>) {
  const s = new Date(a.starts_at);
  const e = new Date(s.getTime() + a.duration_min * 60000);
  return `${hhmm(s)}–${hhmm(e)}`;
}
const WD = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
/** "วันนี้" / "พรุ่งนี้" / "ส. 12 ต.ค. 69" */
export function dayLabel(ts: string) {
  const d = new Date(ts);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return 'วันนี้';
  if (diff === 1) return 'พรุ่งนี้';
  if (diff === -1) return 'เมื่อวาน';
  return `${WD[d.getDay()]} ${thDate(isoDate(d))}`;
}
/** local date + "HH:MM" -> ISO timestamp */
export const toTs = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

export const overlaps = (aStart: string, aMin: number, bStart: string, bMin: number) => {
  const a0 = new Date(aStart).getTime(), a1 = a0 + aMin * 60000;
  const b0 = new Date(bStart).getTime(), b1 = b0 + bMin * 60000;
  return a0 < b1 && b0 < a1;
};
export const inLeave = (ts: string, leaves: Leave[]) => leaves.some(l => ts >= l.start_at && ts < l.end_at);

/** Sessions left across active packages, keyed by trainee link */
export async function sessionsLeft(tcIds: string[]): Promise<Record<string, number>> {
  if (!tcIds.length) return {};
  const { data } = await supabase.from('pt_package_status').select('trainer_client_id,sessions_left').in('trainer_client_id', tcIds);
  const out: Record<string, number> = {};
  ((data as { trainer_client_id: string; sessions_left: number }[]) ?? []).forEach(r => {
    out[r.trainer_client_id] = (out[r.trainer_client_id] ?? 0) + Math.max(0, r.sessions_left);
  });
  return out;
}

export async function markAppt(id: string, status: 'scheduled' | 'done' | 'noshow' | 'cancelled', deduct = false) {
  return supabase.rpc('mark_appointment', { a: id, new_status: status, deduct });
}

/** message after marking */
export function markMsg(r: { status: string; deducted: boolean; no_package: boolean; sessions_left: number }) {
  if (r.no_package) return `บันทึกแล้ว · ไม่มีแพ็กเกจที่เหลือครั้ง เลยไม่ได้หัก (ขายแพ็กเกจใหม่ได้ที่หน้าลูกเทรน)`;
  if (r.status === 'done') return `✓ มาแล้ว · หัก 1 ครั้ง · เหลือ ${r.sessions_left} ครั้ง`;
  if (r.status === 'noshow') return r.deducted ? `บันทึกไม่มา · หัก 1 ครั้ง · เหลือ ${r.sessions_left} ครั้ง` : `บันทึกไม่มา · ไม่หักครั้ง · เหลือ ${r.sessions_left} ครั้ง`;
  if (r.status === 'cancelled') return `ยกเลิกนัดแล้ว · เหลือ ${r.sessions_left} ครั้ง`;
  return `กลับเป็นนัดไว้ · เหลือ ${r.sessions_left} ครั้ง`;
}

/** leave rows are stored as local midnight to local midnight */
export function leaveText(l: Leave) {
  const a = isoDate(new Date(l.start_at)), last = addDays(isoDate(new Date(l.end_at)), -1);
  return `${thDate(a)}${last > a ? ' – ' + thDate(last) : ''}${l.reason ? ' · ' + l.reason : ''}`;
}

