import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { addDays, todayISO } from '../../../src/lib/gym';
import { TRAINER_TABS } from '../../../src/lib/nav';
import { PART_TH, type Exercise } from '../../../src/lib/me';
import { TC_COLS, tcName, type TC } from '../../../src/lib/trainer';
import { Btn, Card, Chips, ConfirmBtn, DateField, Empty, Field, H, Header, Label, Notice, Screen, Txt } from '../../../src/ui';
import { ExercisePicker } from '../../../src/ui/ExercisePicker';
import { exName } from '../../../src/lib/exercise';
import { loadTemplates, ProgramEditor, rowsOf, saveProgram, type Template } from '../../../src/ui/ProgramEditor';
import { TabBar } from '../../../src/ui/TabBar';
import { C, R } from '../../../src/lib/theme';

type View_ = 'programs' | 'moves';

/** Trainer's library: saved programs (to hand to any trainee) and the exercise list (plus their own moves) */
export default function Library() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<View_>('programs');
  const [tpls, setTpls] = useState<Template[] | null>(null);
  const [edit, setEdit] = useState<Template | 'new' | null>(null);
  const [assign, setAssign] = useState<Template | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => { if (profile) setTpls(await loadTemplates(profile.id)); }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const done = (t?: string, ok = true) => { setEdit(null); setAssign(null); if (t) { setMsg({ t, ok }); load(); } };

  async function del(t: Template) {
    const { error } = await supabase.from('programs').delete().eq('id', t.id);
    done(error ? thError(error) : `ลบ "${t.name}" แล้ว`, !error);
  }

  return (
    <Screen footer={<TabBar tabs={TRAINER_TABS} active="library" />}>
      <Header title="คลังท่า" sub="โปรแกรมที่เก็บไว้ และท่าออกกำลัง" />
      <Chips options={[{ v: 'programs', t: 'โปรแกรมของฉัน' }, { v: 'moves', t: 'ท่าทั้งหมด' }]} value={tab} onChange={setTab} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {tab === 'programs' ? <>
        {edit ? <ProgramEditor title={edit === 'new' ? 'สร้างโปรแกรม' : 'แก้โปรแกรม'} editId={edit === 'new' ? undefined : edit.id}
          initial={edit === 'new' ? undefined : { name: edit.name, rows: rowsOf(edit) }} onDone={done} />
          : <Btn icon="plus" label="สร้างโปรแกรม" onPress={() => setEdit('new')} />}
        {assign ? <Assign t={assign} onDone={done} /> : null}
        {tpls === null ? <Txt muted>กำลังโหลด…</Txt> : !tpls.length ? (
          <Card><Empty ic="list" title="ยังไม่มีโปรแกรม" text="สร้างโปรแกรมที่ใช้บ่อย เช่น Push / Pull / Legs เก็บไว้ แล้วมอบหมายให้ลูกเทรนคนไหนก็ได้ในไม่กี่แตะ" /></Card>
        ) : tpls.map(t => {
          const rows = rowsOf(t);
          return (
            <Card key={t.id} style={{ gap: 6 }}>
              <H size={17}>{t.name}</H>
              <Txt muted size={13}>{rows.length} ท่า · {[...new Set(rows.map(r => PART_TH[r.ex.body_part]))].join(' · ')}</Txt>
              {rows.slice(0, 6).map((r, i) => (
                <Txt key={i} size={14}>{i + 1}. {exName(r.ex)} <Txt muted size={14}>{[r.sets && `${r.sets} เซต`, r.reps && `${r.reps} ครั้ง`, r.kg && `${r.kg} kg`].filter(Boolean).join(' × ')}</Txt></Txt>
              ))}
              {rows.length > 6 ? <Txt muted size={13}>และอีก {rows.length - 6} ท่า</Txt> : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Btn label="มอบหมายให้ลูกเทรน" onPress={() => { setEdit(null); setAssign(t); }} style={{ flex: 1 }} />
                <Btn kind="ghost" icon="pencil" label="แก้" onPress={() => { setAssign(null); setEdit(t); }} />
              </View>
              <ConfirmBtn label="ลบโปรแกรมนี้" onConfirm={() => del(t)} />
            </Card>
          );
        })}
      </> : <Moves />}
    </Screen>
  );
}

