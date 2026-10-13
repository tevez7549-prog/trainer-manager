import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';

/** A QR code drawn as one SVG path (dark modules on a light square, with the standard quiet zone) */
export function QrCode({ value, size = 168, fg = '#0E0F10', bg = '#FFFFFF' }: { value: string; size?: number; fg?: string; bg?: string }) {
  const { d, n } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(value);
    q.make();
    const count = q.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { d: path, n: count + 8 };
  }, [value]);
  return (
    <View accessibilityRole="image" accessibilityLabel={value} style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', backgroundColor: bg }}>
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} {...({ shapeRendering: "crispEdges" } as any)}>
        <Rect x={0} y={0} width={n} height={n} fill={bg} />
        <Path d={d} fill={fg} />
      </Svg>
    </View>
  );
}
