import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { addDays, thDate, todayISO } from '../../../src/lib/gym';
import { MEMBER_TABS } from '../../../src/lib/nav';
import {
  ACTIVITY, addItem, calcTarget, fmt1, latestTarget, loadDay, MEAL_NAMES, totals,
  type Food, type Meal, type MealItem, type Target,
} from '../../../src/lib/me';
import { Btn, Card, Chips, ConfirmBtn, Field, H, Header, Label, Notice, Row, Screen, Select, Toggle, Txt } from '../../../src/ui';
import { DayTotals } from '../../../src/ui/Macro';
import { Icon } from '../../../src/ui/Icon';
import { TabBar } from '../../../src/ui/TabBar';
import { gramsOf, MacroSplit, STYLES, type Split } from '../../../src/ui/MacroSplit';
import { C, R } from '../../../src/lib/theme';

type Comment = { id: string; meal_id: string; body: string; created_at: string; author: { display_name: string } | null };
type Mode = 'photo' | 'ai' | 'search' | 'fav' | 'recent' | 'custom';
type NewItem = Omit<MealItem, 'id' | 'meal_id'>;
const SHORT: Record<string, string> = { 'มื้อเช้า': 'เช้า', 'มื้อกลางวัน': 'เที่ยง', 'มื้อเย็น': 'เย็น', 'ของว่าง': 'ว่าง' };
const mealNow = () => { const h = new Date().getHours(); return h < 10 ? 'มื้อเช้า' : h < 15 ? 'มื้อกลางวัน' : h < 21 ? 'มื้อเย็น' : 'ของว่าง'; };
const scaled = (f: Food, x: number, ai = false): NewItem => ({
  name: f.name_th, grams: f.serving_g > 0 ? Math.round(f.serving_g * x) : null, kcal: Math.round(f.kcal * x), protein_g: +(f.protein_g * x).toFixed(1),
  carb_g: +(f.carb_g * x).toFixed(1), fat_g: +(f.fat_g * x).toFixed(1), from_ai: ai, food_id: f.id,
});
const macroLine = (i: { kcal: number; protein_g: number; carb_g: number; fat_g: number }) =>
  `${Math.round(i.kcal)} kcal · P ${Math.round(i.protein_g)} C ${Math.round(i.carb_g)} F ${Math.round(i.fat_g)}`;

