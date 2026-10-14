import { Image, Text, View } from 'react-native';
import { C, F } from '../lib/theme';

/** The Dogfits pitbull mark: Volt on dark, brand-strong on light (Volt on a light ground can't be seen) */
export function DogMark({ size = 32 }: { size?: number }) {
  return <Image source={{ uri: C.scheme === 'light' ? '/logo-light.png?v=3' : '/logo-dark.png?v=3' }} accessibilityIgnoresInvertColors
    style={{ width: Math.round(size * 0.79), height: size }} resizeMode="contain" />;
}

/** Lockup: pitbull mark + "Dogfits" in Anuphan bold */
export function Lockup({ height = 32 }: { height?: number; on?: string }) {
  return (
    <View accessibilityRole="image" accessibilityLabel="Dogfits" style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(height * 0.22) }}>
      <DogMark size={height} />
      <Text style={{ fontFamily: F.display, fontWeight: '700', fontSize: Math.round(height * 0.62), lineHeight: Math.round(height * 0.8), color: C.fg, letterSpacing: -0.3 }}>Dogfits</Text>
    </View>
  );
}
