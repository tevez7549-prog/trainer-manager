import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { addDays, thDate, todayISO } from '../lib/gym';
import type { Target, Totals } from '../lib/me';
import { C, R } from '../lib/theme';
import { Card, Chips, H, Txt } from './index';

/**
 * Looking back at food: calories per day as bars with the target line, then averages for the period
 * compared with the period before. Tapping a bar opens that day above.
 */
type Day = Totals & { logged: boolean };
const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const OK_BAND = 0.1;
/** 1,850 -> "1.9k" so the number fits over a bar on small phones */
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));     // within ±10% of the calorie target counts as "on target"

export function FoodHistory({ userId, target, day, onPickDay, refresh }: {
  userId: string; target: Target | null; day: string; onPickDay: (iso: string) => void; refresh: unknown;
}) {
  const [range, setRange] = useState<7 | 30>(7);
  const [byDay, setByDay] = useState<Record<string, Totals> | null>(null);
  const today = todayISO();

  // 60 days covers the longest range plus the period before it, in one query
  useEffect(() => {
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
  }, [userId, today, refresh]);

  const days = (from: number, n: number): (Day & { iso: string })[] =>
    Array.from({ length: n }, (_, i) => {
      const iso = addDays(today, from - n + 1 + i);
      const t = byDay?.[iso];
      return { iso, kcal: t?.kcal ?? 0, p: t?.p ?? 0, c: t?.c ?? 0, f: t?.f ?? 0, logged: !!t && t.kcal > 0 };
    });
  const cur = useMemo(() => days(0, range), [byDay, range, today]);
  const prev = useMemo(() => days(-range, range), [byDay, range, today]);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <H size={17} style={{ flex: 1 }}>ย้อนหลัง</H>
        <Chips options={[{ v: 7, t: '7 วัน' }, { v: 30, t: '30 วัน' }]} value={range} onChange={v => setRange(v as 7 | 30)} />
      </View>
      {byDay === null ? <Txt muted size={13}>กำลังโหลด…</Txt> : <>
        <KcalBars days={cur} target={target?.kcal ?? null} selected={day} onPick={onPickDay} />
        <Summary cur={cur} prev={prev} target={target} range={range} />
      </>}
    </Card>
  );
}

function barColor(d: Day, target: number | null) {
  if (!d.logged) return C.surface2;
  if (!target) return C.accent;
  return d.kcal > target * (1 + OK_BAND) ? C.over : C.accent;
}

function KcalBars({ days, target, selected, onPick }: { days: (Day & { iso: string })[]; target: number | null; selected: string; onPick: (iso: string) => void }) {
  const H_ = 120;
  const top = Math.max(...days.map(d => d.kcal), target ? target * 1.2 : 0, 1);
  const y = (v: number) => (v / top) * H_;
  const few = days.length <= 7;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: H_ + 18, justifyContent: 'flex-end' }}>
        {target ? <>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: y(target), borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: C.muted }} />
        </> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: few ? 8 : 2, height: H_ }}
          accessibilityLabel={`แคลอรี ${days.map(d => `${thDate(d.iso)} ${Math.round(d.kcal)}`).join(', ')}`}>
          {days.map(d => {
            const on = d.iso === selected;
            return (
              <Pressable key={d.iso} accessibilityRole="button" accessibilityLabel={`${thDate(d.iso)} ${Math.round(d.kcal)} kcal`} onPress={() => onPick(d.iso)}
                style={{ flex: 1, height: H_, justifyContent: 'flex-end', alignItems: 'center' }}>
                {few && d.logged ? <Txt size={11} muted={!on} bold={on} numberOfLines={1}>{short(d.kcal)}</Txt> : null}
                <View style={{ width: '100%', maxWidth: few ? 30 : 12, height: d.logged ? Math.max(4, y(d.kcal)) : 4, borderRadius: few ? 6 : 3,
                  backgroundColor: barColor(d, target), opacity: on || !d.logged ? 1 : 0.75, borderWidth: on ? 2 : 0, borderColor: C.fg }} />
              </Pressable>
            );
          })}
        </View>
      </View>
      {few
        ? <View style={{ flexDirection: 'row', gap: 8 }}>
            {days.map(d => (
              <Txt key={d.iso} size={11.5} bold={d.iso === selected} muted={d.iso !== selected} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
                {d.iso === todayISO() ? 'วันนี้' : WD[new Date(d.iso + 'T00:00:00').getDay()]}
              </Txt>
            ))}
          </View>
        : <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt muted size={11.5}>{thDate(days[0].iso)}</Txt>
            <Txt muted size={11.5}>{thDate(days[Math.floor(days.length / 2)].iso)}</Txt>
            <Txt muted size={11.5}>วันนี้</Txt>
          </View>}
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        {target ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 14, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: C.muted }} />
          <Txt muted size={12}>{`เป้า ${target.toLocaleString('en-US')} kcal`}</Txt>
        </View> : null}
        <Legend color={C.accent} t={target ? 'อยู่ในเป้า / ต่ำกว่า' : 'มีบันทึก'} />
        {target ? <Legend color={C.over} t="เกินเป้า 10% ขึ้นไป" /> : null}
        <Legend color={C.surface2} t="ไม่ได้บันทึก" />
      </View>
    </View>
  );
}

