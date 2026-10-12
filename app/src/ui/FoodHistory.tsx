import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { addDays, thDate, todayISO } from '../lib/gym';
import type { Target, Totals } from '../lib/me';
import { C } from '../lib/theme';
import { Card, Chips, Txt } from './index';
import { Icon } from './Icon';

/**
 * Looking back at food: four bar charts on the same days (calories, carbs, protein, fat), each with its goal line
 * and the average for the period compared with the period before. Tapping a bar in any chart opens that day above.
 */
type Day = Totals & { logged: boolean };
const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const OK_BAND = 0.1;     // within ±10% of a goal counts as "on target"
/** 1,850 -> "1.9k" so the number fits over a bar on small phones */
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

export function FoodHistory({ userId, target, day, onPickDay, refresh }: {
  userId: string; target: Target | null; day: string; onPickDay: (iso: string) => void; refresh: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<7 | 30>(7);
  const [byDay, setByDay] = useState<Record<string, Totals> | null>(null);
  const today = todayISO();

  // 60 days covers the longest range plus the period before it, in one query
  useEffect(() => {
    if (!open) return;   // nothing is loaded until the card is opened
    let live = true;
    (async () => {
      const { data } = await supabase.from('meals').select('eaten_on,items:meal_items(kcal,protein_g,carb_g,fat_g)')
        .eq('user_id', userId).gte('eaten_on', addDays(today, -59)).lte('eaten_on', today);
      const m: Record<string, Totals> = {};
      for (const row of (data as any[]) ?? []) {
        const t = (m[row.eaten_on] ??= { kcal: 0, p: 0, c: 0, f: 0 });
        for (const i of row.items ?? []) { t.kcal += Number(i.kcal); t.p += Number(i.protein_g); t.c += Number(i.carb_g); t.f += Number(i.fat_g); }
      }
      if (live) setByDay(m);
    })();
    return () => { live = false; };
  }, [open, userId, today, refresh]);

  const days = (from: number, n: number): (Day & { iso: string })[] =>
    Array.from({ length: n }, (_, i) => {
      const iso = addDays(today, from - n + 1 + i);
      const t = byDay?.[iso];
      return { iso, kcal: t?.kcal ?? 0, p: t?.p ?? 0, c: t?.c ?? 0, f: t?.f ?? 0, logged: !!t && t.kcal > 0 };
    });
  const cur = useMemo(() => days(0, range), [byDay, range, today]);
  const prev = useMemo(() => days(-range, range), [byDay, range, today]);

  const metrics: Metric[] = [
    { k: 'kcal', t: 'แคลอรี', unit: 'kcal', color: C.accent, goal: target?.kcal ?? null, overBad: true },
    { k: 'c', t: 'คาร์บ', unit: 'ก.', color: C.carb, goal: target?.carb_g ?? null, overBad: true },
    { k: 'p', t: 'โปรตีน', unit: 'ก.', color: C.protein, goal: target?.protein_g ?? null, overBad: false },
    { k: 'f', t: 'ไขมัน', unit: 'ก.', color: C.fat, goal: target?.fat_g ?? null, overBad: true },
  ];
  const logged = cur.filter(d => d.logged).length;

  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="activity" size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt bold size={16}>ดูย้อนหลัง</Txt>
          <Txt muted size={13}>กราฟแคลอรี คาร์บ โปรตีน ไขมัน 7 / 30 วัน</Txt>
        </View>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={20} color={C.muted} />
      </Pressable>
      {!open ? null : <>
      <Chips options={[{ v: 7, t: '7 วัน' }, { v: 30, t: '30 วัน' }]} value={range} onChange={v => setRange(v as 7 | 30)} />
      {byDay === null ? <Txt muted size={13}>กำลังโหลด…</Txt> : !logged ? <Txt muted size={13.5}>{`ยังไม่มีบันทึกใน ${range} วันนี้ · บันทึกมื้อแรกแล้วกราฟจะขึ้นที่นี่`}</Txt> : <>
        <Txt muted size={13}>{`บันทึก ${logged}/${range} วัน · เฉลี่ยคิดเฉพาะวันที่บันทึก · แตะแท่งเพื่อเปลี่ยนวันที่แสดงด้านบน (ตอนนี้: ${day === today ? 'วันนี้' : thDate(day)})`}</Txt>
        {metrics.map((m, i) => (
          <View key={m.k} style={i ? { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 } : undefined}>
            <MetricChart m={m} days={cur} prev={prev} selected={day} onPick={onPickDay} tall={i === 0} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          {target ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: C.muted }} />
            <Txt muted size={12}>เป้า</Txt>
          </View> : null}
          {target ? <Legend color={C.over} t="เกินเป้า 10% ขึ้นไป" /> : null}
          <Legend color={C.surface2} t="ไม่ได้บันทึก" />
        </View>
        {!target ? <Txt muted size={12.5}>ตั้งเป้าที่การ์ดด้านบน แล้วกราฟจะมีเส้นเป้าให้เทียบ</Txt> : null}
      </>}
      </>}
    </Card>
  );
}

type Key = 'kcal' | 'c' | 'p' | 'f';
type Metric = { k: Key; t: string; unit: string; color: string; goal: number | null; overBad: boolean };

const avgOf = (days: Day[], k: Key) => { const l = days.filter(d => d.logged); return l.length ? l.reduce((s, d) => s + d[k], 0) / l.length : null; };

function MetricChart({ m, days, prev, selected, onPick, tall }: {
  m: Metric; days: (Day & { iso: string })[]; prev: Day[]; selected: string; onPick: (iso: string) => void; tall?: boolean;
}) {
  const H_ = tall ? 110 : 80;
  const few = days.length <= 7;
  const top = Math.max(...days.map(d => d[m.k] * (few ? 1.22 : 1.05)), m.goal ? m.goal * 1.2 : 0, 1);
  const y = (v: number) => (v / top) * H_;
  const a = avgOf(days, m.k), b = avgOf(prev, m.k);
  const fmt = (v: number) => (m.k === 'kcal' ? Math.round(v).toLocaleString('en-US') : String(Math.round(v)));
  const diff = a != null && b != null ? Math.round(a - b) : null;
  const color = (d: Day) => (!d.logged ? C.surface2 : m.overBad && m.goal && d[m.k] > m.goal * (1 + OK_BAND) ? C.over : m.color);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: m.color }} />
        <Txt bold size={15}>{m.t}</Txt>
        <Txt muted size={12.5} style={{ flex: 1, textAlign: 'right' }}>
          {a == null ? '–' : m.goal ? `เฉลี่ย ${fmt(a)} / เป้า ${fmt(m.goal)} ${m.unit}` : `เฉลี่ย ${fmt(a)} ${m.unit}`}
        </Txt>
      </View>
      <View style={{ height: H_, justifyContent: 'flex-end' }}>
        {m.goal ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: y(m.goal), borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: C.muted }} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: few ? 8 : 2, height: H_ }}
          accessibilityLabel={`${m.t} ${days.map(d => `${thDate(d.iso)} ${fmt(d[m.k])}`).join(', ')}`}>
          {days.map(d => {
            const on = d.iso === selected;
            return (
              <Pressable key={d.iso} accessibilityRole="button" accessibilityLabel={`${m.t} ${thDate(d.iso)} ${fmt(d[m.k])} ${m.unit}`} onPress={() => onPick(d.iso)}
                style={{ flex: 1, height: H_, justifyContent: 'flex-end', alignItems: 'center' }}>
                {few && d.logged ? <Txt size={10.5} muted={!on} bold={on} numberOfLines={1}>{m.k === 'kcal' ? short(d[m.k]) : Math.round(d[m.k])}</Txt> : null}
                <View style={{ width: '100%', maxWidth: few ? 30 : 12, height: d.logged ? Math.max(3, y(d[m.k])) : 3, borderRadius: few ? 5 : 3,
                  backgroundColor: color(d), opacity: on || !d.logged ? 1 : 0.8, borderWidth: on ? 2 : 0, borderColor: C.fg }} />
              </Pressable>
            );
          })}
        </View>
      </View>
      {few
        ? <View style={{ flexDirection: 'row', gap: 8 }}>
            {days.map(d => (
              <Txt key={d.iso} size={11} bold={d.iso === selected} muted={d.iso !== selected} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
                {d.iso === todayISO() ? 'วันนี้' : WD[new Date(d.iso + 'T00:00:00').getDay()]}
              </Txt>
            ))}
          </View>
        : <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt muted size={11}>{thDate(days[0].iso)}</Txt>
            <Txt muted size={11}>{thDate(days[Math.floor(days.length / 2)].iso)}</Txt>
            <Txt muted size={11}>วันนี้</Txt>
          </View>}
      {diff != null && diff !== 0
        ? <Txt size={12.5} style={{ color: C.muted }}>{diff > 0 ? `มากกว่าช่วงก่อน ${fmt(diff)} ${m.unit}/วัน` : `น้อยกว่าช่วงก่อน ${fmt(-diff)} ${m.unit}/วัน`}</Txt>
        : null}
    </View>
  );
}

const Legend = ({ color, t }: { color: string; t: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, borderWidth: 1, borderColor: C.line }} />
    <Txt muted size={12}>{t}</Txt>
  </View>
);
