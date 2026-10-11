import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { supabase, thError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { addDays, todayISO } from '../lib/gym';
import { PART_TH, type Exercise } from '../lib/me';
import { C, R } from '../lib/theme';
import { Btn, Card, Chips, DateField, Field, H, Notice, Txt } from './index';
import { Icon } from './Icon';

export type ProgRow = { ex: Exercise; sets: string; reps: string; kg: string };
export type Template = { id: string; name: string; items: { position: number; sets: number | null; reps: number | null; weight_kg: number | null; exercise: Exercise | null }[] };

export const TEMPLATE_COLS = 'id,name,items:program_exercises(position,sets,reps,weight_kg,exercise:exercises(id,name_th,name_en,body_part,kind))';
export const rowsOf = (t: Template): ProgRow[] => [...t.items].sort((a, b) => a.position - b.position).filter(i => i.exercise)
  .map(i => ({ ex: i.exercise!, sets: i.sets ? String(i.sets) : '', reps: i.reps ? String(i.reps) : '', kg: i.weight_kg ? String(i.weight_kg) : '' }));

export async function loadTemplates(ownerId: string): Promise<Template[]> {
  const { data } = await supabase.from('programs').select(TEMPLATE_COLS).eq('owner_id', ownerId).eq('is_template', true).order('created_at', { ascending: false });
  return ((data as any) ?? []) as Template[];
}

/** Write a program and its exercises. A plan for a trainee also gets attached to their session that day. */
export async function saveProgram(o: { ownerId: string; name: string; rows: ProgRow[]; template?: boolean; editId?: string; tcId?: string; day?: string }) {
  let id = o.editId;
  if (id) {
    const u = await supabase.from('programs').update({ name: o.name }).eq('id', id);
    if (u.error) return u.error;
    const d = await supabase.from('program_exercises').delete().eq('program_id', id);
    if (d.error) return d.error;
  } else {
    const p = await supabase.from('programs').insert({ owner_id: o.ownerId, name: o.name, is_template: !!o.template, trainer_client_id: o.tcId ?? null, planned_for: o.day || null }).select('id').single();
    if (p.error) return p.error;
    id = p.data.id;
  }
  const { error } = await supabase.from('program_exercises').insert(o.rows.map((r, i) => ({
    program_id: id, position: i + 1, exercise_id: r.ex.id, sets: r.sets ? Number(r.sets) : null, reps: r.reps ? Number(r.reps) : null, weight_kg: r.kg ? Number(r.kg) : null,
  })));
  if (error) return error;
  if (o.tcId && o.day) {
    const s = new Date(o.day + 'T00:00:00'), e = new Date(s); e.setDate(e.getDate() + 1);
    await supabase.from('appointments').update({ program_id: id }).eq('trainer_client_id', o.tcId).eq('status', 'scheduled')
      .gte('starts_at', s.toISOString()).lt('starts_at', e.toISOString());
  }
  return null;
}

/**
 * Build a program: pick exercises by body part, set sets × reps × kg.
 * template: kept in the trainer's library. tcId: sent to that trainee for a day (optionally starting from a saved template).
 */
export function ProgramEditor({ title, initial, editId, tcId, onDone }: {
  title: string; initial?: { name: string; rows: ProgRow[] }; editId?: string; tcId?: string; onDone: (msg?: string) => void;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState(initial?.name ?? '');
  const [rows, setRows] = useState<ProgRow[]>(initial?.rows ?? []);
  const [day, setDay] = useState(addDays(todayISO(), 1));
  const [lib, setLib] = useState<Exercise[]>([]);
  const [tpls, setTpls] = useState<Template[]>([]);
  const [part, setPart] = useState('chest');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('exercises').select('id,name_th,name_en,body_part,kind').order('name_th').then(({ data }) => setLib((data as Exercise[]) ?? []));
    if (tcId && profile) loadTemplates(profile.id).then(setTpls);
  }, [tcId, profile]);
  const shown = useMemo(() => lib.filter(e => e.body_part === part), [lib, part]);
  const set = (i: number, k: 'sets' | 'reps' | 'kg', v: string) => setRows(rows.map((r, a) => a === i ? { ...r, [k]: v.replace(/[^\d.]/g, '') } : r));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= rows.length) return; const n = [...rows]; [n[i], n[j]] = [n[j], n[i]]; setRows(n); };

  async function save() {
    if (!rows.length) { setErr('เพิ่มอย่างน้อย 1 ท่า'); return; }
    setBusy(true);
    const nm = name.trim() || [...new Set(rows.map(r => PART_TH[r.ex.body_part]))].join(' + ');
    const e = await saveProgram({ ownerId: profile!.id, name: nm, rows, template: !tcId, editId, tcId, day: tcId ? day : undefined });
    setBusy(false);
    if (e) { setErr(thError(e)); return; }
    onDone(tcId ? `ส่งโปรแกรม "${nm}" ให้แล้ว · ลูกเทรนเห็นที่แท็บ ออกกำลัง` : editId ? `บันทึก "${nm}" แล้ว` : `เก็บโปรแกรม "${nm}" ไว้ในคลังแล้ว`);
  }

  return (
    <Card>
      <H size={17}>{title}</H>
      {err ? <Notice text={err} /> : null}
      {tcId && tpls.length ? (
        <Chips label="เริ่มจากโปรแกรมที่เก็บไว้" options={tpls.map(t => ({ v: t.id, t: t.name }))} value={null}
          onChange={id => { const t = tpls.find(x => x.id === id)!; setName(t.name); setRows(rowsOf(t)); }} />
      ) : null}
      <Field label="ชื่อโปรแกรม" value={name} onChangeText={setName} placeholder="เช่น ขา + ก้น (Lower A)" />
      {tcId ? <DateField label="สำหรับวันที่" value={day} onChange={setDay} min={todayISO()} hint="ถ้ามีนัดวันนั้น โปรแกรมจะผูกกับนัดให้เอง" /> : null}
      {rows.map((r, i) => (
        <View key={r.ex.id + i} style={{ gap: 6, padding: 12, borderRadius: R.field, backgroundColor: C.surface2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Txt bold style={{ flex: 1 }}>{i + 1}. {r.ex.name_th}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel="เลื่อนขึ้น" onPress={() => move(i, -1)} hitSlop={6} style={{ padding: 6, transform: [{ rotate: '180deg' }] }}><Icon name="chevron-down" size={18} color={C.muted} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="เลื่อนลง" onPress={() => move(i, 1)} hitSlop={6} style={{ padding: 6 }}><Icon name="chevron-down" size={18} color={C.muted} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`เอา ${r.ex.name_th} ออก`} onPress={() => setRows(rows.filter((_, a) => a !== i))} hitSlop={6} style={{ padding: 6 }}><Icon name="x" size={18} color={C.muted} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="เซต" value={r.sets} onChangeText={v => set(i, 'sets', v)} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label={r.ex.kind === 'strength' ? 'ครั้ง' : 'นาที'} value={r.reps} onChangeText={v => set(i, 'reps', v)} keyboardType="number-pad" /></View>
            {r.ex.kind === 'strength' ? <View style={{ flex: 1 }}><Field label="kg" value={r.kg} onChangeText={v => set(i, 'kg', v)} keyboardType="decimal-pad" /></View> : null}
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
      <Btn label={tcId ? 'ส่งโปรแกรม' : 'บันทึกโปรแกรม'} onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}
