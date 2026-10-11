import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { getJSON, setJSON } from './store';
import type { Role } from './gym';

export type Tab = { k: string; t: string; icon: string; href: string };

/** One bottom menu per job. Things used rarely live under "เพิ่มเติม". */
export const ownerTabs = (g: string): Tab[] => [
  { k: 'home', t: 'วันนี้', icon: 'house', href: `/gym/${g}` },
  { k: 'counter', t: 'เช็กอิน', icon: 'circle-check', href: `/gym/${g}/counter` },
  { k: 'members', t: 'สมาชิก', icon: 'users', href: `/gym/${g}/members` },
  { k: 'pt', t: 'PT', icon: 'dumbbell', href: `/gym/${g}/pt` },
  { k: 'more', t: 'เพิ่มเติม', icon: 'menu', href: `/gym/${g}/more` },
];
export const operatorTabs = (g: string): Tab[] => [
  { k: 'counter', t: 'เช็กอิน', icon: 'circle-check', href: `/gym/${g}/counter` },
  { k: 'members', t: 'สมาชิก', icon: 'users', href: `/gym/${g}/members` },
  { k: 'me', t: 'ฉัน', icon: 'user', href: `/me?from=desk&g=${g}` },
];
export const TRAINER_TABS: Tab[] = [
  { k: 'appts', t: 'นัด', icon: 'calendar', href: '/trainer' },
  { k: 'clients', t: 'ลูกเทรน', icon: 'users', href: '/trainer/clients' },
  { k: 'me', t: 'ฉัน', icon: 'user', href: '/me?from=trainer' },
];
export const MEMBER_TABS: Tab[] = [
  { k: 'card', t: 'บัตร', icon: 'id-card', href: '/' },
  { k: 'me', t: 'ฉัน', icon: 'user', href: '/me?from=member' },
];

export function tabsFor(role: Role | null | undefined, gymId?: string): Tab[] {
  if (!gymId) return [];
  if (role === 'owner' || role === 'admin') return ownerTabs(gymId);
  if (role === 'operator') return operatorTabs(gymId);
  return [];
}

export type Place = { role: Role; gym: { id: string; name: string; branch: string | null } };
const LAST = 'tm-last-gym';
export const rememberGym = (id: string) => setJSON(LAST, id);

/** Where someone lands when they open the app: their own job, no picking */
export async function landing(userId: string): Promise<{ to: string } | { member: true } | { start: true }> {
  const [s, mem, tc] = await Promise.all([
    supabase.from('gym_staff').select('role,gym_id').eq('user_id', userId).eq('active', true),
    supabase.from('members').select('id', { count: 'exact', head: true }).eq('profile_id', userId),
    supabase.from('trainer_clients').select('id', { count: 'exact', head: true }).eq('client_id', userId).eq('status', 'active'),
  ]);
  const staff = (s.data as { role: Role; gym_id: string }[]) ?? [];
  if (staff.length) {
    const last = await getJSON<string>(LAST);
    const rank = (r: Role) => (r === 'owner' ? 0 : r === 'admin' ? 1 : r === 'operator' ? 2 : 3);
    const pick = staff.find(x => x.gym_id === last) ?? [...staff].sort((a, b) => rank(a.role) - rank(b.role))[0];
    if (pick.role === 'trainer') return { to: '/trainer' };
    if (pick.role === 'operator') return { to: `/gym/${pick.gym_id}/counter` };
    return { to: `/gym/${pick.gym_id}` };
  }
  if ((mem.count ?? 0) > 0 || (tc.count ?? 0) > 0) return { member: true };
  return { start: true };
}

/** My gyms and roles (for the gym switcher) */
export function usePlaces() {
  const { profile } = useAuth();
  const [places, setPlaces] = useState<Place[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    supabase.from('gym_staff').select('role, gym:gyms(id,name,branch)').eq('user_id', profile.id).eq('active', true)
      .then(({ data }) => setPlaces(((data as any) ?? []).filter((p: any) => p.gym)));
  }, [profile]));
  return places;
}
