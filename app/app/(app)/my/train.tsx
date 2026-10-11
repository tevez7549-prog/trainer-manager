import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { addDays, thDate, thDateTs, todayISO } from '../../../src/lib/gym';
import { MEMBER_TABS } from '../../../src/lib/nav';
import { fmt1, PART_TH, type Exercise, type Workout } from '../../../src/lib/me';
import { Btn, Card, Chips, ConfirmBtn, Empty, Field, H, Header, Label, Notice, Screen, Stat, Txt } from '../../../src/ui';
import { Icon } from '../../../src/ui/Icon';
import { TabBar } from '../../../src/ui/TabBar';
import { C, R } from '../../../src/lib/theme';

type ProgEx = { position: number; sets: number | null; reps: number | null; weight_kg: number | null; note: string | null; exercise: Exercise | null };
type Program = { id: string; name: string; planned_for: string | null; created_at: string; owner: { display_name: string } | null; items: ProgEx[] };
type Draft = { title: string; trainerId: string | null; ex: { ex: Exercise; sets: { reps: string; kg: string }[] }[] };

export default function TrainPage() {
  const { profile } = useAuth();
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [history, setHistory] = useState<Workout[]>([]);
  const [ptDone, setPtDone] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [m, w] = await Promise.all([
      supabase.from('members').select('id').eq('profile_id', profile.id),
      supabase.from('workouts').select('id,title,started_at,ended_at,note,trainer_id,sets:workout_sets(exercise_id,exercise_name,set_no,reps,weight_kg,duration_sec)')
        .eq('user_id', profile.id).order('started_at', { ascending: false }).limit(15),
    ]);
    setHistory(((w.data as any) ?? []) as Workout[]);
    const mids = ((m.data as { id: string }[]) ?? []).map(x => x.id);
    const t = await supabase.from('trainer_clients').select('id').eq('status', 'active')
      .or(mids.length ? `client_id.eq.${profile.id},member_id.in.(${mids.join(',')})` : `client_id.eq.${profile.id}`);
    const tcIds = ((t.data as { id: string }[]) ?? []).map(x => x.id);
    if (!tcIds.length) { setPrograms([]); return; }
    const since = addDays(todayISO(), -6);
    const [p, a] = await Promise.all([
      supabase.from('programs').select('id,name,planned_for,created_at,owner:profiles!programs_owner_id_fkey(display_name),items:program_exercises(position,sets,reps,weight_kg,note,exercise:exercises(id,name_th,name_en,body_part,kind))')
        .in('trainer_client_id', tcIds).order('created_at', { ascending: false }).limit(10),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).in('trainer_client_id', tcIds).eq('status', 'done').gte('starts_at', new Date(since + 'T00:00:00').toISOString()),
    ]);
    setPrograms(((p.data as any) ?? []).map((x: Program) => ({ ...x, items: [...x.items].sort((a, b) => a.position - b.position) })));
    setPtDone(a.count ?? 0);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const weekCount = history.filter(w => w.started_at >= new Date(addDays(todayISO(), -6) + 'T00:00:00').toISOString()).length;
  const fromProgram = (p: Program) => setDraft({
    title: p.name, trainerId: null,
    ex: p.items.filter(i => i.exercise).map(i => ({ ex: i.exercise!, sets: Array.from({ length: i.sets || 3 }, () => ({ reps: i.reps ? String(i.reps) : '', kg: i.weight_kg ? String(i.weight_kg) : '' })) })),
  });

  return (
    <Screen footer={<TabBar tabs={MEMBER_TABS} active="train" />}>
      <Header title="ออกกำลัง" />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat n={weekCount} t="เล่นเอง 7 วันนี้" />
        <Stat n={ptDone} t="เทรน PT 7 วันนี้" />
      </View>

      {draft ? <Editor draft={draft} setDraft={setDraft} onDone={(t, ok) => { setDraft(null); if (t) { setMsg({ t, ok: ok ?? true }); load(); } }} />
        : <Btn icon="plus" label="เริ่มบันทึกการเล่น" onPress={() => setDraft({ title: '', trainerId: null, ex: [] })} />}

      <Label>โปรแกรมจากเทรนเนอร์</Label>
      {programs === null ? <Txt muted>กำลังโหลด…</Txt> : !programs.length ? (
        <Card><Empty ic="list" title="ยังไม่มีโปรแกรม" text="เมื่อเทรนเนอร์จัดโปรแกรมให้ จะขึ้นที่นี่ กดเริ่มแล้วบันทึกน้ำหนักที่เล่นได้เลย" /></Card>
      ) : programs.map(p => (
        <Card key={p.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <H size={17}>{p.name}</H>
              <Txt muted size={13}>จาก {p.owner?.display_name ?? 'เทรนเนอร์'}{p.planned_for ? ` · สำหรับ ${thDate(p.planned_for)}` : ''}</Txt>
            </View>
          </View>
          {p.items.map((i, k) => (
            <Txt key={k} size={14}>{k + 1}. {i.exercise?.name_th ?? '–'}  <Txt muted size={14}>{[i.sets && `${i.sets} เซต`, i.reps && `${i.reps} ครั้ง`, i.weight_kg && `${fmt1(i.weight_kg)} kg`].filter(Boolean).join(' × ')}</Txt></Txt>
          ))}
          {!draft ? <Btn kind="ghost" icon="dumbbell" label="เริ่มตามโปรแกรมนี้" onPress={() => fromProgram(p)} /> : null}
        </Card>
      ))}

      <Label>ประวัติ</Label>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {!history.length ? <Txt muted style={{ paddingVertical: 14 }}>ยังไม่มีบันทึก</Txt> : null}
        {history.map(w => <HistRow key={w.id} w={w} onDeleted={() => { setMsg({ t: 'ลบแล้ว', ok: true }); load(); }} />)}
      </Card>
    </Screen>
  );
}

