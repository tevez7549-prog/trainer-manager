import { View } from 'react-native';
import { C, R } from '../lib/theme';
import type { Target, Totals } from '../lib/me';
import { H, Txt } from './index';

const pct = (a: number, b: number | null | undefined) => (b ? Math.min(1, a / b) : 0);

function Bar({ value, max, color, over }: { value: number; max?: number | null; color: string; over?: boolean }) {
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: max ?? 0, now: Math.round(value) }}
      style={{ height: 8, borderRadius: R.pill, backgroundColor: C.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${pct(value, max) * 100}%`, height: 8, borderRadius: R.pill, backgroundColor: over ? C.over : color }} />
    </View>
  );
}

/** Calories against the target, then protein / carb / fat side by side with what is left (or over) */
export function DayTotals({ t, target, compact }: { t: Totals; target: Target | null; compact?: boolean }) {
  const kcalOver = !!target && t.kcal > target.kcal;
  const left = target ? Math.round(target.kcal - t.kcal) : null;
  const cols: [string, number, number | null | undefined, string][] = [
    ['โปรตีน', t.p, target?.protein_g, C.protein], ['คาร์บ', t.c, target?.carb_g, C.carb], ['ไขมัน', t.f, target?.fat_g, C.fat],
  ];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Txt bold style={{ flex: 1 }}>แคลอรี</Txt>
        <H size={compact ? 28 : 32} style={{ fontVariant: ['tabular-nums'] }}>{Math.round(t.kcal).toLocaleString('en-US')}</H>
        <Txt muted size={14}>{target ? `/ ${target.kcal.toLocaleString('en-US')} kcal` : 'kcal'}</Txt>
      </View>
      {target ? <>
        <Bar value={t.kcal} max={target.kcal} color={C.accent} over={kcalOver} />
        <Txt size={13} style={{ color: kcalOver ? C.over : C.muted, marginTop: -6 }}>{kcalOver ? `เกิน ${-left!} kcal` : `เหลือ ${left} kcal`}</Txt>
      </> : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {cols.map(([name, v, max, color]) => {
          const over = !!max && v > max;
          return (
            <View key={name} style={{ flex: 1, gap: 6, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Txt bold size={14} style={{ flex: 1 }}>{name}</Txt>
                <Txt muted size={12.5} style={{ fontVariant: ['tabular-nums'] }}>{Math.round(v)}{max ? `/${max}` : ' g'}</Txt>
              </View>
              <Bar value={v} max={max ?? Math.max(v, 1)} color={color} over={over} />
              {max ? <Txt size={12.5} bold={over} style={{ color: over ? C.over : C.muted }}>{over ? `เกิน ${Math.round(v - max)} ก.` : `เหลือ ${Math.round(max - v)} ก.`}</Txt> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Small bar chart for a series over time (weight, waist …). Oldest on the left. */
export function MiniChart({ points, unit, height = 120 }: { points: { label: string; v: number }[]; unit: string; height?: number }) {
  if (points.length < 2) return <Txt muted size={13}>บันทึกอย่างน้อย 2 ครั้งเพื่อดูกราฟ</Txt>;
  const vs = points.map(p => p.v), min = Math.min(...vs), max = Math.max(...vs);
  const span = max - min || 1;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }} accessibilityLabel={`กราฟ ${points.map(p => `${p.label} ${p.v} ${unit}`).join(', ')}`}>
        {points.map((p, i) => {
          const h = 16 + ((p.v - min) / span) * (height - 36);
          const last = i === points.length - 1;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              {last || i === 0 ? <Txt size={11} bold={last} style={{ color: last ? C.accent : C.muted }}>{p.v}</Txt> : null}
              <View style={{ width: '100%', maxWidth: 22, height: h, borderRadius: 6, backgroundColor: last ? C.accent : C.surface2 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt muted size={11.5}>{points[0].label}</Txt>
        <Txt muted size={11.5}>{points[points.length - 1].label}</Txt>
      </View>
    </View>
  );
}