/** Give a saved program to one or more trainees for a day (each gets their own copy to log against) */
function Assign({ t, onDone }: { t: Template; onDone: (msg?: string, ok?: boolean) => void }) {
  const { profile } = useAuth();
  const [tcs, setTcs] = useState<TC[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [day, setDay] = useState(addDays(todayISO(), 1));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    if (profile) supabase.from('trainer_clients').select(TC_COLS).eq('trainer_id', profile.id).eq('status', 'active').order('created_at', { ascending: false })
      .then(({ data }) => setTcs(((data as any) ?? []) as TC[]));
  }, [profile]));

  async function go() {
    if (!picked.length) { setErr('เลือกลูกเทรนอย่างน้อย 1 คน'); return; }
    setBusy(true);
    for (const id of picked) {
      const e = await saveProgram({ ownerId: profile!.id, name: t.name, rows: rowsOf(t), tcId: id, day });
      if (e) { setBusy(false); setErr(thError(e)); return; }
    }
    setBusy(false);
    onDone(`มอบหมาย "${t.name}" ให้ ${picked.length} คนแล้ว · เห็นที่แท็บ ออกกำลัง ของลูกเทรน`);
  }

  return (
    <Card>
      <H size={17}>มอบหมาย "{t.name}"</H>
      {err ? <Notice text={err} /> : null}
      <DateField label="สำหรับวันที่" value={day} onChange={setDay} min={todayISO()} hint="ถ้ามีนัดวันนั้น โปรแกรมจะผูกกับนัดให้เอง" />
      <Txt bold size={14}>ให้ใคร</Txt>
      {tcs === null ? <Txt muted>กำลังโหลด…</Txt> : !tcs.length ? <Txt muted>ยังไม่มีลูกเทรน</Txt> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tcs.map(tc => {
            const on = picked.includes(tc.id);
            return (
              <Pressable key={tc.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setPicked(on ? picked.filter(x => x !== tc.id) : [...picked, tc.id])}
                style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: R.pill, justifyContent: 'center', borderWidth: 1.5,
                  borderColor: on ? C.accent : 'transparent', backgroundColor: on ? C.accentSoft : C.surface2 }}>
                <Txt bold={on} style={{ color: on ? C.accent : C.fg }}>{on ? '✓ ' : ''}{tcName(tc)}</Txt>
              </Pressable>
            );
          })}
        </View>
      )}
      <Btn label={`มอบหมาย${picked.length ? ` (${picked.length} คน)` : ''}`} onPress={go} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}

/** The whole library to browse (moving pictures + how-to), plus the trainer's own moves */
function Moves() {
  const { profile } = useAuth();
  const [own, setOwn] = useState<(Exercise & { how_to: string | null })[]>([]);
  const [part, setPart] = useState('chest');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [how, setHow] = useState('');
  const [kind, setKind] = useState<'strength' | 'cardio' | 'stretch'>('strength');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const load = useCallback(() => {
    if (!profile) return;
    supabase.from('exercises').select('id,name_th,name_en,body_part,kind,how_to').eq('created_by', profile.id).order('name_th').then(({ data }) => setOwn((data as any) ?? []));
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    if (!name.trim()) { setMsg({ t: 'ใส่ชื่อท่า', ok: false }); return; }
    const { error } = await supabase.from('exercises').insert({ name_th: name.trim(), body_part: part, kind, how_to: how.trim() || null, created_by: profile!.id });
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    setMsg({ t: `เพิ่มท่า ${name.trim()} แล้ว`, ok: true }); setName(''); setHow(''); setAdding(false); load(); setReload(reload + 1);
  }
  async function del(id: string) {
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    setMsg(error ? { t: 'ลบไม่ได้ ท่านี้อยู่ในโปรแกรมหรือบันทึกแล้ว', ok: false } : { t: 'ลบแล้ว', ok: true });
    load(); setReload(reload + 1);
  }

  return <>
    {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
    <Card>
      <ExercisePicker ownerId={profile?.id} reloadKey={reload} />
    </Card>

    <Label>ท่าของฉัน</Label>
    {adding ? (
      <Card>
        <H size={17}>เพิ่มท่าของฉัน</H>
        <Field label="ชื่อท่า" value={name} onChangeText={setName} placeholder="เช่น บัลแกเรียนสปลิตสควอท" />
        <Chips label="ส่วน" options={Object.keys(PART_TH).map(k => ({ v: k, t: PART_TH[k] }))} value={part} onChange={setPart} />
        <Chips label="ประเภท" options={[{ v: 'strength', t: 'เวท' }, { v: 'cardio', t: 'คาร์ดิโอ' }, { v: 'stretch', t: 'ยืด' }]} value={kind} onChange={setKind} />
        <Field label="วิธีเล่น (ไม่บังคับ)" value={how} onChangeText={setHow} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
        <Btn label="เพิ่มท่า" onPress={add} />
        <Btn kind="ghost" label="ยกเลิก" onPress={() => setAdding(false)} />
      </Card>
    ) : <Btn kind="ghost" icon="plus" label="เพิ่มท่าของฉัน" onPress={() => setAdding(true)} />}
    {own.length ? (
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {own.map(e => (
          <View key={e.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, gap: 4 }}>
            <Txt bold>{e.name_th} <Txt muted size={13}>· {PART_TH[e.body_part] ?? e.body_part}</Txt></Txt>
            {e.how_to ? <Txt muted size={13}>{e.how_to}</Txt> : null}
            <ConfirmBtn label="ลบท่านี้" onConfirm={() => del(e.id)} />
          </View>
        ))}
      </Card>
    ) : null}
  </>;
}
