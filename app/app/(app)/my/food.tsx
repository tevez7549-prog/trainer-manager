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
import { Btn, Card, Chips, ConfirmBtn, Field, H, Header, Notice, Screen, Txt } from '../../../src/ui';
import { DayTotals } from '../../../src/ui/Macro';
import { Icon } from '../../../src/ui/Icon';
import { TabBar } from '../../../src/ui/TabBar';
import { C, R } from '../../../src/lib/theme';

type Comment = { id: string; meal_id: string; body: string; created_at: string; author: { display_name: string } | null };
const mealNow = () => { const h = new Date().getHours(); return h < 10 ? 'มื้อเช้า' : h < 15 ? 'มื้อกลางวัน' : h < 21 ? 'มื้อเย็น' : 'ของว่าง'; };

export default function FoodPage() {
  const { profile } = useAuth();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const [day, setDay] = useState(todayISO());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [target, setTarget] = useState<Target | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [adding, setAdding] = useState<string | null>(add ? mealNow() : null);
  const [setting, setSetting] = useState(false);
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

  const all = meals.flatMap(m => m.items);
  const done = (t: string, ok = true) => { setMsg({ t, ok }); load(); };
  async function del(i: MealItem) {
    const { error } = await supabase.from('meal_items').delete().eq('id', i.id);
    if (error) done(thError(error), false); else done(`ลบ ${i.name} แล้ว`);
  }

  return (
    <Screen footer={<TabBar tabs={MEMBER_TABS} active="food" />}>
      <Header title="อาหาร" right={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="วันก่อน" onPress={() => setDay(addDays(day, -1))} style={{ padding: 10 }}><Icon name="chevron-left" size={20} /></Pressable>
          <Txt bold size={14}>{day === todayISO() ? 'วันนี้' : thDate(day)}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="วันถัดไป" disabled={day >= todayISO()} onPress={() => setDay(addDays(day, 1))} style={{ padding: 10, opacity: day >= todayISO() ? 0.3 : 1 }}><Icon name="chevron-right" size={20} /></Pressable>
        </View>} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      <Card>
        <DayTotals t={totals(all)} target={target ?? null} />
        {target && target.set_by && target.set_by !== profile?.id ? <Txt muted size={13}>เป้านี้ตั้งโดยเทรนเนอร์</Txt> : null}
        {target === null && !setting ? <Btn kind="ghost" icon="flame" label="ตั้งเป้าแคลอรี" onPress={() => setSetting(true)} /> : null}
        {target && !setting ? <Txt size={14} style={{ color: C.accent }} onPress={() => setSetting(true)}>เปลี่ยนเป้า</Txt> : null}
      </Card>
      {setting ? <TargetForm onDone={(t) => { setSetting(false); if (t) done(t); }} /> : null}

      {MEAL_NAMES.map(name => {
        const m = meals.find(x => x.name === name);
        const items = m?.items ?? [];
        const kcal = Math.round(totals(items).kcal);
        const cs = comments.filter(c => c.meal_id === m?.id);
        return (
          <Card key={name} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <H size={17} style={{ flex: 1 }}>{name}</H>
              {kcal ? <Txt muted size={14}>{kcal} kcal</Txt> : null}
            </View>
            {items.map(i => <ItemRow key={i.id} i={i} onDelete={() => del(i)} />)}
            {cs.map(c => (
              <View key={c.id} style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: R.field, backgroundColor: C.infoBg }}>
                <Icon name="message" size={18} color={C.infoFg} />
                <Txt size={14} style={{ color: C.infoFg, flex: 1 }}><Txt bold style={{ color: C.infoFg }}>{c.author?.display_name ?? 'เทรนเนอร์'}: </Txt>{c.body}</Txt>
              </View>
            ))}
            {adding === name
              ? <AddFood meal={name} day={day} onDone={(t) => { setAdding(null); if (t) done(t); }} />
              : <Btn kind="ghost" icon="plus" label="เพิ่ม" onPress={() => setAdding(name)} style={{ minHeight: 44 }} />}
          </Card>
        );
      })}
    </Screen>
  );
}

function ItemRow({ i, onDelete }: { i: MealItem; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8, gap: 6 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Txt bold size={15}>{i.name}{i.from_ai ? '  ·  ผลจำลอง' : ''}</Txt>
          <Txt muted size={13}>{i.grams ? `${fmt1(i.grams)} g · ` : ''}P {fmt1(i.protein_g)} · C {fmt1(i.carb_g)} · F {fmt1(i.fat_g)}</Txt>
        </View>
        <Txt bold>{Math.round(i.kcal)}</Txt>
      </Pressable>
      {open ? <ConfirmBtn label="ลบรายการนี้" onConfirm={onDelete} /> : null}
    </View>
  );
}

type Mode = 'search' | 'manual' | 'photo';

