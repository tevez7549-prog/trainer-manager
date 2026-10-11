import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { addDays, thDate, todayISO } from '../../../src/lib/gym';
import { MEMBER_TABS } from '../../../src/lib/nav';
import {
  ACTIVITY, addItem, calcTarget, fmt1, latestTarget, loadDay, MEAL_NAMES, totals,
  type Food, type Meal, type MealItem, type Target,
} from '../../../src/lib/me';
import { Btn, Card, Chips, ConfirmBtn, Field, H, Header, Label, Notice, Row, Screen, Toggle, Txt } from '../../../src/ui';
import { DayTotals } from '../../../src/ui/Macro';
import { Icon } from '../../../src/ui/Icon';
import { TabBar } from '../../../src/ui/TabBar';
import { C, R } from '../../../src/lib/theme';

type Comment = { id: string; meal_id: string; body: string; created_at: string; author: { display_name: string } | null };
type Mode = 'photo' | 'search' | 'fav' | 'recent' | 'custom';
type NewItem = Omit<MealItem, 'id' | 'meal_id'>;
const SHORT: Record<string, string> = { 'มื้อเช้า': 'เช้า', 'มื้อกลางวัน': 'เที่ยง', 'มื้อเย็น': 'เย็น', 'ของว่าง': 'ว่าง' };
const mealNow = () => { const h = new Date().getHours(); return h < 10 ? 'มื้อเช้า' : h < 15 ? 'มื้อกลางวัน' : h < 21 ? 'มื้อเย็น' : 'ของว่าง'; };
const scaled = (f: Food, x: number, ai = false): NewItem => ({
  name: f.name_th, grams: Math.round(f.serving_g * x), kcal: Math.round(f.kcal * x), protein_g: +(f.protein_g * x).toFixed(1),
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
        <Tile icon="camera" label="ถ่ายรูป (AI)" primary on={mode === 'photo'} onPress={() => setMode(mode === 'photo' ? null : 'photo')} />
        <Tile icon="search" label="ค้นหา" on={mode === 'search'} onPress={() => setMode(mode === 'search' ? null : 'search')} />
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

function Tile({ icon, label, onPress, primary, on }: { icon: string; label: string; onPress: () => void; primary?: boolean; on?: boolean }) {
  const bg = primary ? C.brand : on ? C.accentSoft : C.surface, fg = primary ? C.brandInk : on ? C.accent : C.fg;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 92, borderRadius: R.card, backgroundColor: bg, padding: 14, justifyContent: 'space-between',
        borderWidth: on && !primary ? 1.5 : 0, borderColor: C.accent, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={24} color={fg} />
      <Txt bold size={15} style={{ color: fg }}>{label}</Txt>
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
  const title = { photo: 'ถ่ายรูปอาหาร', search: 'ค้นหาอาหาร', fav: 'เมนูโปรด', recent: 'กินล่าสุด', custom: 'สร้างเมนูเอง' }[mode];

  const body = <>
      {!bare ? <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <H size={17} style={{ flex: 1 }}>{title}</H>
        <Pressable accessibilityRole="button" accessibilityLabel="ปิด" onPress={() => onDone()} hitSlop={8}><Icon name="x" size={20} color={C.muted} /></Pressable>
      </View> : null}
      {bare ? <Chips options={[{ v: 'search', t: 'ค้นหา' }, { v: 'fav', t: 'โปรด' }, { v: 'recent', t: 'ล่าสุด' }, { v: 'custom', t: 'สร้างเอง' }, { v: 'photo', t: 'ถ่ายรูป' }] as { v: Mode; t: string }[]} value={mode} onChange={setMode} />
        : <Chips options={MEAL_NAMES.map(n => ({ v: n, t: SHORT[n] ?? n }))} value={meal} onChange={setMeal} />}
      {err ? <Notice text={err} /> : null}
      {mode === 'search' ? <SearchFoods onPick={(f, x) => save(scaled(f, x))} busy={busy} /> : null}
      {mode === 'fav' ? <Favorites onPick={(f, x) => save(scaled(f, x))} busy={busy} /> : null}
      {mode === 'recent' ? <Recent onPick={save} /> : null}
      {mode === 'custom' ? <Custom onSave={save} busy={busy} /> : null}
      {mode === 'photo' ? <Photo onPick={(f) => save(scaled(f, 1, true))} busy={busy} /> : null}
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
  return <>
    <Txt bold>{f.name_th}</Txt>
    <Chips label="ปริมาณ" options={[0.5, 1, 1.5, 2].map(v => ({ v, t: v === 1 ? '1 ที่' : `×${v}` }))} value={x} onChange={setX} />
    <Txt muted size={14}>{macroLine(scaled(f, x))}</Txt>
    <Btn label="เพิ่ม" onPress={() => onAdd(x)} loading={busy} />
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
  const found = useMemo(() => !term ? [] : foods.filter(f => f.name_th.includes(term))
    .sort((a, b) => Number(!a.name_th.startsWith(term)) - Number(!b.name_th.startsWith(term))).slice(0, 8), [foods, term]);
  if (pick) return <Portion f={pick} onAdd={(x) => onPick(pick, x)} onBack={() => setPick(null)} busy={busy} />;
  return <>
    <Field label="ค้นหา" value={q} onChangeText={setQ} placeholder="พิมพ์ชื่ออาหาร เช่น กะเพรา อกไก่" icon="search" autoFocus />
    {term ? <FoodList foods={found} onPick={setPick} fav={fav} /> : null}
    {term && !found.length ? <Txt muted>ไม่เจอ "{term}" · ลองคำอื่น หรือเลือก "สร้างเอง"</Txt> : null}
    <Txt muted size={12.5}>ฐานข้อมูลอาหารตัวอย่าง ค่าโดยประมาณ · แตะดาวเพื่อเก็บเป็นเมนูโปรด</Txt>
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

/** Type the macros; calories follow (4 / 4 / 9). Optionally keep it as my own menu. */
function Custom({ onSave, busy }: { onSave: (i: NewItem) => void; busy: boolean }) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [g, setG] = useState('');
  const [p, setP] = useState(''); const [c, setC_] = useState(''); const [f, setF] = useState('');
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState('');
  const kcal = Math.round(Number(p || 0) * 4 + Number(c || 0) * 4 + Number(f || 0) * 9);
  const num = (v: string) => v.replace(/[^\d.]/g, '');
  async function go() {
    if (!name.trim()) { setErr('ใส่ชื่อเมนู'); return; }
    if (!kcal) { setErr('ใส่โปรตีน คาร์บ หรือไขมันอย่างน้อย 1 ช่อง'); return; }
    let foodId: string | null = null;
    if (keep) {
      const r = await supabase.from('foods').insert({ name_th: name.trim(), serving_g: Number(g || 100), kcal, protein_g: Number(p || 0), carb_g: Number(c || 0), fat_g: Number(f || 0), created_by: profile!.id }).select('id').single();
      if (!r.error) { foodId = r.data.id; await supabase.from('food_favorites').insert({ user_id: profile!.id, food_id: foodId }); }
    }
    onSave({ name: name.trim(), grams: g ? Number(g) : null, kcal, protein_g: Number(p || 0), carb_g: Number(c || 0), fat_g: Number(f || 0), from_ai: false, food_id: foodId });
  }
  return <>
    {err ? <Notice text={err} /> : null}
    <Field label="ชื่อเมนู" value={name} onChangeText={setName} placeholder="เช่น ข้าวกล่องอกไก่ของแม่" />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Field label="โปรตีน g" value={p} onChangeText={v => setP(num(v))} keyboardType="decimal-pad" /></View>
      <View style={{ flex: 1 }}><Field label="คาร์บ g" value={c} onChangeText={v => setC_(num(v))} keyboardType="decimal-pad" /></View>
      <View style={{ flex: 1 }}><Field label="ไขมัน g" value={f} onChangeText={v => setF(num(v))} keyboardType="decimal-pad" /></View>
    </View>
    <Field label="น้ำหนักอาหาร g (ไม่บังคับ)" value={g} onChangeText={v => setG(num(v))} keyboardType="decimal-pad" />
    <View style={{ padding: 12, borderRadius: R.field, backgroundColor: C.surface2 }}>
      <Txt bold>{kcal.toLocaleString('en-US')} kcal</Txt>
      <Txt muted size={13}>คำนวณจาก โปรตีน×4 + คาร์บ×4 + ไขมัน×9</Txt>
    </View>
    <Toggle label="เก็บเป็นเมนูโปรด" value={keep} onChange={setKeep} hint="ครั้งหน้ากดจาก เมนูโปรด ได้เลย" />
    <Btn label="เพิ่ม" onPress={go} loading={busy} />
  </>;
}

/** Simulated: no real AI yet, the "result" is a random sample food so the flow can be tried */
function Photo({ onPick, busy }: { onPick: (f: Food) => void; busy: boolean }) {
  const foods = useFoods();
  const [guess, setGuess] = useState<Food | null>(null);
  return <>
    <Notice kind="info" text="ระบบจำลอง: ยังไม่ได้ต่อ AI จริง ผลด้านล่างสุ่มจากรายการอาหารตัวอย่าง เพื่อให้เห็นขั้นตอน" />
    {!guess ? <Btn icon="camera" label="ถ่ายรูป / เลือกรูปอาหาร" onPress={() => foods.length && setGuess(foods[Math.floor(Math.random() * foods.length)])} /> : <>
      <View style={{ padding: 12, borderRadius: R.field, backgroundColor: C.surface2, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={18} color={C.accent} /><Txt bold>น่าจะเป็น: {guess.name_th}</Txt></View>
        <Txt muted size={14}>{macroLine(guess)}</Txt>
      </View>
      <Btn label="ใช่ เพิ่มเลย" onPress={() => onPick(guess)} loading={busy} />
      <Btn kind="ghost" label="ไม่ใช่ ลองใหม่" onPress={() => setGuess(null)} />
    </>}
  </>;
}

/** Daily calorie target from body stats (Mifflin–St Jeor), or typed in */
function TargetForm({ onDone }: { current?: Target | null; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [sex, setSex] = useState<'m' | 'f'>('m');
  const [age, setAge] = useState('30');
  const [height, setHeight] = useState('170');
  const [weight, setWeight] = useState('');
  const [act, setAct] = useState(1.375);
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('lose');
  const [style, setStyle] = useState<'balanced' | 'high_carb' | 'low_carb'>('balanced');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('body_measurements').select('weight_kg').eq('user_id', profile.id).not('weight_kg', 'is', null).order('measured_on', { ascending: false }).limit(1)
      .then(({ data }) => { const w = (data as any)?.[0]?.weight_kg; if (w) setWeight(String(w)); });
  }, [profile]);

  const ok = Number(age) > 10 && Number(height) > 100 && Number(weight) > 25;
  const r = ok ? calcTarget({ sex, age: Number(age), height: Number(height), weight: Number(weight), activity: act, goal, style }) : null;

  async function save() {
    if (!r) { setErr('ใส่อายุ ส่วนสูง และน้ำหนักให้ครบ'); return; }
    setBusy(true);
    const { error } = await supabase.from('nutrition_targets').insert({
      user_id: profile!.id, set_by: profile!.id, goal, style, kcal: r.kcal, protein_g: r.protein_g, carb_g: r.carb_g, fat_g: r.fat_g,
    });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(`ตั้งเป้า ${r.kcal.toLocaleString('en-US')} kcal ต่อวันแล้ว`);
  }

  return (
    <Card>
      <H size={17}>ตั้งเป้าแคลอรี</H>
      {err ? <Notice text={err} /> : null}
      <Chips label="เพศ" options={[{ v: 'm', t: 'ชาย' }, { v: 'f', t: 'หญิง' }]} value={sex} onChange={setSex} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="อายุ" value={age} onChangeText={v => setAge(v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="สูง (ซม.)" value={height} onChangeText={v => setHeight(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="หนัก (กก.)" value={weight} onChangeText={v => setWeight(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" /></View>
      </View>
      <Chips label="ออกกำลังกาย" options={ACTIVITY} value={act} onChange={setAct} />
      <Chips label="เป้าหมาย" options={[{ v: 'lose', t: 'ลดไขมัน' }, { v: 'maintain', t: 'คงที่' }, { v: 'gain', t: 'เพิ่มกล้าม' }]} value={goal} onChange={setGoal} />
      <Chips label="สัดส่วนอาหาร" options={[{ v: 'balanced', t: 'สมดุล' }, { v: 'high_carb', t: 'คาร์บสูง' }, { v: 'low_carb', t: 'คาร์บต่ำ' }]} value={style} onChange={setStyle} />
      {r ? (
        <View style={{ padding: 12, borderRadius: R.field, backgroundColor: C.surface2, gap: 2 }}>
          <Txt bold>{r.kcal.toLocaleString('en-US')} kcal ต่อวัน</Txt>
          <Txt muted size={14}>ใช้พลังงานราว {r.tdee.toLocaleString('en-US')} kcal · โปรตีน {r.protein_g} g · คาร์บ {r.carb_g} g · ไขมัน {r.fat_g} g</Txt>
        </View>
      ) : null}
      <Btn label="บันทึกเป้า" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}
