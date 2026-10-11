import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../lib/theme';
import type { Tab } from '../lib/nav';
import { Txt } from './index';
import { Icon } from './Icon';

/** Bottom menu: one row of 2–5 big targets, the current one in brand colour */
export function TabBar({ tabs, active }: { tabs: Tab[]; active: string }) {
  const { bottom } = useSafeAreaInsets();
  if (!tabs.length) return null;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6, paddingBottom: Math.max(bottom, 8) }}>
      {tabs.map(t => {
        const on = t.k === active;
        return (
          <Pressable key={t.k} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.t}
            onPress={() => { if (!on) router.replace(t.href as any); }}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Icon name={t.icon} size={24} color={on ? C.accent : C.muted} />
            <Txt size={12} bold={on} style={{ color: on ? C.accent : C.muted, fontFamily: F.body }}>{t.t}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
