import { supabase, thError } from './supabase';
import { daysBetween, todayISO } from './gym';

export type Kind = 'user' | 'trainer' | 'gym';
export const KINDS: { k: Kind; t: string }[] = [
  { k: 'user', t: 'ผู้ใช้ (ฟีเจอร์เต็ม)' }, { k: 'trainer', t: 'เทรนเนอร์' }, { k: 'gym', t: 'ยิม' },
];
export type Sub = { id: string; kind: Kind; status: 'trial' | 'active' | 'expired' | 'cancelled'; trial_ends_at: string | null; current_period_end: string | null };
export type AdminUser = {
  id: string; uid: number; display_name: string; phone: string | null; email: string | null; status: 'active' | 'suspended';
  is_super_admin: boolean; dev_note: string | null; created_at: string;
  subscriptions: Sub[]; gym_staff: { role: string; active: boolean; gyms: { name: string; branch: string | null } | null }[];
};
export const USER_COLS = 'id,uid,display_name,phone,email,status,is_super_admin,dev_note,created_at,'
  + 'subscriptions(id,kind,status,trial_ends_at,current_period_end),gym_staff(role,active,gyms(name,branch))';

export const ACT_TH: Record<string, string> = {
  create_user: 'เพิ่มผู้ใช้', delete_user: 'ลบผู้ใช้', suspend_user: 'ระงับบัญชี', unsuspend_user: 'ปลดระงับ', set_email: 'เปลี่ยนอีเมล',
  set_password: 'ตั้งรหัสผ่านใหม่', edit_profile: 'แก้ข้อมูล', edit_plan: 'แก้แผน', apply_holiday: 'ใช้วันหยุดยิม',
  add_staff: 'เพิ่มทีมงาน', freeze_member: 'พักสมาชิก', end_freeze: 'จบการพักสมาชิก', sell_membership: 'ขายแพ็กเกจสมาชิก', import_members: 'นำเข้าสมาชิก',
};

/** Call the server-side admin function (create / delete / suspend / email / password) */
export async function adminFn(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let m = error.message;
    try { const j = await (error as any).context.json(); m = j.error || m; } catch { /* keep message */ }
    throw new Error(thError(m));
  }
  if (data?.error) throw new Error(thError(data.error));
  return data;
}

export const audit = (actor: string, action: string, target_id: string, detail: Record<string, unknown> = {}) =>
  supabase.from('audit_log').insert({ actor_id: actor, action, target: 'profiles', target_id, detail });

export const subOf = (u: Pick<AdminUser, 'subscriptions'>, k: Kind) => {
  const l = (u.subscriptions ?? []).filter(s => s.kind === k);
  return l.find(s => s.status === 'trial' || s.status === 'active') ?? l[0];
};
export const liveSubs = (u: Pick<AdminUser, 'subscriptions'>) => (u.subscriptions ?? []).filter(s => s.status === 'trial' || s.status === 'active');
export const daysTo = (iso: string) => daysBetween(todayISO(), iso);

export type PlanState = Record<Kind, { st: 'none' | 'trial' | 'active'; until: string }>;
export function planState(u: AdminUser | null): PlanState {
  const o = {} as PlanState;
  KINDS.forEach(({ k }) => {
    const s = u ? subOf(u, k) : undefined;
    o[k] = s && (s.status === 'trial' || s.status === 'active')
      ? { st: s.status, until: (s.status === 'trial' ? s.trial_ends_at : s.current_period_end) ?? '' }
      : { st: 'none', until: '' };
  });
  return o;
}

/** Write plan changes; returns the kinds that changed */
export async function savePlans(userId: string, u: AdminUser | null, plans: PlanState): Promise<Kind[]> {
  const changed: Kind[] = [];
  for (const { k } of KINDS) {
    const want = plans[k], cur = u ? subOf(u, k) : undefined;
    const row = { status: want.st, trial_ends_at: want.st === 'trial' ? want.until || null : null, current_period_end: want.st === 'active' ? want.until || null : null };
    if (want.st === 'none') {
      if (cur && (cur.status === 'trial' || cur.status === 'active')) {
        const r = await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', cur.id); if (r.error) throw r.error; changed.push(k);
      }
    } else if (cur) {
      if (cur.status !== row.status || (cur.trial_ends_at ?? null) !== row.trial_ends_at || (cur.current_period_end ?? null) !== row.current_period_end) {
        const r = await supabase.from('subscriptions').update(row).eq('id', cur.id); if (r.error) throw r.error; changed.push(k);
      }
    } else {
      const r = await supabase.from('subscriptions').insert({ user_id: userId, kind: k, ...row }); if (r.error) throw r.error; changed.push(k);
    }
  }
  return changed;
}

export function genPassword() {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
