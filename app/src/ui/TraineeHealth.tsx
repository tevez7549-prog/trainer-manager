import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { supabase, thError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { addDays, thDate, thDateTs, todayISO } from '../lib/gym';
import { fmt1, latestTarget, loadDay, PART_TH, totals, type Exercise, type Meal, type Target } from '../lib/me';
import { C, R } from '../lib/theme';
import { Btn, Card, Chips, DateField, Field, H, Notice, Txt } from './index';
import { DayTotals } from './Macro';
import { Icon } from './Icon';

/**
 * What a trainer sees of a trainee who uses the app: weight trend, today's food against the target,
 * last workout. From here the trainer sets the calorie target, sends a program and comments on meals.
 */
export function TraineeHealth({ clientId, tcId, name }: { clientId: string | null; tcId: string; name: string }) {
  const [panel, setPanel] = useState<'' | 'target' | 'program'>('');
  const [w, setW] = useState<{ now: number; first: number | null; on: string } | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const [b, m, t, wk] = await Promise.all([
      supabase.from('body_measurements').select('measured_on,weight_kg').eq('user_id', clientId).not('weight_kg', 'is', null).order('measured_on', { ascending: false }).limit(60),
      loadDay(clientId, todayISO()),
      latestTarget(clientId),
      supabase.from('workouts').select('started_at').eq('user_id', clientId).order('started_at', { ascending: false }).limit(1),
    ]);
    const ws = (b.data as { measured_on: string; weight_kg: number }[]) ?? [];
    setW(ws.length ? { now: Number(ws[0].weight_kg), first: ws.length > 1 ? Number(ws[ws.length - 1].weight_kg) : null, on: ws[0].measured_on } : null);
    setMeals(m); setTarget(t);
    setLast(((wk.data as any) ?? [])[0]?.started_at ?? null);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  if (!clientId) return (
    <Card><H size={17}>สุขภาพ</H><Txt muted size={14}>{name} ยังไม่ได้ใช้แอป · เมื่อสมัครด้วยเบอร์เดียวกับที่ยิมบันทึกไว้ จะเห็นน้ำหนัก อาหาร และการเล่นที่นี่</Txt></Card>
  );
  const done = (t?: string) => { setPanel(''); if (t) { setMsg({ t, ok: true }); load(); } };

  return <>
    <Card style={{ gap: 10 }}>
      <H size={17}>สุขภาพของ{name}</H>
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt muted size={13}>น้ำหนัก</Txt>
          <Txt bold size={18}>{w ? `${fmt1(w.now)} kg` : '–'}</Txt>
          {w?.first != null ? <Txt size={12.5} style={{ color: w.now <= w.first ? C.accent : C.warnFg }}>{w.now - w.first > 0 ? '+' : ''}{fmt1(w.now - w.first)} จากครั้งแรก</Txt> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Txt muted size={13}>เล่นเองล่าสุด</Txt>
          <Txt bold size={18}>{last ? thDateTs(last) : '–'}</Txt>
        </View>
      </View>
      <Txt muted size={13}>อาหารวันนี้</Txt>
      <DayTotals t={totals(meals.flatMap(m => m.items))} target={target} compact />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn kind="ghost" icon="flame" label="ตั้งเป้าแคลอรี" onPress={() => setPanel('target')} style={{ flex: 1 }} />
        <Btn kind="ghost" icon="list" label="จัดโปรแกรม" onPress={() => setPanel('program')} style={{ flex: 1 }} />
      </View>
    </Card>
    {panel === 'target' ? <TargetFor clientId={clientId} current={target} onDone={done} /> : null}
    {panel === 'program' ? <ProgramBuilder tcId={tcId} onDone={done} /> : null}
    {meals.length ? <MealsWithComments clientId={clientId} meals={meals} /> : null}
  </>;
}

function TargetFor({ clientId, current, onDone }: { clientId: string; current: Target | null; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [kcal, setKcal] = useState(current ? String(current.kcal) : '');
  const [p, setP] = useState(current?.protein_g ? String(current.protein_g) : '');
  const [c, setC_] = useState(current?.carb_g ? String(current.carb_g) : '');
  const [f, setF] = useState(current?.fat_g ? String(current.fat_g) : '');
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>((current?.goal as any) ?? 'lose');
  const [err, setErr] = useState('');
  async function save() {
    const k = Number(kcal);
    if (!(k >= 800 && k <= 6000)) { setErr('แคลอรีควรอยู่ระหว่าง 800–6,000'); return; }
    const { error } = await supabase.from('nutrition_targets').insert({ user_id: clientId, set_by: profile!.id, goal, style: 'custom', kcal: k,
      protein_g: p ? Number(p) : null, carb_g: c ? Number(c) : null, fat_g: f ? Number(f) : null });
    if (error) { setErr(thError(error)); return; }
    onDone(`ตั้งเป้า ${k.toLocaleString('en-US')} kcal ให้แล้ว`);
  }
  const num = (v: string) => v.replace(/\D/g, '');
  return (
    <Card>
      <H size={17}>ตั้งเป้าแคลอรีให้ลูกเทรน</H>
      {err ? <Notice text={err} /> : null}
      <Chips label="เป้าหมาย" options={[{ v: 'lose', t: 'ลดไขมัน' }, { v: 'maintain', t: 'คงที่' }, { v: 'gain', t: 'เพิ่มกล้าม' }]} value={goal} onChange={setGoal} />
      <Field label="แคลอรีต่อวัน" value={kcal} onChangeText={v => setKcal(num(v))} keyboardType="number-pad" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="โปรตีน g" value={p} onChangeText={v => setP(num(v))} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="คาร์บ g" value={c} onChangeText={v => setC_(num(v))} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="ไขมัน g" value={f} onChangeText={v => setF(num(v))} keyboardType="number-pad" /></View>
      </View>
      <Btn label="บันทึกเป้า" onPress={save} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}

type Row = { ex: Exercise; sets: string; reps: string; kg: string };

/** A short workout plan for the trainee; it shows up on their "ออกกำลัง" tab */
function ProgramBuilder({ tcId, onDone }: { tcId: string; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [day, setDay] = useState(addDays(todayISO(), 1));
  const [rows, setRows] = useState<Row[]>([]);
  const [lib, setLib] = useState<Exercise[]>([]);
  const [part, setPart] = useState('chest');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from('exercises').select('id,name_th,name_en,body_part,kind').order('name_th').then(({ data }) => setLib((data as Exercise[]) ?? [])); }, []);
  const shown = useMemo(() => lib.filter(e => e.body_part === part), [lib, part]);
  const set = (i: number, k: 'sets' | 'reps' | 'kg', v: string) => setRows(rows.map((r, a) => a === i ? { ...r, [k]: v.replace(/[^\d.]/g, '') } : r));

  async function save() {
    if (!rows.length) { setErr('เพิ่มอย่างน้อย 1 ท่า'); return; }
    setBusy(true);
    const title = name.trim() || [...new Set(rows.map(r => PART_TH[r.ex.body_part]))].join(' + ');
    const p = await supabase.from('programs').insert({ owner_id: profile!.id, name: title, trainer_client_id: tcId, planned_for: day || null }).select('id').single();
    if (p.error) { setBusy(false); setErr(thError(p.error)); return; }
    const { error } = await supabase.from('program_exercises').insert(rows.map((r, i) => ({
      program_id: p.data!.id, position: i + 1, exercise_id: r.ex.id, sets: r.sets ? Number(r.sets) : null, reps: r.reps ? Number(r.reps) : null, weight_kg: r.kg ? Number(r.kg) : null,
    })));
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(`ส่งโปรแกรม "${title}" ให้แล้ว · ลูกเทรนเห็นที่แท็บ ออกกำลัง`);
  }

  return (
    <Card>
      <H size={17}>จัดโปรแกรม</H>
      {err ? <Notice text={err} /> : null}
      <Field label="ชื่อโปรแกรม (ไม่บังคับ)" value={name} onChangeText={setName} placeholder="เช่น วันขา" />
      <DateField label="สำหรับวันที่" value={day} onChange={setDay} min={todayISO()} />
      {rows.map((r, i) => (
        <View key={r.ex.id + i} style={{ gap: 6, padding: 12, borderRadius: R.field, backgroundColor: C.surface2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Txt bold style={{ flex: 1 }}>{i + 1}. {r.ex.name_th}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={`เอา ${r.ex.name_th} ออก`} onPress={() => setRows(rows.filter((_, a) => a !== i))} hitSlop={8}><Icon name="x" size={18} color={C.muted} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="เซต" value={r.sets} onChangeText={v => set(i, 'sets', v)} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="ครั้ง" value={r.reps} onChangeText={v => set(i, 'reps', v)} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="kg" value={r.kg} onChangeText={v => set(i, 'kg', v)} keyboardType="decimal-pad" /></View>
          </View>
        </View>
      ))}
      <Chips options={Object.keys(PART_TH).map(k => ({ v: k, t: PART_TH[k] }))} value={part} onChange={setPart} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {shown.map(x => (
          <Pressable key={x.id} accessibilityRole="button" onPress={() => setRows([...rows, { ex: x, sets: '3', reps: x.kind === 'strength' ? '10' : '', kg: '' }])}
            style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.surface2, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Txt size={15}>+ {x.name_th}</Txt>
          </Pressable>
        ))}
      </View>
      <Btn label="ส่งโปรแกรม" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}

type Cm = { id: string; meal_id: string; body: string; author: { display_name: string } | null };

function MealsWithComments({ clientId, meals }: { clientId: string; meals: Meal[] }) {
  const { profile } = useAuth();
  const [cms, setCms] = useState<Cm[]>([]);
  const [text, setText] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const { data } = await supabase.from('meal_comments').select('id,meal_id,body,author:profiles!meal_comments_author_id_fkey(display_name)').in('meal_id', meals.map(m => m.id)).order('created_at');
    setCms(((data as any) ?? []) as Cm[]);
  }, [meals]);
  useEffect(() => { load(); }, [load]);
  async function send(m: Meal) {
    const body = (text[m.id] ?? '').trim();
    if (!body) return;
    const { error } = await supabase.from('meal_comments').insert({ meal_id: m.id, user_id: clientId, author_id: profile!.id, body });
    if (!error) { setText({ ...text, [m.id]: '' }); load(); }
  }
  return (
    <Card style={{ gap: 8 }}>
      <H size={17}>อาหารวันนี้ · {thDate(todayISO())}</H>
      {meals.map(m => (
        <View key={m.id} style={{ gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Txt bold>{m.name} · {Math.round(totals(m.items).kcal)} kcal</Txt>
          {m.items.map(i => <Txt key={i.id} muted size={14}>{i.name} · {Math.round(i.kcal)} kcal</Txt>)}
          {cms.filter(c => c.meal_id === m.id).map(c => <Txt key={c.id} size={14} style={{ color: C.infoFg }}>{c.author?.display_name}: {c.body}</Txt>)}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label="แนะนำมื้อนี้" value={text[m.id] ?? ''} onChangeText={v => setText({ ...text, [m.id]: v })} placeholder="เช่น ดีมาก เพิ่มโปรตีนอีกนิด" /></View>
            <Btn label="ส่ง" onPress={() => send(m)} style={{ minWidth: 64 }} />
          </View>
        </View>
      ))}
    </Card>
  );
}