/** Add food: search the food list, type it in, or (simulated) snap a photo */
function AddFood({ meal, day, onDone }: { meal: string; day: string; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>('search');
  const [foods, setFoods] = useState<Food[]>([]);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Food | null>(null);
  const [mult, setMult] = useState(1);
  const [m, setM] = useState({ name: '', kcal: '', p: '', c: '', f: '' });
  const [aiGuess, setAiGuess] = useState<Food | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { supabase.from('foods').select('*').order('name_th').then(({ data }) => setFoods((data as Food[]) ?? [])); }, []);
  const found = useMemo(() => { const s = q.trim(); return (s ? foods.filter(f => f.name_th.includes(s)) : foods).slice(0, 30); }, [foods, q]);

  async function save(item: Omit<MealItem, 'id' | 'meal_id'>, label: string) {
    setBusy(true); setErr('');
    const { error } = await addItem(profile!.id, day, meal, item);
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(`เพิ่ม ${label} ใน${meal}แล้ว`);
  }
  const fromFood = (f: Food, x: number, ai = false) => save({
    name: f.name_th, grams: Math.round(f.serving_g * x), kcal: Math.round(f.kcal * x), protein_g: +(f.protein_g * x).toFixed(1),
    carb_g: +(f.carb_g * x).toFixed(1), fat_g: +(f.fat_g * x).toFixed(1), from_ai: ai, food_id: f.id,
  }, f.name_th);

  async function manual() {
    const kcal = Number(m.kcal);
    if (!m.name.trim()) { setErr('ใส่ชื่ออาหาร'); return; }
    if (!(kcal >= 0) || m.kcal === '') { setErr('ใส่แคลอรีเป็นตัวเลข'); return; }
    await save({ name: m.name.trim(), grams: null, kcal, protein_g: Number(m.p || 0), carb_g: Number(m.c || 0), fat_g: Number(m.f || 0), from_ai: false, food_id: null }, m.name.trim());
  }

  return (
    <View style={{ gap: 10, paddingTop: 6 }}>
      {err ? <Notice text={err} /> : null}
      <Chips options={[{ v: 'search', t: 'ค้นหา' }, { v: 'manual', t: 'กรอกเอง' }, { v: 'photo', t: 'ถ่ายรูป' }]} value={mode} onChange={v => { setMode(v); setErr(''); }} />

      {mode === 'search' ? (pick ? <>
        <Txt bold>{pick.name_th}</Txt>
        <Chips label="ปริมาณ" options={[0.5, 1, 1.5, 2].map(x => ({ v: x, t: x === 1 ? '1 ที่' : `×${x}` }))} value={mult} onChange={setMult} />
        <Txt muted size={14}>{Math.round(pick.kcal * mult)} kcal · P {fmt1(pick.protein_g * mult)} · C {fmt1(pick.carb_g * mult)} · F {fmt1(pick.fat_g * mult)} g</Txt>
        <Btn label="เพิ่ม" onPress={() => fromFood(pick, mult)} loading={busy} />
        <Btn kind="ghost" label="เลือกอย่างอื่น" onPress={() => { setPick(null); setMult(1); }} />
      </> : <>
        <Field label="ค้นหาอาหาร" value={q} onChangeText={setQ} placeholder="เช่น กะเพรา อกไก่ ส้มตำ" icon="search" />
        <View style={{ maxHeight: 320 }}>
          {found.map(f => (
            <Pressable key={f.id} accessibilityRole="button" onPress={() => setPick(f)}
              style={({ pressed }) => ({ flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, opacity: pressed ? 0.6 : 1 })}>
              <Txt style={{ flex: 1 }}>{f.name_th}</Txt><Txt muted>{Math.round(f.kcal)} kcal</Txt>
            </Pressable>
          ))}
          {!found.length ? <Txt muted>ไม่เจอ ลองกรอกเอง</Txt> : null}
        </View>
        <Txt muted size={12.5}>ฐานข้อมูลอาหารตัวอย่าง {foods.length} รายการ ค่าโดยประมาณ</Txt>
      </>) : null}

      {mode === 'manual' ? <>
        <Field label="ชื่ออาหาร" value={m.name} onChangeText={v => setM({ ...m, name: v })} />
        <Field label="แคลอรี (kcal)" value={m.kcal} onChangeText={v => setM({ ...m, kcal: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['p', 'โปรตีน g'], ['c', 'คาร์บ g'], ['f', 'ไขมัน g']] as const).map(([k, l]) => (
            <View key={k} style={{ flex: 1 }}><Field label={l} value={m[k]} onChangeText={v => setM({ ...m, [k]: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" /></View>
          ))}
        </View>
        <Btn label="เพิ่ม" onPress={manual} loading={busy} />
      </> : null}

      {mode === 'photo' ? <>
        <Notice kind="info" text="ระบบจำลอง: ยังไม่ได้ต่อ AI จริง ผลด้านล่างสุ่มจากรายการอาหารตัวอย่าง เพื่อให้เห็นขั้นตอน" />
        {!aiGuess ? <Btn icon="camera" label="ถ่ายรูป / เลือกรูปอาหาร" onPress={() => foods.length && setAiGuess(foods[Math.floor(Math.random() * foods.length)])} /> : <>
          <View style={{ padding: 12, borderRadius: R.field, backgroundColor: C.surface2, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={18} color={C.accent} /><Txt bold>น่าจะเป็น: {aiGuess.name_th}</Txt></View>
            <Txt muted size={14}>{Math.round(aiGuess.kcal)} kcal · P {fmt1(aiGuess.protein_g)} · C {fmt1(aiGuess.carb_g)} · F {fmt1(aiGuess.fat_g)} g</Txt>
          </View>
          <Btn label="ใช่ เพิ่มเลย" onPress={() => fromFood(aiGuess, 1, true)} loading={busy} />
          <Btn kind="ghost" label="ไม่ใช่ ค้นหาเอง" onPress={() => { setAiGuess(null); setMode('search'); }} />
        </>}
      </> : null}

      <Btn kind="ghost" label="ปิด" onPress={() => onDone()} />
    </View>
  );
}

/** Daily calorie target from body stats (Mifflin–St Jeor), or typed in */
function TargetForm({ onDone }: { onDone: (msg?: string) => void }) {
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