export default function FoodPage() {
  const { profile } = useAuth();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const [day, setDay] = useState(todayISO());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [target, setTarget] = useState<Target | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [sheet, setSheet] = useState<{ mode: Mode; meal: string; at: 'top' | 'slot' } | null>(add ? { mode: 'search', meal: mealNow(), at: 'top' } : null);
  const mode = sheet?.at === 'top' ? sheet.mode : null;
  const setMode = (m: Mode | null) => setSheet(m ? { mode: m, meal: mealNow(), at: 'top' } : null);
  const [setting, setSetting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [m, t] = await Promise.all([loadDay(profile.id, day), latestTarget(profile.id)]);
    setMeals(m); setTarget(t);
    if (m.length) {
      const { data } = await supabase.from('meal_comments').select('id,meal_id,body,created_at,author:profiles!meal_comments_author_id_fkey(display_name)')
        .in('meal_id', m.map(x => x.id)).order('created_at');
      setComments(((data as any) ?? []) as Comment[]);
    } else setComments([]);
  }, [profile, day]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const done = (t: string, ok = true) => { setMsg({ t, ok }); load(); };
  async function del(i: MealItem) {
    const { error } = await supabase.from('meal_items').delete().eq('id', i.id);
    if (error) done(thError(error), false); else done(`ลบ ${i.name} แล้ว`);
  }
  const today = day === todayISO();


  return (
    <Screen footer={<TabBar tabs={MEMBER_TABS} active="food" />}>
      <Header title="อาหาร" right={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="วันก่อน" onPress={() => setDay(addDays(day, -1))} style={{ padding: 10 }}><Icon name="chevron-left" size={20} /></Pressable>
          <Txt bold size={14}>{today ? 'วันนี้' : thDate(day)}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="วันถัดไป" disabled={today} onPress={() => setDay(addDays(day, 1))} style={{ padding: 10, opacity: today ? 0.3 : 1 }}><Icon name="chevron-right" size={20} /></Pressable>
        </View>} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      <Pressable accessibilityRole="button" accessibilityLabel="ดูหรือเปลี่ยนเป้า" onPress={() => setSetting(!setting)}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <H size={17} style={{ flex: 1 }}>{today ? 'วันนี้กินไปแล้ว' : `กินไปแล้ว ${thDate(day)}`}</H>
            <Txt muted size={13}>{target ? 'แตะเพื่อดูเป้า' : 'แตะเพื่อตั้งเป้า'}</Txt>
          </View>
          <DayTotals t={totals(meals.flatMap(m => m.items))} target={target ?? null} />
          {target && target.set_by && target.set_by !== profile?.id ? <Txt muted size={13}>เป้านี้ตั้งโดยเทรนเนอร์</Txt> : null}
        </Card>
      </Pressable>
      {setting ? <TargetForm current={target ?? null} onDone={(t) => { setSetting(false); if (t) done(t); }} /> : null}

      <Label>{today ? 'มื้อวันนี้' : `มื้อวันที่ ${thDate(day)}`}</Label>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {MEAL_NAMES.map(name => {
          const m = meals.find(x => x.name === name);
          const items = m?.items ?? [];
          const t = totals(items), cs = comments.filter(c => c.meal_id === m?.id), on = !!m && open === m.id;
          const adding = sheet?.at === 'slot' && sheet.meal === name;
          return (
            <View key={name} style={{ borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 8 }}>
                <Pressable accessibilityRole="button" disabled={!items.length} onPress={() => setOpen(on ? null : m!.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: items.length ? C.accentSoft : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt bold size={13} style={{ color: items.length ? C.accent : C.muted }}>{SHORT[name] ?? name}</Txt>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {items.length ? <>
                      <Txt bold numberOfLines={1}>{items.map(i => i.name).join(', ')}</Txt>
                      <Txt muted size={13}>{macroLine({ kcal: t.kcal, protein_g: t.p, carb_g: t.c, fat_g: t.f })}{cs.length ? ` · ${cs.length} ข้อความ` : ''}</Txt>
                    </> : <Txt muted>{name}</Txt>}
                  </View>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`เพิ่มอาหาร${name}`} onPress={() => setSheet(adding ? null : { mode: 'search', meal: name, at: 'slot' })}
                  style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: adding ? C.accentSoft : C.surface2, opacity: pressed ? 0.7 : 1 })}>
                  <Icon name={adding ? 'x' : 'plus'} size={20} color={C.accent} />
                </Pressable>
              </View>
              {adding ? <View style={{ paddingBottom: 12 }}><AddSheet bare mode={sheet!.mode} meal={name} day={day} onDone={(tt) => { setSheet(null); if (tt) done(tt); }} /></View> : null}
              {on ? <View style={{ paddingBottom: 10, gap: 6 }}>
                {items.map(i => <ItemRow key={i.id} i={i} onDelete={() => del(i)} />)}
                {cs.map(c => (
                  <View key={c.id} style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: R.field, backgroundColor: C.infoBg }}>
                    <Icon name="message" size={18} color={C.infoFg} />
                    <Txt size={14} style={{ color: C.infoFg, flex: 1 }}><Txt bold size={14} style={{ color: C.infoFg }}>{c.author?.display_name ?? 'เทรนเนอร์'}: </Txt>{c.body}</Txt>
                  </View>
                ))}
              </View> : null}
            </View>
          );
        })}
      </Card>
      <Label>เพิ่มเร็ว</Label>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Tile icon="camera" label="ถ่ายรูป" sub="AI คำนวณให้" ai primary on={mode === 'photo'} onPress={() => setMode(mode === 'photo' ? null : 'photo')} />
        <Tile icon="message" label="พิมพ์บอก AI" sub="เช่น กะเพราหมู 1 จาน" ai on={mode === 'ai'} onPress={() => setMode(mode === 'ai' ? null : 'ai')} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Tile icon="search" label="ค้นหา" sub="คลังอาหาร + ของฉัน" on={mode === 'search'} onPress={() => setMode(mode === 'search' ? null : 'search')} />
        <Tile icon="star" label="เมนูโปรด" on={mode === 'fav'} onPress={() => setMode(mode === 'fav' ? null : 'fav')} />
      </View>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <Row ic="repeat" title="กินล่าสุด" sub="กดซ้ำได้ ไม่ต้องค้นใหม่" onPress={() => setMode(mode === 'recent' ? null : 'recent')} />
        <Row ic="pencil" title="สร้างเมนูเอง" sub="กรอกโปรตีน คาร์บ ไขมัน แล้วคำนวณแคลให้" onPress={() => setMode(mode === 'custom' ? null : 'custom')} />
      </Card>
      {sheet?.at === 'top' ? <AddSheet key={sheet.mode} mode={sheet.mode} meal={sheet.meal} day={day} onDone={(t) => { setSheet(null); if (t) done(t); }} /> : null}

    </Screen>
  );
}

/** Quick-add tile. AI tiles carry a sparkle badge so people learn "this one asks the AI". */
function Tile({ icon, label, sub, onPress, primary, on, ai }: { icon: string; label: string; sub?: string; onPress: () => void; primary?: boolean; on?: boolean; ai?: boolean }) {
  const bg = primary ? C.brand : on ? C.accentSoft : C.surface, fg = primary ? C.brandInk : on ? C.accent : C.fg;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} accessibilityLabel={`${label}${ai ? ' ใช้ AI' : ''}`} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 100, borderRadius: R.card, backgroundColor: bg, padding: 14, justifyContent: 'space-between', gap: 8,
        borderWidth: on && !primary ? 1.5 : 0, borderColor: C.accent, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Icon name={icon} size={24} color={fg} />
        {ai ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, backgroundColor: primary ? C.brandInk : C.accentSoft }}>
            <Icon name="sparkles" size={14} color={primary ? C.brand : C.accent} />
            <Txt bold size={12} style={{ color: primary ? C.brand : C.accent }}>AI</Txt>
          </View>
        ) : null}
      </View>
      <View>
        <Txt bold size={15} style={{ color: fg }}>{label}</Txt>
        {sub ? <Txt size={12.5} style={{ color: fg, opacity: 0.75 }}>{sub}</Txt> : null}
      </View>
    </Pressable>
  );
}

