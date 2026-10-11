import { Text, View } from 'react-native';
import { C, F } from '../lib/theme';
import { TallyMark } from './Icon';

/** Lockup: Tally mark + "Trainer Manager" in Anuphan bold */
export function Lockup({ height = 32, on }: { height?: number; on?: string }) {
  return (
    <View accessibilityRole="image" accessibilityLabel="Trainer Manager" style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(height * 0.15) }}>
      <TallyMark size={height} on={on} />
      <Text style={{ fontFamily: F.display, fontWeight: '700', fontSize: Math.round(height * 0.62), lineHeight: Math.round(height * 0.8), color: C.fg, letterSpacing: -0.3 }}>Trainer Manager</Text>
    </View>
  );
}
