import { useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import { C, R } from '../lib/theme';
import { Txt } from './index';
import { Icon } from './Icon';

/** % of calories from carb / protein / fat; always adds up to 100 */
export type Split = { c: number; p: number; f: number };

export const STYLES: { k: string; t: string; why: string; s: Split; db: 'balanced' | 'high_carb' | 'low_carb' | 'custom' }[] = [
  { k: 'balanced', t: 'สมดุล', why: 'มาตรฐาน สำหรับคนทั่วไปและคนออกกำลังกาย', s: { c: 50, p: 25, f: 25 }, db: 'balanced' },
  { k: 'high_protein', t: 'โปรตีนสูง', why: 'เพิ่มหรือรักษามวลกล้ามเนื้อ', s: { c: 40, p: 35, f: 25 }, db: 'custom' },
  { k: 'very_high_protein', t: 'โปรตีนสูงพิเศษ', why: 'นักเพาะกาย และช่วงลดน้ำหนักแบบเข้มข้น', s: { c: 30, p: 45, f: 25 }, db: 'custom' },
  { k: 'low_fat', t: 'ไขมันต่ำ', why: 'ลดน้ำหนัก กินข้าวได้ตามปกติ', s: { c: 55, p: 30, f: 15 }, db: 'custom' },
  { k: 'low_carb', t: 'คาร์บต่ำ', why: 'คุมน้ำตาล อิ่มนาน', s: { c: 25, p: 35, f: 40 }, db: 'low_carb' },
  { k: 'high_carb', t: 'คาร์บสูง', why: 'ซ้อมหนัก วิ่ง ปั่น เล่นกีฬา', s: { c: 60, p: 20, f: 20 }, db: 'high_carb' },
];

export const gramsOf = (kcal: number, s: Split) => ({ c: Math.round(kcal * s.c / 100 / 4), p: Math.round(kcal * s.p / 100 / 4), f: Math.round(kcal * s.f / 100 / 9) });

/** Pick a preset, or drag the two handles: left = carb | protein, right = protein | fat */
export function MacroSplit({ kcal, value, onChange }: { kcal: number; value: Split; onChange: (s: Split) => void }) {
  const preset = STYLES.find(x => x.s.c === value.c && x.s.p === value.p && x.s.f === value.f)?.k ?? null;
  const g = gramsOf(kcal, value);
  const cards: [string, number, number, string, string][] = [
    ['คาร์บ', g.c, value.c, C.carb, 'utensils'], ['โปรตีน', g.p, value.p, C.protein, 'dumbbell'], ['ไขมัน', g.f, value.f, C.fat, 'flame'],
  ];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: R.field, backgroundColor: C.surface2, overflow: 'hidden' }}>
        {STYLES.map((x, i) => {
          const on = preset === x.k;
          return (
            <Pressable key={x.k} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(x.s)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8,
                borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flex: 1 }}>
                <Txt bold={on} style={on ? { color: C.accent } : undefined}>{x.t}</Txt>
                <Txt muted size={12.5}>{x.why} · C{x.s.c} P{x.s.p} F{x.s.f}</Txt>
              </View>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.accent : C.line, alignItems: 'center', justifyContent: 'center' }}>
                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Txt bold size={14}>หรือปรับด้วยตัวเอง</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {cards.map(([name, grams, pct, color, icon]) => (
          <View key={name} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12, borderRadius: R.field, backgroundColor: C.surface2 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }}>
              <Icon name={icon} size={18} color={color} />
            </View>
            <Txt bold size={14}>{name}</Txt>
            <Txt size={15} style={{ fontVariant: ['tabular-nums'] }}>{grams} ก.</Txt>
            <Txt muted size={13} style={{ fontVariant: ['tabular-nums'] }}>{pct}%</Txt>
          </View>
        ))}
      </View>
      <TwoThumb value={value} onChange={onChange} />
    </View>
  );
}

const MIN = 5;   // each macro keeps at least 5 %

function TwoThumb({ value, onChange }: { value: Split; onChange: (s: Split) => void }) {
  const [w, setW] = useState(0);
  const a = value.c, b = value.c + value.p;           // handle positions in %
  const ref = useRef({ a, b, w, start: 0, onChange });
  ref.current = { ...ref.current, a, b, w, onChange };

  const make = (which: 'a' | 'b') => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { ref.current.start = which === 'a' ? ref.current.a : ref.current.b; },
    onPanResponderMove: (_e, gs) => {
      const { w: W, a: A, b: B } = ref.current;
      if (!W) return;
      const pos = Math.round(ref.current.start + (gs.dx / W) * 100);
      if (which === 'a') { const na = Math.max(MIN, Math.min(B - MIN, pos)); ref.current.onChange({ c: na, p: B - na, f: 100 - B }); }
      else { const nb = Math.max(A + MIN, Math.min(100 - MIN, pos)); ref.current.onChange({ c: A, p: nb - A, f: 100 - nb }); }
    },
  });
  const pa = useRef(make('a')).current, pb = useRef(make('b')).current;
  const nudge = (which: 'a' | 'b', d: number) => {
    if (which === 'a') { const na = Math.max(MIN, Math.min(b - MIN, a + d)); onChange({ c: na, p: b - na, f: 100 - b }); }
    else { const nb = Math.max(a + MIN, Math.min(100 - MIN, b + d)); onChange({ c: a, p: nb - a, f: 100 - nb }); }
  };

  const thumb = (which: 'a' | 'b', at: number, handlers: any, label: string) => (
    <View {...handlers.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e: any) => nudge(which, e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ position: 'absolute', left: `${at}%`, top: -10, marginLeft: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF',
        borderWidth: 1, borderColor: C.line, cursor: 'grab' } as any} />
  );

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: 12, borderRadius: R.pill, flexDirection: 'row', overflow: 'visible' }}>
        <View style={{ width: `${value.c}%`, height: 12, backgroundColor: C.carb, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} />
        <View style={{ width: `${value.p}%`, height: 12, backgroundColor: C.protein }} />
        <View style={{ width: `${value.f}%`, height: 12, backgroundColor: C.fat, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} />
        {thumb('a', a, pa, `คาร์บ ${value.c}% โปรตีน ${value.p}%`)}
        {thumb('b', b, pb, `โปรตีน ${value.p}% ไขมัน ${value.f}%`)}
      </View>
    </View>
  );
}
