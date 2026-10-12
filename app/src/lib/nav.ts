
export type Tab = { k: string; t: string; icon: string; href: string };

/** Bottom menus */
export const MEMBER_TABS: Tab[] = [
  { k: 'home', t: 'หน้าแรก', icon: 'house', href: '/?me=1' },
  { k: 'train', t: 'ออกกำลัง', icon: 'dumbbell', href: '/my/train' },
  { k: 'food', t: 'อาหาร', icon: 'utensils', href: '/my/food' },
  { k: 'group', t: 'กลุ่ม', icon: 'users', href: '/groups' },
  { k: 'me', t: 'ฉัน', icon: 'user', href: '/me?from=member' },
];
