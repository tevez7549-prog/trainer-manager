
export type Tab = { k: string; t: string; icon: string; href: string };

/** Bottom menus */
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
