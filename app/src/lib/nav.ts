import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { getJSON, setJSON } from './store';
import type { Role } from './gym';

export type Tab = { k: string; t: string; icon: string; href: string };

/** One bottom menu per job. Things used rarely live under "เพิ่มเติม". */
export const ownerTabs = (g: string): Tab[] => [
  { k: 'home', t: 'ภาพรวม', icon: 'house', href: `/gym/${g}` },
  { k: 'pt', t: 'เทรนเนอร์', icon: 'dumbbell', href: `/gym/${g}/pt` },
  { k: 'classes', t: 'คลาส', icon: 'calendar-days', href: `/gym/${g}/classes` },
  { k: 'members', t: 'สมาชิก', icon: 'users', href: `/gym/${g}/members` },
  { k: 'more', t: 'เพิ่มเติม', icon: 'menu', href: `/gym/${g}/more` },
];
/** Counter mode: checking people in, walk-ins, selling. Separate from the owner's overview. */
export const counterTabs = (g: string): Tab[] => [
  { k: 'counter', t: 'เช็กอิน', icon: 'circle-check', href: `/gym/${g}/counter` },
  { k: 'pt', t: 'เทรนเนอร์', icon: 'dumbbell', href: `/gym/${g}/pt?desk=1` },
  { k: 'classes', t: 'คลาส', icon: 'calendar-days', href: `/gym/${g}/classes?desk=1` },
  { k: 'members', t: 'สมาชิก', icon: 'users', href: `/gym/${g}/members?desk=1` },
  { k: 'me', t: 'ฉัน', icon: 'user', href: `/me?from=desk&g=${g}` },
];
export const operatorTabs = counterTabs;
export const TRAINER_TABS: Tab[] = [
  { k: 'today', t: 'วันนี้', icon: 'calendar', href: '/trainer' },
  { k: 'calendar', t: 'ปฏิทิน', icon: 'calendar-days', href: '/trainer/calendar' },
  { k: 'clients', t: 'ลูกเทรน', icon: 'users', href: '/trainer/clients' },
  { k: 'library', t: 'คลังท่า', icon: 'dumbbell', href: '/trainer/library' },
  { k: 'me', t: 'ฉัน', icon: 'user', href: '/me?from=trainer' },
];
export const MEMBER_TABS: Tab[] = [
  { k: 'home', t: 'หน้าแรก', icon: 'house', href: '/?me=1' },
  { k: 'train', t: 'ออกกำลัง', icon: 'dumbbell', href: '/my/train' },
  { k: 'food', t: 'อาหาร', icon: 'utensils', href: '/my/food' },
  { k: 'group', t: 'กลุ่ม', icon: 'users', href: '/groups' },
  { k: 'me', t: 'ฉัน', icon: 'user', href: '/me?from=member' },
];

export function tabsFor(role: Role | null | undefined, gymId?: string, desk = false): Tab[] {
  if (!gymId) return [];
  if (desk && (role === 'owner' || role === 'admin' || role === 'operator')) return counterTabs(gymId);
  if (role === 'owner' || role === 'admin') return ownerTabs(gymId);
  if (role === 'operator') return operatorTabs(gymId);
  return [];
}

export type Place = { role: Role; gym: { id: string; name: string; branch: string | null } };
const LAST = 'tm-last-gym';
export const rememberGym = (id: string) => setJSON(LAST, id);

/** Where someone lands when they open the app: their own job, no picking */
export async function landing(userId: string): Promise<{ to: string } | { member: true }> {
  const s = await supabase.from('gym_staff').select('role,gym_id').eq('user_id', userId).eq('active', true);
  const staff = (s.data as { role: Role; gym_id: string }[]) ?? [];
  if (staff.length) {
    const last = await getJSON<string>(LAST);
    const rank = (r: Role) => (r === 'owner' ? 0 : r === 'admin' ? 1 : r === 'operator' ? 2 : 3);
    const pick = staff.find(x => x.gym_id === last) ?? [...staff].sort((a, b) => rank(a.role) - rank(b.role))[0];
    // gym trainers use the app for themselves; their PT schedule is a card on the home page
    if (pick.role === 'trainer') return { member: true };
    if (pick.role === 'operator') return { to: `/gym/${pick.gym_id}/counter` };
    return { to: `/gym/${pick.gym_id}` };
  }
  // everyone else uses the app for themselves: food, body, training, their gym card
  return { member: true };
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

/** Everything this person can switch to: trainer mode (own trainer account or a gym's trainer) and each gym they run or work the desk at */
export function useModes() {
  const { profile } = useAuth();
  const places = usePlaces();
  const [trainer, setTrainer] = useState<boolean | null>(null);
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    supabase.from('trainer_profiles').select('user_id').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => setTrainer(!!data));
  }, [profile]));
  const isTrainer = !!trainer || (places ?? []).some(p => p.role === 'trainer');
  const gyms = (places ?? []).filter(p => p.role !== 'trainer');
  return { ready: trainer !== null && places !== null, isTrainer, hasOwnTrainerAccount: !!trainer, gyms, places };
}

/** Where a gym role lands */
export const gymHref = (p: Place) => (p.role === 'operator' ? `/gym/${p.gym.id}/counter` : `/gym/${p.gym.id}`);
