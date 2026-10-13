import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isDesk, isManager, ROLE_TH, type Gym, type Role } from '../lib/gym';
import { rememberGym, tabsFor } from '../lib/nav';
import { C, F } from '../lib/theme';
import { H, Pill, Screen, Txt, useWide } from './index';
import { Icon, type IconName } from './Icon';
import { Lockup } from './Logo';
import { TabBar } from './TabBar';

export type GymTab = 'home' | 'counter' | 'members' | 'pt' | 'more' | 'plans' | 'staff' | 'holidays' | 'import' | 'settings';

const NAV: { k: GymTab; t: string; icon: IconName; show: (r: Role | null) => boolean }[] = [
  { k: 'home', t: 'ภาพรวม', icon: 'house', show: isManager },
  { k: 'counter', t: 'เช็กอิน', icon: 'circle-check', show: isDesk },
  { k: 'members', t: 'สมาชิก', icon: 'users', show: isDesk },
  { k: 'pt', t: 'เทรนเนอร์และ PT', icon: 'dumbbell', show: isManager },
  { k: 'plans', t: 'แพ็กเกจและราคา', icon: 'tag', show: isManager },
  { k: 'staff', t: 'ทีมงาน', icon: 'id-card', show: isManager },
  { k: 'holidays', t: 'วันหยุดยิม', icon: 'calendar-off', show: isManager },
  { k: 'import', t: 'นำเข้า Excel', icon: 'file-up', show: isManager },
  { k: 'settings', t: 'ข้อมูลยิม', icon: 'settings', show: isManager },
  { k: 'more', t: 'เพิ่มเติม', icon: 'menu', show: () => true },
];
// pages reached from "เพิ่มเติม" keep that tab lit
const TAB_OF: Partial<Record<GymTab, string>> = { plans: 'more', staff: 'more', holidays: 'more', import: 'more', settings: 'more' };

/** Gym pages: a side menu on computer screens, a bottom menu on phones */
export function GymFrame({ id, gym, role, active, desk, children }: { id: string; gym: Gym | null; role: Role | null; active: GymTab; /** counter mode menu */ desk?: boolean; children: ReactNode }) {
  const wide = useWide();
  useEffect(() => { if (role) rememberGym(id); }, [id, role]);
  if (role === 'trainer') return <Redirect href={'/trainer' as any} />;
  if (!wide) {
    const counter = desk || active === 'counter' || role === 'operator';
    const tab = TAB_OF[active] ?? (counter && active === 'more' ? 'me' : active);
    return <Screen footer={<TabBar tabs={tabsFor(role, id, counter)} active={tab} />}>{children}</Screen>;
  }
  const go = (k: GymTab) => router.replace((k === 'home' ? `/gym/${id}` : `/gym/${id}/${k}`) as any);
  return (
    <SafeAreaView style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <View style={{ width: 240, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line, paddingVertical: 20, paddingHorizontal: 12, gap: 4 }}>
        <View style={{ paddingHorizontal: 12, paddingBottom: 16 }}>
          <Lockup height={26} on={C.surface} />
        </View>
        <View style={{ paddingHorizontal: 10, paddingBottom: 14, gap: 4 }}>
          <H size={19}>{gym?.name ?? '…'}</H>
          {gym?.branch ? <Txt muted size={13}>สาขา{gym.branch}</Txt> : null}
          {role ? <View style={{ alignSelf: 'flex-start' }}><Pill text={ROLE_TH[role]} kind={role === 'owner' ? 'ok' : 'info'} /></View> : null}
        </View>
        {NAV.filter(n => n.show(role)).map(n => {
          const on = n.k === active;
          return (
            <Pressable key={n.k} accessibilityRole="link" accessibilityState={{ selected: on }} onPress={() => go(n.k)}
              style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 44, borderRadius: 12,
                backgroundColor: on ? C.accentSoft : hovered || pressed ? C.surface2 : 'transparent' })}>
              <Icon name={n.icon} size={20} color={on ? C.accent : C.muted} />
              <Txt size={15} bold={on} style={{ color: on ? C.accent : C.fg, fontFamily: F.body }}>{n.t}</Txt>
            </Pressable>
          );
        })}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', paddingHorizontal: 28, paddingVertical: 24, gap: 16 }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