const Legend = ({ color, t }: { color: string; t: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, borderWidth: 1, borderColor: C.line }} />
    <Txt muted size={12}>{t}</Txt>
  </View>
);

function avg(days: Day[]) {
  const l = days.filter(d => d.logged);
  const n = l.length || 1;
  return { n: l.length, kcal: l.reduce((s, d) => s + d.kcal, 0) / n, p: l.reduce((s, d) => s + d.p, 0) / n, c: l.reduce((s, d) => s + d.c, 0) / n, f: l.reduce((s, d) => s + d.f, 0) / n };
}

function Summary({ cur, prev, target, range }: { cur: Day[]; prev: Day[]; target: Target | null; range: number }) {
  const a = avg(cur), b = avg(prev);
  if (!a.n) return <Txt muted size={13.5}>{`ยังไม่มีบันทึกใน ${range} วันนี้ · เริ่มบันทึกมื้อแรกด้านล่างได้เลย`}</Txt>;
  const inTarget = target ? cur.filter(d => d.logged && Math.abs(d.kcal - target.kcal) <= target.kcal * OK_BAND).length : null;
  const over = target ? cur.filter(d => d.logged && d.kcal > target.kcal * (1 + OK_BAND)).length : null;
  const diff = b.n ? Math.round(a.kcal - b.kcal) : null;
  const tiles: [string, string, string?][] = [
    ['วันที่บันทึก', `${a.n}/${range} วัน`],
    ['เฉลี่ยต่อวัน', `${Math.round(a.kcal).toLocaleString('en-US')} kcal`, target ? `เป้า ${target.kcal.toLocaleString('en-US')}` : undefined],
  ];
  if (inTarget !== null) tiles.push(['อยู่ในเป้า (±10%)', `${inTarget}/${a.n} วัน`, over ? `เกินเป้า ${over} วัน` : undefined]);
  return (
    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
      <Txt bold size={14}>{`สรุป ${range} วันล่าสุด`}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.map(([t, v, sub]) => (
          <View key={t} style={{ flexGrow: 1, flexBasis: 120, backgroundColor: C.surface2, borderRadius: R.field, padding: 12, gap: 2 }}>
            <Txt muted size={12.5}>{t}</Txt>
            <Txt bold size={17}>{v}</Txt>
            {sub ? <Txt muted size={12}>{sub}</Txt> : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([['โปรตีน', a.p, target?.protein_g, C.protein], ['คาร์บ', a.c, target?.carb_g, C.carb], ['ไขมัน', a.f, target?.fat_g, C.fat]] as const).map(([n, v, t, color]) => (
          <View key={n} style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
              <Txt muted size={12.5} numberOfLines={1}>{n}</Txt>
            </View>
            <Txt bold size={15}>{`${Math.round(v)} ก.`}</Txt>
            {t ? <Txt muted size={12}>{`เป้า ${t} ก.`}</Txt> : null}
          </View>
        ))}
      </View>
      {diff !== null
        ? <Txt size={13.5} style={{ color: C.muted }}>
            {diff === 0 ? `เท่ากับ ${range} วันก่อนหน้า (${Math.round(b.kcal).toLocaleString('en-US')} kcal)`
              : diff > 0 ? `มากกว่า ${range} วันก่อนหน้า ${Math.abs(diff).toLocaleString('en-US')} kcal ต่อวัน (ช่วงก่อน ${Math.round(b.kcal).toLocaleString('en-US')} kcal)`
              : `น้อยกว่า ${range} วันก่อนหน้า ${Math.abs(diff).toLocaleString('en-US')} kcal ต่อวัน (ช่วงก่อน ${Math.round(b.kcal).toLocaleString('en-US')} kcal)`}
          </Txt>
        : <Txt muted size={13}>{`ยังไม่มีบันทึกใน ${range} วันก่อนหน้า เลยยังเทียบไม่ได้`}</Txt>}
      <Txt muted size={12.5}>ค่าเฉลี่ยคิดเฉพาะวันที่บันทึก · แตะแท่งในกราฟเพื่อดูวันนั้น</Txt>
    </View>
  );
}
