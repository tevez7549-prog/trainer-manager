import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getJSON, setJSON, uuid } from './store';
import { daysBetween, todayISO } from './gym';

// ---------------------------------------------------------------------------
// Members, cached on the device so the counter can search and check in offline
// ---------------------------------------------------------------------------
export type MemberStatus = 'active' | 'expiring' | 'expired' | 'none' | 'frozen' | 'pt_only';
export type Member = {
  id: string; gym_id: string; profile_id: string | null; code: string; name: string; phone: string | null;
  phone_norm: string | null; pt_only: boolean; plan_name: string | null; start_date: string | null; end_date: string | null;
  frozen_until: string | null; status: MemberStatus; days_left: number | null; note: string | null; imported: boolean; created_at: string;
};

export const STATUS_TH: Record<MemberStatus, { t: string; k: 'ok' | 'warn' | 'bad' | 'info' | 'mute' }> = {
  active: { t: 'ใช้งาน', k: 'ok' },
  expiring: { t: 'ใกล้หมด', k: 'warn' },
  expired: { t: 'หมดอายุ', k: 'bad' },
  none: { t: 'ยังไม่มีแพ็กเกจ', k: 'mute' },
  frozen: { t: 'พักสมาชิก', k: 'info' },
  pt_only: { t: 'เทรน PT อย่างเดียว', k: 'info' },
};

const COLS = 'id,gym_id,profile_id,code,name,phone,phone_norm,pt_only,plan_name,start_date,end_date,frozen_until,status,days_left,note,imported,created_at';
const cacheKey = (g: string) => `tm-members:${g}`;

/** Status worked out on the device, so a cache from yesterday is still right today */
export function liveStatus(m: Member): Member {
  const t = todayISO();
  const left = m.end_date ? daysBetween(t, m.end_date) : null;
  let s: MemberStatus;
  if (m.pt_only) s = 'pt_only';
  else if (m.frozen_until && m.frozen_until >= t) s = 'frozen';
  else if (!m.end_date) s = 'none';
  else if (left! < 0) s = 'expired';
  else if (left! <= 7) s = 'expiring';
  else s = 'active';
  return { ...m, status: s, days_left: left };
}

export async function cachedMembers(gymId: string) {
  const c = await getJSON<{ at: string; rows: Member[] }>(cacheKey(gymId));
  return c ? { at: c.at, rows: c.rows.map(liveStatus) } : null;
}

/** All members of a gym (1,000 per request), saved for offline use. Falls back to the saved copy. */
export async function loadMembers(gymId: string): Promise<{ rows: Member[]; at: string; offline: boolean }> {
  const rows: Member[] = [];
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('member_status').select(COLS).eq('gym_id', gymId).order('name').range(from, from + 999);
      if (error) throw error;
      rows.push(...((data as Member[]) ?? []));
      if (!data || data.length < 1000) break;
    }
    const at = new Date().toISOString();
    await setJSON(cacheKey(gymId), { at, rows });
    return { rows: rows.map(liveStatus), at, offline: false };
  } catch {
    const c = await cachedMembers(gymId);
    return { rows: c?.rows ?? [], at: c?.at ?? '', offline: true };
  }
}

/** Search by name, member code or phone (any part of the number, with or without the leading 0) */
export function searchMembers(rows: Member[], q: string, limit = 30): Member[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const d = s.replace(/\D/g, '').replace(/^0/, '');
  return rows.filter(m =>
    m.name.toLowerCase().includes(s) ||
    m.code.toLowerCase().includes(s) ||
    (d.length >= 3 && (m.phone_norm ?? '').replace(/\D/g, '').includes(d)),
  ).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Offline queue for check-ins and walk-ins
// Each item carries a client_ref; the database ignores a second copy, so sending twice is safe.
// ---------------------------------------------------------------------------
export type QueuedCheckin = { type: 'checkin'; ref: string; gym_id: string; member_id: string; member_name: string; kind: 'member' | 'pt'; at: string; by: string };
export type QueuedWalkin = { type: 'walkin'; ref: string; gym_id: string; price: number; pay_method: 'cash' | 'transfer' | 'qr'; note: string | null; at: string; by: string };
export type QueuedOp = QueuedCheckin | QueuedWalkin;

const QKEY = 'tm-queue';
let queue: QueuedOp[] | null = null;
let failed: { op: QueuedOp; msg: string }[] = [];
let flushing = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

async function q(): Promise<QueuedOp[]> {
  if (!queue) queue = (await getJSON<QueuedOp[]>(QKEY)) ?? [];
  return queue;
}
async function save() { await setJSON(QKEY, queue ?? []); emit(); }

const isNetworkError = (e: any) => /Failed to fetch|Network request failed|NetworkError|Load failed|timeout/i.test(String(e?.message ?? e));

export async function enqueue(op: Omit<QueuedCheckin, 'ref' | 'at'> | Omit<QueuedWalkin, 'ref' | 'at'>) {
  const full = { ...op, ref: uuid(), at: new Date().toISOString() } as QueuedOp;
  (await q()).push(full);
  await save();
  flush();
  return full;
}

/** Send everything waiting. Stops at the first network error and tries again later. */
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const list = await q();
    while (list.length) {
      const op = list[0];
      const res = op.type === 'checkin'
        ? await supabase.from('checkins').upsert({ client_ref: op.ref, gym_id: op.gym_id, member_id: op.member_id, kind: op.kind, checked_at: op.at, by_staff: op.by }, { onConflict: 'client_ref', ignoreDuplicates: true })
        : await supabase.from('walkins').upsert({ client_ref: op.ref, gym_id: op.gym_id, price: op.price, pay_method: op.pay_method, note: op.note, at: op.at, by_staff: op.by }, { onConflict: 'client_ref', ignoreDuplicates: true });
      if (res.error) {
        if (isNetworkError(res.error)) break;
        failed.push({ op, msg: res.error.message });   // e.g. no longer staff: drop it and tell the user
      }
      list.shift();
      await save();
    }
  } catch { /* offline: keep the queue */ }
  finally { flushing = false; emit(); }
}

export function takeFailed() { const f = failed; failed = []; emit(); return f; }

/** Pending items for this gym, online state, and a flush every 20 s / when the connection returns */
export function useQueue(gymId?: string) {
  const [, setN] = useState(0);
  const [online, setOnline] = useState(Platform.OS !== 'web' || typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    q().then(() => setN(n => n + 1));
    const f = () => setN(n => n + 1);
    listeners.add(f);
    const timer = setInterval(flush, 20000);
    let off = () => {};
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const up = () => { setOnline(true); flush(); };
      const down = () => setOnline(false);
      window.addEventListener('online', up); window.addEventListener('offline', down);
      off = () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
    }
    flush();
    return () => { listeners.delete(f); clearInterval(timer); off(); };
  }, []);
  const pending = (queue ?? []).filter(o => !gymId || o.gym_id === gymId);
  return { pending, online, failedCount: failed.length };
}
