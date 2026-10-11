import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isDesk, isManager, ROLE_TH, type Gym, type Role } from '../lib/gym';
import { C, F } from '../lib/theme';
import { H, Pill, Screen, Txt, useWide } from './index';

export type GymTab = 'home' | 'counter' | 'members' | 'plans' | 'staff' | 'import' | 'settings';

const NAV: { k: GymTab; t: string; icon: string; show: (r: Role | null) => boolean }[] = [
  { k: 'home', t: 'ภาพรวม', icon: '🏠', show: () => true },
  { k: 'counter', t: 'เคาน์เตอร์', icon: '✅', show: isDesk },
  { k: 'members', t: 'สมาชิก', icon: '👥', show: isDesk },
  { k: 'plans', t: 'แพ็กเกจสมาชิก', icon: '🏷', show: isDesk },
  { k: 'staff', t: 'ทีมงาน', icon: '🧑‍🤝‍🧑', show: () => true },
  { k: 'import', t: 'นำเข้า Excel', icon: '📥', show: isManager },
  { k: 'settings', t: 'ตั้งค่ายิม', icon: '⚙️', show: isManager },
];

/** Gym pages: a side menu on computer screens, the normal phone column otherwise */
export function GymFrame({ id, gym, role, active, children }: { id: string; gym: Gym | null; role: Role | null; active: GymTab; children: ReactNode }) {
  const wide = useWide();
  if (!wide) return <Screen>{children}</Screen>;
  const go = (k: GymTab) => router.replace((k === 'home' ? `/gym/${id}` : `/gym/${id}/${k}`) as any);
  return (
    <SafeAreaView style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <View style={{ width: 240, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line, paddingVertical: 20, paddingHorizontal: 12, gap: 4 }}>
        <Pressable onPress={() => router.replace('/')} style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
          <Txt muted size={13}>‹ Trainer Manager</Txt>
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
              style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                backgroundColor: on ? C.accentSoft : hovered || pressed ? C.surface2 : 'transparent' })}>
              <Txt size={15}>{n.icon}</Txt>
              <Txt size={14.5} bold={on} style={{ color: on ? C.accentInk : C.fg, fontFamily: F.body }}>{n.t}</Txt>
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
