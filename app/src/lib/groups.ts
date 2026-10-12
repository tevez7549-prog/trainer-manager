import { tr } from './i18n';
import { Linking, Platform, Share } from 'react-native';
import { supabase } from './supabase';
import { addDays, todayISO } from './gym';
import { getJSON, setJSON } from './store';

export type GroupKind = 'couple' | 'family' | 'friends';
export const KIND: Record<GroupKind, { t: string; icon: string }> = {
  couple: { t: 'คู่รัก', icon: 'heart' },
  family: { t: 'ครอบครัว', icon: 'house' },
  friends: { t: 'เพื่อน', icon: 'users' },
};
export const MAX_MEMBERS = 20;

export type Group = { id: string; name: string; kind: GroupKind; code: string; owner_id: string; created_at: string };
export type Person = { user_id: string; uid: number; display_name: string; is_owner: boolean; joined_at: string; last_workout: string | null; i_care: boolean };
export type FeedItem = {
  workout_id: string; user_id: string; display_name: string; title: string | null; started_at: string; ended_at: string | null;
  moves: number; sets: number; volume: number; cheers: number; cheered: boolean;
};
export type Day = { user_id: string; day: string };

/** Groups I am in, with their members (for counts and "who trained today") */
export async function myGroups(me: string): Promise<(Group & { members: string[] })[]> {
  const m = await supabase.from('group_members').select('group_id').eq('user_id', me);
  const ids = ((m.data as { group_id: string }[]) ?? []).map(x => x.group_id);
  if (!ids.length) return [];
  const [g, all] = await Promise.all([
    supabase.from('groups').select('*').in('id', ids).order('created_at'),
    supabase.from('group_members').select('group_id,user_id').in('group_id', ids),
  ]);
  const mem = ((all.data as { group_id: string; user_id: string }[]) ?? []);
  return ((g.data as Group[]) ?? []).map(x => ({ ...x, members: mem.filter(r => r.group_id === x.id).map(r => r.user_id) }));
}

export async function groupDays(g: string): Promise<Day[]> {
  const { data } = await supabase.rpc('group_days', { g });
  return (data as Day[]) ?? [];
}

/**
 * "Training together" streak: consecutive days on which enough of the group trained
 * (a couple: both; bigger groups: at least half). Today counts once it happens; until then the streak runs to yesterday.
 */
export function groupStreak(days: Day[], memberCount: number) {
  const need = memberCount <= 2 ? Math.max(1, memberCount) : Math.ceil(memberCount / 2);
  const per: Record<string, Set<string>> = {};
  days.forEach(d => { (per[d.day] ??= new Set()).add(d.user_id); });
  const ok = (iso: string) => (per[iso]?.size ?? 0) >= need;
  let day = todayISO();
  if (!ok(day)) day = addDays(day, -1);
  let n = 0;
  while (ok(day)) { n++; day = addDays(day, -1); }
  const last7 = Array.from({ length: 7 }, (_, i) => ok(addDays(todayISO(), i - 6)));
  return { n, need, last7, todayDone: ok(todayISO()), trainedToday: per[todayISO()] ?? new Set<string>() };
}

/** Sessions per person this week (Monday first) */
export function weekBoard(days: Day[]) {
  const t = new Date(todayISO() + 'T00:00:00');
  const monday = addDays(todayISO(), -((t.getDay() + 6) % 7));
  const count: Record<string, number> = {};
  days.filter(d => d.day >= monday).forEach(d => { count[d.user_id] = (count[d.user_id] ?? 0) + 1; });
  const daysLeft = 7 - ((t.getDay() + 6) % 7) - 1;
  return { count, monday, daysLeft };
}

export const inviteUrl = (code: string) =>
  `${Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : 'https://trainer-manager.tevez7549.workers.dev'}/j/${code}`;
export const prettyCode = (c: string) => `${c.slice(0, 3)}-${c.slice(3)}`;

export function inviteText(name: string, code: string) {
  return tr(`มาออกกำลังกายด้วยกันในกลุ่ม "${name}" ใน Trainer Manager\nกดลิงก์นี้เพื่อเข้ากลุ่ม: ${inviteUrl(code)}\n(หรือใส่โค้ด ${prettyCode(code)})`);
}

export async function copyText(t: string) {
  try { if (Platform.OS === 'web') { await navigator.clipboard.writeText(t); return true; } } catch { /* fall through */ }
  return false;
}
export function shareLine(text: string) {
  Linking.openURL(`https://line.me/R/share?text=${encodeURIComponent(text)}`);
}
/** The phone's own share sheet (web: navigator.share when there is one, else copy) */
export async function shareAny(text: string, url?: string): Promise<'shared' | 'copied' | 'none'> {
  try {
    if (Platform.OS === 'web') {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.share) { await nav.share({ text, url }); return 'shared'; }
      return (await copyText(url ? `${text}` : text)) ? 'copied' : 'none';
    }
    await Share.share({ message: text });
    return 'shared';
  } catch { return 'none'; }
}

/** A join link opened before signing in waits here until the person is in */
const PENDING = 'tm-join-code';
export const rememberJoin = (code: string) => setJSON(PENDING, code);
export async function takePendingJoin(): Promise<string | null> {
  const c = await getJSON<string>(PENDING);
  if (c) await setJSON(PENDING, null);
  return c || null;
}

export const ago = (iso: string | null) => {
  if (!iso) return 'ยังไม่เคยบันทึก';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'วันนี้' : d === 1 ? 'เมื่อวาน' : `${d} วันก่อน`;
};
export const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 999);
