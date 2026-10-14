import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { addDays, thDate, todayISO } from '../lib/gym';
import { fmt1 } from '../lib/me';
import { foodState, type FoodDay, type FoodState, type Person } from '../lib/groups';
import { C, R } from '../lib/theme';
import { Card, Chips, Empty, Pill, Toggle, Txt } from './index';
import { Icon } from './Icon';

const STATE: Record<FoodState, { t: string; kind: 'ok' | 'warn' | 'bad' | 'info' | 'mute' }> = {
  on: { t: 'ตามเป้า', kind: 'ok' },
  under: { t: 'ต่ำกว่าเป้า', kind: 'warn' },
  over: { t: 'เกินเป้า', kind: 'bad' },
  left: { t: 'ยังไม่ถึงเป้า', kind: 'info' },
  free: { t: 'ไม่ได้ตั้งเป้า', kind: 'mute' },
};
type Item = { meal: string; name: string; grams: number | null; kcal: number; protein_g: number; carb_g: number; fat_g: number };

/**
 * Group › Food: each member chooses to share their food with this group. Members who share show each day's
 * calories against their own target (on target = within ±10%), the macros, how many of the last 7 days were
 * on target, and (tap) what they ate.
 */
export function GroupFood({ groupId, me, people, sharing, myShare, rows, onShare }: {
  groupId: string; me: string | undefined; people: Person[]; sharing: Set<string>; myShare: boolean;
  rows: FoodDay[]; onShare: (on: boolean) => void;
}) {
  const today = todayISO();
  const [day, setDay] = useState(today);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);

  async function toggle(u: string) {
    if (open === u) { setOpen(null); return; }
    setOpen(u); setItems(null);
    const { data } = await supabase.rpc('group_food_items', { g: groupId, person: u, d: day });
    setItems(((data as any[]) ?? []).map(r => ({ ...r, kcal: Number(r.kcal), protein_g: Number(r.protein_g), carb_g: Number(r.carb_g), fat_g: Number(r.fat_g) })));
  }
  const sharers = people.filter(p => sharing.has(p.user_id));
  const nameOf = (p: Person) => (p.user_id === me ? `${p.display_name} (คุณ)` : p.display_name);

  return <>
    <Card>
      <Toggle label="แชร์อาหารของฉันให้กลุ่มนี้" value={myShare} onChange={onShare}
        hint={myShare ? 'คนในกลุ่มเห็นแคลอรีเทียบเป้า มาโคร และเมนูที่คุณบันทึก · ปิดได้ทุกเมื่อ' : 'ปิดอยู่ · คนในกลุ่มไม่เห็นอาหารของคุณ'} />
    </Card>

    <Chips options={[{ v: today, t: 'วันนี้' }, { v: addDays(today, -1), t: 'เมื่อวาน' }, { v: addDays(today, -2), t: thDate(addDays(today, -2)) }]}
      value={day} onChange={v => { setDay(v); setOpen(null); }} />

    {!sharers.length ? (
      <Card><Empty ic="utensils" title="ยังไม่มีใครแชร์อาหาร" text="เปิดสวิตช์ด้านบนเพื่อแชร์ของคุณ แล้วชวนคนในกลุ่มเปิดด้วย จะได้ดูกันว่าใครกินตามเป้า" /></Card>
    ) : (
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {sharers.map(p => {
          const r = rows.find(x => x.user_id === p.user_id && x.day === day);
          const week = rows.filter(x => x.user_id === p.user_id && x.day < today);
          const hits = week.filter(x => foodState(x.kcal, x.t_kcal, false) === 'on').length;
          const target = r?.t_kcal ?? week[0]?.t_kcal ?? null;
          const st = r ? foodState(r.kcal, target, day === today) : null;
          const pct = r && target ? Math.min(100, (r.kcal / target) * 100) : 0;
          const bar = st === 'over' ? C.badFg : st === 'on' ? C.accent : C.infoFg;
          return (
            <View key={p.user_id} style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 12, gap: 8 }}>
              <Pressable accessibilityRole="button" disabled={!r} onPress={() => toggle(p.user_id)} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt bold style={{ flex: 1 }} numberOfLines={1}>{nameOf(p)}</Txt>
                  {st ? <Pill text={STATE[st].t} kind={STATE[st].kind} /> : <Pill text="ยังไม่บันทึก" kind="mute" />}
                  {r ? <Icon name={open === p.user_id ? 'chevron-down' : 'chevron-right'} size={18} color={C.muted} /> : null}
                </View>
                {r ? <>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Txt bold size={20} style={{ fontVariant: ['tabular-nums'] }}>{Math.round(r.kcal).toLocaleString('en-US')}</Txt>
                    <Txt muted size={13}>{target ? `/ ${target.toLocaleString('en-US')} kcal` : 'kcal'}</Txt>
                    {st === 'left' && target ? <Txt muted size={13} style={{ marginLeft: 'auto' }}>{`เหลือ ${Math.round(target - r.kcal).toLocaleString('en-US')}`}</Txt> : null}
                  </View>
                  {target ? <View style={{ height: 8, borderRadius: R.pill, backgroundColor: C.surface2, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: 8, borderRadius: R.pill, backgroundColor: bar }} />
                  </View> : null}
                  <Txt muted size={13}>{[
                    `P ${Math.round(r.protein_g)}${r.t_protein ? `/${r.t_protein}` : ''}`,
                    `C ${Math.round(r.carb_g)}${r.t_carb ? `/${r.t_carb}` : ''}`,
                    `F ${Math.round(r.fat_g)}${r.t_fat ? `/${r.t_fat}` : ''}`,
                    `${r.items} รายการ`,
                  ].join(' · ')}</Txt>
                </> : null}
                {target ? <Txt muted size={12.5}>{`6 วันก่อนหน้า: ตามเป้า ${hits}/${week.length || 0} วันที่บันทึก`}</Txt> : null}
              </Pressable>
              {open === p.user_id ? (
                <View style={{ backgroundColor: C.surface2, borderRadius: R.field, padding: 10, gap: 6 }}>
                  {items === null ? <Txt muted size={13}>กำลังโหลด…</Txt> : items.map((i, k) => (
                    <View key={k} style={{ flexDirection: 'row', gap: 8 }}>
                      <Txt size={13} muted style={{ width: 64 }} numberOfLines={1}>{i.meal.replace('มื้อ', '')}</Txt>
                      <Txt size={13.5} style={{ flex: 1 }}>{`${i.name}${i.grams ? ` · ${fmt1(Number(i.grams))} g` : ''}`}</Txt>
                      <Txt size={13} muted style={{ fontVariant: ['tabular-nums'] }}>{Math.round(i.kcal)}</Txt>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>
    )}
    <Txt muted size={12.5}>ตามเป้า = แคลอรีอยู่ในช่วง ±10% ของเป้าตัวเอง · ตั้งเป้าได้ที่หน้า <Txt size={12.5} style={{ color: C.accent }} onPress={() => router.push('/my/food' as any)}>อาหาร</Txt></Txt>
  </>;
}
