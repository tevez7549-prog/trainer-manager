import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isDesk, isManager, ROLE_TH, type Gym, type Role } from '../lib/gym';
import { C, F } from '../lib/theme';
import { H, Pill, Screen, Txt, useWide } from './index';
import { Icon, type IconName } from './Icon';
import { Lockup } from './Logo';

export type GymTab = 'home' | 'counter' | 'members' | 'plans' | 'staff' | 'holidays' | 'import' | 'settings';

const NAV: { k: GymTab; t: string; icon: IconName; show: (r: Role | null) => boolean }[] = [
  { k: 'home', t: 'ภาพรวม', icon: 'house', show: () => true },
  { k: 'counter', t: 'เคาน์เตอร์', icon: 'circle-check', show: isDesk },
  { k: 'members', t: 'สมาชิก', icon: 'users', show: isDesk },
  { k: 'plans', t: 'แพ็กเกจสมาชิก', icon: 'tag', show: isDesk },
  { k: 'staff', t: 'ทีมงาน', icon: 'id-card', show: () => true },
  { k: 'holidays', t: 'วันหยุดยิม', icon: 'calendar-off', show: isManager },
  { k: 'import', t: 'นำเข้า Excel', icon: 'file-up', show: isManager },
  { k: 'settings', t: 'ตั้งค่ายิม', icon: 'settings', show: isManager },
];

/** Gym pages: a side menu on computer screens, the normal phone column otherwise */
export function GymFrame({ id, gym, role, active, children }: { id: string; gym: Gym | null; role: Role | null; active: GymTab; children: ReactNode }) {
  const wide = useWide();
  if (!wide) return <Screen>{children}</Screen>;
  const go = (k: GymTab) => router.replace((k === 'home' ? `/gym/${id}` : `/gym/${id}/${k}`) as any);
  return (
    <SafeAreaView style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <View style={{ width: 240, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line, paddingVertical: 20, paddingHorizontal: 12, gap: 4 }}>
        <Pressable accessibilityRole="link" accessibilityLabel="หน้าแรก" onPress={() => router.replace('/')} style={{ paddingHorizontal: 12, paddingBottom: 16 }}>
          <Lockup height={26} on={C.surface} />
        </Pressable>
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