function ItemRow({ i, onDelete }: { i: MealItem; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6, paddingLeft: 56 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Txt size={15}>{i.name}{i.grams ? ` · ${fmt1(i.grams)} g` : ''}{i.from_ai ? ' · ผลจำลอง' : ''}</Txt>
          <Txt muted size={12.5}>{macroLine(i)}</Txt>
        </View>
      </Pressable>
      {open ? <ConfirmBtn label="ลบรายการนี้" onConfirm={onDelete} /> : null}
    </View>
  );
}

/** One sheet for every way of adding: pick the meal, then the food */
function AddSheet({ mode: mode0, meal: meal0, day, bare, onDone }: { mode: Mode; meal: string; day: string; bare?: boolean; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [meal, setMeal] = useState(meal0);
  const [mode, setMode] = useState<Mode>(mode0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save(item: NewItem) {
    setBusy(true); setErr('');
    const { error } = await addItem(profile!.id, day, meal, item);
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(`เพิ่ม ${item.name} ใน${meal}แล้ว`);
  }
  const title = { photo: 'ถ่ายรูปอาหาร · AI', ai: 'พิมพ์บอก AI', search: 'ค้นหาอาหาร', fav: 'เมนูโปรด', recent: 'กินล่าสุด', custom: 'สร้างเมนูเอง' }[mode];

  const body = <>
      {!bare ? <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <H size={17} style={{ flex: 1 }}>{title}</H>
        <Pressable accessibilityRole="button" accessibilityLabel="ปิด" onPress={() => onDone()} hitSlop={8}><Icon name="x" size={20} color={C.muted} /></Pressable>
      </View> : null}
      {bare ? <Chips options={[{ v: 'ai', t: '✦ AI' }, { v: 'search', t: 'ค้นหา' }, { v: 'fav', t: 'โปรด' }, { v: 'recent', t: 'ล่าสุด' }, { v: 'custom', t: 'สร้างเอง' }, { v: 'photo', t: '✦ ถ่ายรูป' }] as { v: Mode; t: string }[]} value={mode} onChange={setMode} />
        : <Chips options={MEAL_NAMES.map(n => ({ v: n, t: SHORT[n] ?? n }))} value={meal} onChange={setMeal} />}
      {err ? <Notice text={err} /> : null}
      {mode === 'search' ? <SearchFoods onPick={(f, x) => save(scaled(f, x))} busy={busy} /> : null}
      {mode === 'fav' ? <Favorites onPick={(f, x) => save(scaled(f, x))} busy={busy} /> : null}
      {mode === 'recent' ? <Recent onPick={save} /> : null}
      {mode === 'custom' ? <Custom onSave={save} busy={busy} /> : null}
      {mode === 'photo' ? <AiText photo onSave={save} busy={busy} /> : null}
      {mode === 'ai' ? <AiText onSave={save} busy={busy} /> : null}
  </>;
  return bare ? <View style={{ gap: 12 }}>{body}</View> : <Card>{body}</Card>;
}

function useFoods() {
  const [foods, setFoods] = useState<Food[]>([]);
  useEffect(() => { supabase.from('foods').select('*').order('name_th').then(({ data }) => setFoods((data as Food[]) ?? [])); }, []);
  return foods;
}
function useFavIds() {
  const { profile } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const load = useCallback(() => {
    if (profile) supabase.from('food_favorites').select('food_id').eq('user_id', profile.id).then(({ data }) => setIds(new Set(((data as any[]) ?? []).map(x => x.food_id))));
  }, [profile]);
  useEffect(() => { load(); }, [load]);
  async function toggle(id: string) {
    if (ids.has(id)) await supabase.from('food_favorites').delete().eq('user_id', profile!.id).eq('food_id', id);
    else await supabase.from('food_favorites').insert({ user_id: profile!.id, food_id: id });
    load();
  }
  return { ids, toggle };
}

/** Pick a food, then how much */
function Portion({ f, onAdd, onBack, busy }: { f: Food; onAdd: (x: number) => void; onBack: () => void; busy: boolean }) {
  const [x, setX] = useState(1);
  const [g, setG] = useState('');
  const byWeight = f.serving_g > 0;
  // a typed amount (what you really ate) wins over the quick ×½ ×1 ×2 buttons
  const mult = byWeight && Number(g) > 0 ? Number(g) / f.serving_g : x;
  return <>
    <Txt bold>{f.name_th}</Txt>
    {byWeight ? <Txt muted size={13}>ค่าในระบบต่อ 1 ที่ = {fmt1(f.serving_g)} กรัม</Txt> : null}
    <Chips label="ปริมาณ" options={[0.5, 1, 1.5, 2].map(v => ({ v, t: v === 1 ? '1 ที่' : `×${v}` }))} value={g ? null : x} onChange={v => { setX(v); setG(''); }} />
    {byWeight ? <Field label="หรือกรอกที่กินจริง (กรัม)" value={g} onChangeText={v => setG(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={`เช่น ${Math.round(f.serving_g * 1.5)}`} /> : null}
    <Txt muted size={14}>{macroLine(scaled(f, mult))}</Txt>
    <Btn label="เพิ่ม" onPress={() => onAdd(mult)} loading={busy} />
    <Btn kind="ghost" label="เลือกอย่างอื่น" onPress={onBack} />
  </>;
}

function FoodList({ foods, onPick, fav }: { foods: Food[]; onPick: (f: Food) => void; fav: ReturnType<typeof useFavIds> }) {
  return (
    <View>
      {foods.map(f => (
        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Pressable accessibilityRole="button" onPress={() => onPick(f)} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
            <Txt style={{ flex: 1 }}>{f.name_th}</Txt><Txt muted>{Math.round(f.kcal)} kcal</Txt>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={fav.ids.has(f.id) ? `เอา ${f.name_th} ออกจากเมนูโปรด` : `เพิ่ม ${f.name_th} เป็นเมนูโปรด`}
            onPress={() => fav.toggle(f.id)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="star" size={20} color={fav.ids.has(f.id) ? C.cautionFg : C.muted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function SearchFoods({ onPick, busy }: { onPick: (f: Food, x: number) => void; busy: boolean }) {
  const foods = useFoods(), fav = useFavIds();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Food | null>(null);
  const term = q.trim();
  // nothing listed until the user types; then the closest matches first (name starts with the word, then contains it)
  // my favourites and own menus first, then names that start with the word
  const found = useMemo(() => !term ? [] : foods.filter(f => f.name_th.includes(term))
    .sort((a, b) => (Number(!fav.ids.has(a.id)) - Number(!fav.ids.has(b.id))) || (Number(!a.created_by) - Number(!b.created_by))
      || (Number(!a.name_th.startsWith(term)) - Number(!b.name_th.startsWith(term)))).slice(0, 8), [foods, term, fav.ids]);
  if (pick) return <Portion f={pick} onAdd={(x) => onPick(pick, x)} onBack={() => setPick(null)} busy={busy} />;
  return <>
    <Field label="ค้นหา" value={q} onChangeText={setQ} placeholder="พิมพ์ชื่ออาหาร เช่น กะเพรา อกไก่" icon="search" autoFocus />
    {term ? <FoodList foods={found} onPick={setPick} fav={fav} /> : null}
    {term && !found.length ? <Txt muted>ไม่เจอ "{term}" · ลองคำอื่น หรือเลือก "สร้างเอง"</Txt> : null}
    <Txt muted size={12.5}>ค้นจากคลังอาหาร (ตัวอย่าง) และเมนูของฉัน · ไม่เจอ? ลอง ✦ AI · แตะดาวเพื่อเก็บเป็นเมนูโปรด</Txt>
  </>;
}

function Favorites({ onPick, busy }: { onPick: (f: Food, x: number) => void; busy: boolean }) {
  const foods = useFoods(), fav = useFavIds();
  const [pick, setPick] = useState<Food | null>(null);
  const list = foods.filter(f => fav.ids.has(f.id));
  if (pick) return <Portion f={pick} onAdd={(x) => onPick(pick, x)} onBack={() => setPick(null)} busy={busy} />;
  return list.length ? <FoodList foods={list} onPick={setPick} fav={fav} />
    : <Txt muted>ยังไม่มีเมนูโปรด · ตอนค้นหาแตะรูปดาวข้างอาหาร หรือสร้างเมนูเองแล้วเลือก "เก็บเป็นเมนูโปรด"</Txt>;
}

/** Things eaten in the last 30 days, newest first, one row per name: tap to add again */
function Recent({ onPick }: { onPick: (i: NewItem) => void }) {
  const { profile } = useAuth();
  const [list, setList] = useState<NewItem[] | null>(null);
  useEffect(() => {
    if (!profile) return;
    supabase.from('meal_items').select('name,grams,kcal,protein_g,carb_g,fat_g,food_id,created_at').eq('user_id', profile.id)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        const seen = new Set<string>(), out: NewItem[] = [];
        ((data as any[]) ?? []).forEach(r => { if (!seen.has(r.name)) { seen.add(r.name); out.push({ ...r, from_ai: false, created_at: undefined } as any); } });
        setList(out.slice(0, 20));
      });
  }, [profile]);
  if (list === null) return <Txt muted>กำลังโหลด…</Txt>;
  if (!list.length) return <Txt muted>ยังไม่มีประวัติ 30 วันล่าสุด</Txt>;
  return (
    <View>
      {list.map(i => (
        <Pressable key={i.name} accessibilityRole="button" onPress={() => onPick({ ...i })} style={({ pressed }) => ({ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, opacity: pressed ? 0.6 : 1 })}>
          <Txt>{i.name}</Txt>
          <Txt muted size={13}>{macroLine(i)}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

const UNITS = ['กรัม', 'มล.', 'ขวด', 'กล่อง', 'ชิ้น', 'อัน', 'ถ้วย', 'ช้อน'];

/**
 * Own menu from a nutrition label: the label's amount and macros, then how much was really eaten
 * (e.g. label per 100 g, ate 150 g → ×1.5). Calories: typed from the label, or worked out from the macros (4 / 4 / 9).
 */
function Custom({ onSave, busy }: { onSave: (i: NewItem) => void; busy: boolean }) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('กรัม');
  const [per, setPer] = useState('100');          // label: values are per this amount
  const [p, setP] = useState(''); const [c, setC_] = useState(''); const [f, setF] = useState('');
  const [kcal, setKcal] = useState('');            // label kcal; empty = from macros
  const [ate, setAte] = useState('');              // amount really eaten; empty = same as label
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState('');
  const num = (v: string) => v.replace(/[^\d.]/g, '');
  const macroKcal = Math.round(Number(p || 0) * 4 + Number(c || 0) * 4 + Number(f || 0) * 9);
  const labelKcal = kcal !== '' ? Number(kcal) : macroKcal;
  const perN = Number(per) || 0, ateN = ate !== '' ? Number(ate) : perN;
  const ratio = perN > 0 ? ateN / perN : 1;
  const out = { kcal: Math.round(labelKcal * ratio), protein_g: +(Number(p || 0) * ratio).toFixed(1), carb_g: +(Number(c || 0) * ratio).toFixed(1), fat_g: +(Number(f || 0) * ratio).toFixed(1) };

  async function go() {
    if (!name.trim()) { setErr('ใส่ชื่อเมนู'); return; }
    if (!perN) { setErr('ใส่ปริมาณตามฉลาก'); return; }
    if (!labelKcal) { setErr('ใส่แคลอรี หรือโปรตีน คาร์บ ไขมันอย่างน้อย 1 ช่อง'); return; }
    const grams = unit === 'กรัม' || unit === 'มล.';
    let foodId: string | null = null;
    if (keep) {
      // saved per the label amount; weight-based units can be scaled later by grams
      const r = await supabase.from('foods').insert({ name_th: grams ? name.trim() : `${name.trim()} (${fmt1(perN)} ${unit})`, serving_g: grams ? perN : 0,
        kcal: labelKcal, protein_g: Number(p || 0), carb_g: Number(c || 0), fat_g: Number(f || 0), created_by: profile!.id }).select('id').single();
      if (!r.error) { foodId = r.data.id; await supabase.from('food_favorites').insert({ user_id: profile!.id, food_id: foodId }); }
    }
    onSave({ name: `${name.trim()} ${fmt1(ateN)} ${unit}`, grams: grams ? ateN : null, ...out, from_ai: false, food_id: foodId });
  }

  return <>
    {err ? <Notice text={err} /> : null}
    <Field label="ชื่อเมนู" value={name} onChangeText={setName} placeholder="เช่น นมจืด, ข้าวกล่องอกไก่ของแม่" />

    <Txt bold size={14}>ตามฉลาก</Txt>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      <View style={{ flex: 1 }}><Field label="ค่าต่อ" value={per} onChangeText={v => setPer(num(v))} keyboardType="decimal-pad" /></View>
      <View style={{ flex: 1 }}><Select label="หน่วย" value={unit} options={UNITS.map(u => ({ v: u, t: u }))} onChange={setUnit} /></View>
    </View>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Field label="โปรตีน g" value={p} onChangeText={v => setP(num(v))} keyboardType="decimal-pad" /></View>
      <View style={{ flex: 1 }}><Field label="คาร์บ g" value={c} onChangeText={v => setC_(num(v))} keyboardType="decimal-pad" /></View>
      <View style={{ flex: 1 }}><Field label="ไขมัน g" value={f} onChangeText={v => setF(num(v))} keyboardType="decimal-pad" /></View>
    </View>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      <View style={{ flex: 1 }}><Field label="แคลอรี (kcal)" value={kcal} onChangeText={v => setKcal(num(v))} keyboardType="decimal-pad" placeholder={macroKcal ? `${macroKcal} จาก Macro` : 'ตามฉลาก'} /></View>
      <Btn kind="ghost" label="คำนวณจาก Macro" onPress={() => setKcal(macroKcal ? String(macroKcal) : '')} style={{ minHeight: 48 }} />
    </View>
    <Txt muted size={12.5}>ว่างไว้ = ใช้ค่าจาก Macro (โปรตีน×4 + คาร์บ×4 + ไขมัน×9) · ฉลากบอกแคลไว้ก็กรอกตามฉลาก</Txt>

    <Field label={`กินจริง (${unit})`} value={ate} onChangeText={v => setAte(num(v))} keyboardType="decimal-pad" placeholder={per ? `${per} = ตามฉลาก` : ''} />
    <View style={{ padding: 12, borderRadius: R.field, backgroundColor: C.surface2, gap: 2 }}>
      <Txt bold>{out.kcal.toLocaleString('en-US')} kcal · P {fmt1(out.protein_g)} C {fmt1(out.carb_g)} F {fmt1(out.fat_g)}</Txt>
      <Txt muted size={13}>{perN && ateN !== perN ? `กิน ${fmt1(ateN)} ${unit} จากฉลาก ${fmt1(perN)} ${unit} = ×${fmt1(ratio)}` : 'ตามฉลาก 1 ส่วน'}</Txt>
    </View>
    <Toggle label="เก็บเป็นเมนูโปรด" value={keep} onChange={setKeep} hint="ครั้งหน้ากดจาก เมนูโปรด แล้วกรอกปริมาณที่กินได้เลย" />
    <Btn label="เพิ่ม" onPress={go} loading={busy} />
  </>;
}

type AiItem = { name: string; amount: number; unit: string; grams: number | null; kcal: number; protein_g: number; carb_g: number; fat_g: number };

/** Type what you ate in plain words; the AI turns it into items with calories and macros */
/**
 * Open the camera / photo picker. The input is put in the page while it is open: on iPhone Safari a detached
 * input sometimes never reports the chosen photo, which is why it needed a second tap.
 */
function choosePhoto(): Promise<File | null> {
  return new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; (input as any).capture = 'environment';
    input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(input);
    let done = false;
    const finish = (f: File | null) => { if (done) return; done = true; input.remove(); res(f); };
    input.onchange = () => finish(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/** Shrink to ≤768 px JPEG before it goes to the AI: about 4× smaller to upload than the old 1024 px, still plenty for food */
async function shrinkPhoto(file: File): Promise<{ b64: string; preview: string }> {
  const MAX = 768;
  let src: CanvasImageSource, w: number, h: number, url: string | null = null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);   // decodes off the main thread
    src = bmp; w = bmp.width; h = bmp.height;
  } catch {
    url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = document.createElement('img'); i.onload = () => ok(i); i.onerror = bad; i.src = url!; });
    src = img; w = img.naturalWidth; h = img.naturalHeight;
  }
  const k = Math.min(1, MAX / Math.max(w, h));
  const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d')!.drawImage(src, 0, 0, cv.width, cv.height);
  if (url) URL.revokeObjectURL(url);
  const preview = cv.toDataURL('image/jpeg', 0.72);
  return { b64: preview.split(',')[1], preview };
}

function AiText({ onSave, busy, photo }: { onSave: (i: NewItem) => void; busy: boolean; photo?: boolean }) {
  const [q, setQ] = useState('');
  const [pic, setPic] = useState<{ b64: string; preview: string } | null>(null);
  const [items, setItems] = useState<AiItem[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  async function ask(img = pic) {
    if (photo ? !img?.b64 : !q.trim()) { setErr(photo ? 'ถ่ายหรือเลือกรูปอาหารก่อน' : 'พิมพ์สิ่งที่กิน เช่น ข้าวสวย 100 กรัม'); return; }
    setAsking(true); setErr(''); setItems(null); setEditing(null);
    const { data, error } = await supabase.functions.invoke('food-ai', { body: photo ? { q: q.trim(), image: img!.b64, media_type: 'image/jpeg' } : { q: q.trim() } });
    setAsking(false);
    let code = data?.error as string | undefined;
    if (error) { try { code = (await (error as any).context.json()).error; } catch { code = 'ai_failed'; } }
    if (code) {
      setErr(code === 'ai_not_configured' ? 'AI ยังไม่เปิดใช้ (ผู้ดูแลยังไม่ได้ใส่คีย์) · ใช้ "ค้นหา" หรือ "สร้างเอง" ไปก่อน'
        : code === 'daily_limit' ? 'ใช้ AI ครบ 30 ครั้งของวันนี้แล้ว · พรุ่งนี้ใช้ได้ใหม่'
        : code === 'ai_bad_output' ? (photo ? 'AI อ่านรูปนี้ไม่ออก ลองถ่ายใกล้ขึ้น หรือพิมพ์บอกเพิ่มว่ากินอะไร' : 'AI ไม่เข้าใจข้อความนี้ ลองพิมพ์ชื่ออาหารกับปริมาณ')
        : 'AI ตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง');
      return;
    }
    setItems((data?.items as AiItem[]) ?? []); setNote(data?.note ?? null);
  }
  const toItem = (i: AiItem): NewItem => ({ name: `${i.name}${i.amount ? ` ${fmt1(i.amount)} ${i.unit}` : ''}`, grams: i.grams, kcal: i.kcal,
    protein_g: i.protein_g, carb_g: i.carb_g, fat_g: i.fat_g, from_ai: true, food_id: null });
  return <>
    {err ? <Notice text={err} /> : null}
    {photo ? <>
      {pic ? <Image source={{ uri: pic.preview }} accessibilityLabel="รูปอาหารที่เลือก" style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: R.field, backgroundColor: C.surface2 }} resizeMode="cover" /> : null}
      <Btn kind={pic ? 'ghost' : 'primary'} icon="camera" label={pic ? 'ถ่ายใหม่' : 'ถ่ายรูป / เลือกรูปอาหาร'}
        onPress={async () => {
          if (Platform.OS !== 'web') { setErr('ถ่ายรูปได้บนเว็บก่อน แอปมือถือกำลังทำ'); return; }
          const file = await choosePhoto();
          if (!file) return;
          setErr(''); setItems(null); setAsking(true);
          setPic({ b64: '', preview: URL.createObjectURL(file) });          // show the photo right away
          try { const p = await shrinkPhoto(file); setPic(p); ask(p); }
          catch { setAsking(false); setErr('เปิดรูปนี้ไม่ได้ ลองถ่ายใหม่'); }
        }} />
      <Field label="บอก AI เพิ่ม (ไม่บังคับ)" value={q} onChangeText={setQ} placeholder="เช่น กินไปครึ่งจาน, ไม่ใส่ไข่" />
      {pic?.b64 || asking ? <Btn icon="sparkles" label={asking ? 'AI กำลังดูรูป… (ราว 5 วินาที)' : 'ให้ AI ดูรูปอีกครั้ง'} onPress={() => ask()} loading={asking} /> : null}
    </> : <>
      <Field label="กินอะไรไป" value={q} onChangeText={setQ} placeholder="เช่น ข้าวสวย 100 กรัม, ผัดกะเพราหมูสับ 1 จาน" autoFocus onSubmitEditing={() => ask()} returnKeyType="search" />
      <Btn icon="sparkles" label={asking ? 'AI กำลังคำนวณ…' : 'ให้ AI คำนวณ'} onPress={() => ask()} loading={asking} />
    </>}
    {items && !items.length ? <Txt muted>{note || 'AI ไม่เจออาหารในข้อความนี้'}</Txt> : null}
    {(items ?? []).map((i, k) => editing === k ? (
      <AiEdit key={k} item={i} onCancel={() => setEditing(null)}
        onDone={(x) => { setItems(items!.map((y, j) => (j === k ? x : y))); setEditing(null); }} />
    ) : (
      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: R.field, backgroundColor: C.surface2 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt bold>{i.name}{i.amount ? ` · ${fmt1(i.amount)} ${i.unit}` : ''}</Txt>
          <Txt muted size={13}>{macroLine(i)}{i.grams ? ` · ~${Math.round(i.grams)} g` : ''}</Txt>
        </View>
        <Btn kind="ghost" label="แก้ไข" onPress={() => setEditing(k)} style={{ minHeight: 40 }} />
        <Btn label="เพิ่ม" onPress={() => onSave(toItem(i))} loading={busy} style={{ minHeight: 40 }} />
      </View>
    ))}
    {items && items.length > 1 ? <Btn kind="ghost" label={`เพิ่มทั้งหมด (${items.length})`} onPress={async () => { for (const i of items) await onSave(toItem(i)); }} /> : null}
    {items?.length ? <Txt muted size={12.5}>{note ? `${note} · ` : ''}ค่าประมาณจาก AI ตรวจดูก่อนเพิ่ม</Txt> : null}
  </>;
}


/**
 * Fix what the AI guessed before adding it. Changing the amount scales the values from the AI's amount
 * (AI said 1 จาน, you ate 0.5 → half); the values themselves can also be typed over.
 */
function AiEdit({ item, onDone, onCancel }: { item: AiItem; onDone: (i: AiItem) => void; onCancel: () => void }) {
  const s = (n: number | null | undefined) => (n == null ? '' : String(n));
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(s(item.amount || 1));
  const [unit, setUnit] = useState(item.unit);
  const [kcal, setKcal] = useState(s(item.kcal));
  const [p, setP] = useState(s(item.protein_g)); const [c, setC_] = useState(s(item.carb_g)); const [f, setF] = useState(s(item.fat_g));
  const [g, setG] = useState(s(item.grams));
  const num = (v: string) => v.replace(/[^\d.]/g, '');
  const macroKcal = Math.round(Number(p || 0) * 4 + Number(c || 0) * 4 + Number(f || 0) * 9);

  function changeAmount(v: string) {
    const old = Number(amount) || 0, nu = Number(num(v)) || 0;
    setAmount(num(v));
    if (old > 0 && nu > 0 && nu !== old) {
      const k = nu / old, sc = (x: string, d = 1) => (x === '' ? '' : String(Math.round(Number(x) * k * 10 ** d) / 10 ** d));
      setKcal(sc(kcal, 0)); setP(sc(p)); setC_(sc(c)); setF(sc(f)); setG(sc(g, 0));
    }
  }
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: R.field, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.accent }}>
      <Txt bold size={14}>แก้ไขก่อนเพิ่ม</Txt>
      <Field label="ชื่อ" value={name} onChangeText={setName} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="ปริมาณ" value={amount} onChangeText={changeAmount} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="หน่วย" value={unit} onChangeText={setUnit} /></View>
        <View style={{ flex: 1 }}><Field label="น้ำหนัก g" value={g} onChangeText={v => setG(num(v))} keyboardType="decimal-pad" /></View>
      </View>
      <Txt muted size={12.5}>เปลี่ยนปริมาณแล้วค่าด้านล่างปรับตามสัดส่วนให้เอง</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="โปรตีน g" value={p} onChangeText={v => setP(num(v))} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="คาร์บ g" value={c} onChangeText={v => setC_(num(v))} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="ไขมัน g" value={f} onChangeText={v => setF(num(v))} keyboardType="decimal-pad" /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label="แคลอรี (kcal)" value={kcal} onChangeText={v => setKcal(num(v))} keyboardType="decimal-pad" /></View>
        <Btn kind="ghost" label="คำนวณจาก Macro" onPress={() => setKcal(String(macroKcal))} style={{ minHeight: 48 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn kind="ghost" label="ยกเลิก" onPress={onCancel} style={{ flex: 1 }} />
        <Btn label="ใช้ค่านี้" onPress={() => onDone({ name: name.trim() || item.name, amount: Number(amount) || 0, unit: unit.trim(), grams: g === '' ? null : Number(g),
          kcal: Number(kcal || 0), protein_g: Number(p || 0), carb_g: Number(c || 0), fat_g: Number(f || 0) })} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/**
 * Step 1: we work out the daily calories from the person's details (Mifflin–St Jeor × activity, then the goal) — editable.
 * Step 2: how to split them: a preset eating style, or drag the carb / protein / fat ratio.
 */
function TargetForm({ current, onDone }: { current?: Target | null; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [sex, setSex] = useState<'m' | 'f'>('m');
  const [age, setAge] = useState('30');
  const [height, setHeight] = useState('170');
  const [weight, setWeight] = useState('');
  const [act, setAct] = useState(1.375);
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>((current?.goal as any) ?? 'lose');
  const [kcalTxt, setKcalTxt] = useState(current ? String(current.kcal) : '');
  const [edited, setEdited] = useState(!!current);
  const [split, setSplit] = useState<Split>(() => {
    if (current?.kcal && current.protein_g && current.carb_g && current.fat_g) {
      const c = Math.round(current.carb_g * 4 / current.kcal * 100), p = Math.round(current.protein_g * 4 / current.kcal * 100);
      return { c, p, f: Math.max(5, 100 - c - p) };
    }
    return STYLES[0].s;
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('body_measurements').select('weight_kg').eq('user_id', profile.id).not('weight_kg', 'is', null).order('measured_on', { ascending: false }).limit(1)
      .then(({ data }) => { const w = (data as any)?.[0]?.weight_kg; if (w) setWeight(String(w)); });
  }, [profile]);

  const ok = Number(age) > 10 && Number(height) > 100 && Number(weight) > 25;
  const calc = ok ? calcTarget({ sex, age: Number(age), height: Number(height), weight: Number(weight), activity: act, goal, style: 'balanced' }) : null;
  // the calculated number follows the inputs until the person types their own
  useEffect(() => { if (calc && !edited) setKcalTxt(String(calc.kcal)); }, [calc?.kcal, edited]);
  const kcal = Number(kcalTxt) || 0;
  const g = gramsOf(kcal, split);

  async function save() {
    if (!(kcal >= 800 && kcal <= 6000)) { setErr('แคลอรีต่อวันควรอยู่ระหว่าง 800–6,000'); return; }
    setBusy(true);
    const st = STYLES.find(x => x.s.c === split.c && x.s.p === split.p && x.s.f === split.f);
    const { error } = await supabase.from('nutrition_targets').insert({
      user_id: profile!.id, set_by: profile!.id, goal, style: st?.db ?? 'custom', kcal, protein_g: g.p, carb_g: g.c, fat_g: g.f,
      note: st ? st.t : `กำหนดเอง C${split.c} P${split.p} F${split.f}`,
    });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(`ตั้งเป้า ${kcal.toLocaleString('en-US')} kcal · คาร์บ ${g.c} โปรตีน ${g.p} ไขมัน ${g.f} ก.`);
  }

  return (
    <Card>
      <H size={17}>ตั้งเป้าหมาย</H>
      {err ? <Notice text={err} /> : null}
      <Txt bold size={14}>1. แคลอรีต่อวัน</Txt>
      <Chips label="เพศ" options={[{ v: 'm', t: 'ชาย' }, { v: 'f', t: 'หญิง' }]} value={sex} onChange={setSex} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="อายุ" value={age} onChangeText={v => setAge(v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="สูง (ซม.)" value={height} onChangeText={v => setHeight(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="หนัก (กก.)" value={weight} onChangeText={v => setWeight(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" /></View>
      </View>
      <Select label="ออกกำลังกาย" value={String(act)} options={ACTIVITY.map(a => ({ v: String(a.v), t: a.t }))} onChange={v => setAct(Number(v))} />
      <Chips label="เป้าหมาย" options={[{ v: 'lose', t: 'ลดไขมัน' }, { v: 'maintain', t: 'คงที่' }, { v: 'gain', t: 'เพิ่มกล้าม' }]} value={goal} onChange={setGoal} />
      {calc ? <Txt muted size={13}>ร่างกายใช้พลังงานราว {calc.tdee.toLocaleString('en-US')} kcal/วัน (TDEE) · {goal === 'lose' ? 'ลด 500' : goal === 'gain' ? 'เพิ่ม 300' : 'เท่าเดิม'} ตามเป้าหมาย</Txt>
        : <Txt muted size={13}>ใส่อายุ ส่วนสูง น้ำหนัก เพื่อให้ระบบคำนวณ</Txt>}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label="เป้าแคลอรีต่อวัน (แก้เองได้)" value={kcalTxt} onChangeText={v => { setKcalTxt(v.replace(/\D/g, '')); setEdited(true); }} keyboardType="number-pad" /></View>
        {calc && edited && Number(kcalTxt) !== calc.kcal ? <Btn kind="ghost" label={`ใช้ ${calc.kcal}`} onPress={() => { setEdited(false); setKcalTxt(String(calc.kcal)); }} style={{ minHeight: 48 }} /> : null}
      </View>

      <Txt bold size={14} style={{ marginTop: 8 }}>2. แนวทางการกิน</Txt>
      <MacroSplit kcal={kcal} value={split} onChange={setSplit} />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn kind="ghost" label="รีเซ็ต" onPress={() => { setSplit(STYLES[0].s); setEdited(false); if (calc) setKcalTxt(String(calc.kcal)); }} />
        <Btn label="บันทึกเป้า" onPress={save} loading={busy} style={{ flex: 1 }} />
      </View>
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}
