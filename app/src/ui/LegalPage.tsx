import { View } from 'react-native';
import { router } from 'expo-router';
import { Btn, Card, H, Screen, Txt } from './index';
import { C } from '../lib/theme';
import { LEGAL_UPDATED } from '../lib/legal';

export function LegalPage({ title, sections }: { title: string; sections: { head?: string; points: string[] }[] }) {
  return (
    <Screen>
      <Btn kind="ghost" label="‹ กลับ" onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} style={{ alignSelf: 'flex-start', minHeight: 40 }} />
      <H size={24}>{title}</H>
      <Txt muted size={13}>Dogfits · ปรับปรุงล่าสุด {LEGAL_UPDATED}</Txt>
      {sections.map((s, k) => (
        <Card key={k}>
          {s.head ? <H size={17}>{s.head}</H> : null}
          {s.points.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
              <Txt bold style={{ color: C.accent }}>{i + 1}.</Txt>
              <Txt style={{ flex: 1 }}>{p}</Txt>
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