function HistRow({ w, onDeleted }: { w: Workout; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const vol = w.sets.reduce((s, x) => s + (Number(x.reps) || 0) * (Number(x.weight_kg) || 0), 0);
  const names = [...new Set(w.sets.map(s => s.exercise_name))];
  async function del() {
    const { error } = await supabase.from('workouts').delete().eq('id', w.id);
    if (!error) onDeleted();
  }
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 10, gap: 6 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt bold>{w.title || 'ออกกำลัง'}</Txt>
          <Txt muted size={13}>{thDateTs(w.started_at)} · {names.length} ท่า · {w.sets.length} เซต{vol ? ` · รวม ${Math.round(vol).toLocaleString('en-US')} kg` : ''}</Txt>
        </View>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={18} color={C.muted} />
      </Pressable>
      {open ? <>
        {names.map(n => (
          <Txt key={n} size={14}>{n}: <Txt muted size={14}>{w.sets.filter(s => s.exercise_name === n).map(s => `${s.reps ?? '–'}${s.weight_kg ? `×${fmt1(s.weight_kg)}` : ''}`).join(', ')}</Txt></Txt>
        ))}
        <ConfirmBtn label="ลบบันทึกนี้" onConfirm={del} />
      </> : null}
    </View>
  );
}

/** Log a session: pick exercises, then reps × kg per set */
function Editor({ draft, setDraft, onDone }: { draft: Draft; setDraft: (d: Draft) => void; onDone: (msg?: string, ok?: boolean) => void }) {
  const { profile } = useAuth();
  const [lib, setLib] = useState<Exercise[]>([]);
  const [part, setPart] = useState('chest');
  const [picking, setPicking] = useState(draft.ex.length === 0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from('exercises').select('id,name_th,name_en,body_part,kind').order('name_th').then(({ data }) => setLib((data as Exercise[]) ?? [])); }, []);
  const shown = useMemo(() => lib.filter(e => e.body_part === part), [lib, part]);

  const setSet = (i: number, j: number, k: 'reps' | 'kg', v: string) => {
    const ex = draft.ex.map((e, a) => a !== i ? e : { ...e, sets: e.sets.map((s, b) => b !== j ? s : { ...s, [k]: v.replace(/[^\d.]/g, '') }) });
    setDraft({ ...draft, ex });
  };
  const addSet = (i: number) => setDraft({ ...draft, ex: draft.ex.map((e, a) => a !== i ? e : { ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { reps: '', kg: '' }) }] }) });
  const removeEx = (i: number) => setDraft({ ...draft, ex: draft.ex.filter((_, a) => a !== i) });

  async function save() {
    const sets = draft.ex.flatMap(e => e.sets.filter(s => s.reps || s.kg).map((s, n) => ({
      exercise_id: e.ex.id, exercise_name: e.ex.name_th, set_no: n + 1, reps: s.reps ? Number(s.reps) : null, weight_kg: s.kg ? Number(s.kg) : null,
    })));
    if (!sets.length) { onDone('ยังไม่ได้ใส่จำนวนครั้งหรือน้ำหนัก', false); return; }
    setBusy(true);
    const title = draft.title.trim() || [...new Set(draft.ex.map(e => PART_TH[e.ex.body_part]))].join(' + ');
    const w = await supabase.from('workouts').insert({ user_id: profile!.id, title, started_at: new Date().toISOString(), ended_at: new Date().toISOString(), created_by: profile!.id }).select('id').single();
    if (w.error) { setBusy(false); onDone(thError(w.error), false); return; }
    const { error } = await supabase.from('workout_sets').insert(sets.map(s => ({ ...s, workout_id: w.data!.id })));
    setBusy(false);
    onDone(error ? thError(error) : `บันทึก ${title} · ${sets.length} เซตแล้ว`, !error);
  }

  return (
    <Card>
      <H size={17}>บันทึกการเล่น</H>
      <Field label="ชื่อ (ไม่บังคับ)" value={draft.title} onChangeText={t => setDraft({ ...draft, title: t })} placeholder="เช่น อก-หลัง" />
      {draft.ex.map((e, i) => (
        <View key={e.ex.id + i} style={{ gap: 6, padding: 12, borderRadius: R.field, backgroundColor: C.surface2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Txt bold style={{ flex: 1 }}>{e.ex.name_th}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={`เอา ${e.ex.name_th} ออก`} onPress={() => removeEx(i)} hitSlop={8}><Icon name="x" size={18} color={C.muted} /></Pressable>
          </View>
          {e.sets.map((s, j) => (
            <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <Txt muted style={{ width: 44, paddingBottom: 14 }}>เซต {j + 1}</Txt>
              <View style={{ flex: 1 }}><Field label="ครั้ง" value={s.reps} onChangeText={v => setSet(i, j, 'reps', v)} keyboardType="number-pad" /></View>
              {e.ex.kind === 'strength' ? <View style={{ flex: 1 }}><Field label="kg" value={s.kg} onChangeText={v => setSet(i, j, 'kg', v)} keyboardType="decimal-pad" /></View> : null}
            </View>
          ))}
          <Txt size={14} style={{ color: C.accent }} onPress={() => addSet(i)}>+ เพิ่มเซต</Txt>
        </View>
      ))}
      {picking ? <>
        <Chips options={Object.keys(PART_TH).map(k => ({ v: k, t: PART_TH[k] }))} value={part} onChange={setPart} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {shown.map(x => (
            <Pressable key={x.id} accessibilityRole="button" onPress={() => { setDraft({ ...draft, ex: [...draft.ex, { ex: x, sets: [{ reps: '', kg: '' }, { reps: '', kg: '' }, { reps: '', kg: '' }] }] }); setPicking(false); }}
              style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.surface2, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <Txt size={15}>{x.name_th}</Txt>
            </Pressable>
          ))}
        </View>
        <Txt muted size={12.5}>คลังท่าตัวอย่าง {lib.length} ท่า</Txt>
      </> : <Btn kind="ghost" icon="plus" label="เพิ่มท่า" onPress={() => setPicking(true)} />}
      <Btn label="บันทึก" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}
