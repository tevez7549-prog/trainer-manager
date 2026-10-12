import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { supabase, thError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { getJSON, setJSON } from '../lib/store';
import { exName, loadLibrary, MUSCLE_TH, type LibEx } from '../lib/exercise';
import {
  build, DEFAULT_FILTERS, EQUIP, GOALS, LEVELS, moveCount, moveMinutes, PARTS, poolSizes, swap, totalMinutes,
  type EquipKey, type Filters, type PartKey, type Pick,
} from '../lib/random';
import { saveProgram } from './ProgramEditor';
import { C, R } from '../lib/theme';
import { Btn, Card, Chips, H, Notice, Toggle, Txt } from './index';
import { Icon } from './Icon';
import { ExerciseInfo, Thumb } from './ExercisePicker';

const KEY = 'tm-random-filters';
const COUNTS = [3, 4, 5, 6, 8];
const TIMES = [15, 30, 45, 60, 90];

/** Multi-select chips */
function Multi<T extends string>({ label, options, value, onChange }: { label: string; options: { v: T; t: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt bold size={14}>{label}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(o => {
          const on = value.includes(o.v);
          return (
            <Pressable key={o.v} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onChange(on ? value.filter(x => x !== o.v) : [...value, o.v])}
              style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
                borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface }}>
              {on ? <Icon name="check" size={16} color={C.accent} /> : null}
              <Txt size={15} bold={on} style={on ? { color: C.accent } : undefined}>{o.t}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export type StartRow = { ex: LibEx; sets: number; reps: string };

/**
 * Random workout: choose parts, number of moves or minutes, level, goal and equipment, then draw.
 * Lock the moves you like, swap single ones, draw again; start right away or keep it as a program.
 */
export function RandomWorkout({ onStart, onClose, onSaved }: { onStart: (title: string, rows: StartRow[]) => void; onClose: () => void; onSaved: (msg: string) => void }) {
  const { profile } = useAuth();
  const [lib, setLib] = useState<LibEx[] | null>(null);
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [recent, setRecent] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadLibrary().then(setLib);
    getJSON<Filters>(KEY).then(v => { if (v) setF({ ...DEFAULT_FILTERS, ...v }); });
    if (profile) {
      // moves from the last 3 sessions: "fresh" avoids repeating them
      supabase.from('workouts').select('sets:workout_sets(exercise_id)').eq('user_id', profile.id).order('started_at', { ascending: false }).limit(3)
        .then(({ data }) => setRecent(new Set(((data as any[]) ?? []).flatMap(w => w.sets.map((s: any) => s.exercise_id)).filter(Boolean))));
    }
  }, [profile]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => { const n = { ...f, [k]: v }; setF(n); setJSON(KEY, n); };
  const togglePart = (v: PartKey[]) => {
    // "ทั้งตัว" and single parts don't mix: picking one clears the other
    const added = v.find(x => !f.parts.includes(x));
    set('parts', added === 'full' ? ['full'] : v.filter(x => x !== 'full').length ? v.filter(x => x !== 'full') : ['full']);
  };

  function draw(keep: Pick[] = []) {
    if (!lib) return;
    if (!f.equip.length) { setErr('เลือกอุปกรณ์อย่างน้อย 1 อย่าง'); return; }
    const empty = poolSizes(lib, f).filter(p => p.n === 0);
    const out = build(lib, f, recent, keep);
    setErr(empty.length ? `ไม่มีท่า${empty.map(p => PARTS.find(x => x.k === p.k)?.t).join(', ')}ที่ตรงกับอุปกรณ์และระดับที่เลือก ลองเพิ่มอุปกรณ์หรือเพิ่มระดับ` : '');
    setPicks(out); setOpen(null);
  }
  const toggleLock = (i: number) => setPicks(picks!.map((p, j) => (j === i ? { ...p, locked: !p.locked } : p)));
  const remove = (i: number) => setPicks(picks!.filter((_, j) => j !== i));
  const title = () => {
    const ps = f.parts.includes('full') ? 'ทั้งตัว' : f.parts.map(p => PARTS.find(x => x.k === p)?.t).join(' + ');
    return `สุ่ม: ${ps}`;
  };

  async function keep() {
    if (!picks?.length || !profile) return;
    setBusy(true);
    const e = await saveProgram({ ownerId: profile.id, name: title(), template: true,
      rows: picks.map(p => ({ ex: p.ex, sets: String(p.sets), reps: p.reps, kg: '' })) });
    setBusy(false);
    if (e) { setErr(thError(e)); return; }
    onSaved(`เก็บ "${title()}" ไว้ใน โปรแกรมของฉัน แล้ว`);
  }

  const n = moveCount(f);
  const est = picks ? totalMinutes(picks, f.goal) : Math.round(n * moveMinutes(f.goal) + (f.warmup ? 5 : 0) + (f.stretch ? 5 : 0));
  const roleTh = { warmup: 'วอร์มอัพ', main: '', stretch: 'ยืดเหยียด' } as const;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <H size={17} style={{ flex: 1 }}>สุ่มโปรแกรม</H>
        <Pressable accessibilityRole="button" accessibilityLabel="ปิด" onPress={onClose} hitSlop={8}><Icon name="x" size={20} color={C.muted} /></Pressable>
      </View>
      {err ? <Notice text={err} kind="warn" /> : null}

      <Multi label="เล่นส่วนไหน (เลือกได้หลายส่วน)" options={PARTS.map(p => ({ v: p.k, t: p.t }))} value={f.parts} onChange={togglePart} />
      <Chips label="จำนวนท่า" options={[{ v: 0, t: 'ตามเวลา' }, ...COUNTS.map(c => ({ v: c, t: `${c} ท่า` }))]} value={f.count ?? 0} onChange={v => set('count', v || null)} />
      {!f.count ? <Chips label="มีเวลากี่นาที" options={TIMES.map(t => ({ v: t, t: `${t} นาที` }))} value={f.minutes} onChange={v => set('minutes', v)} /> : null}
      <Chips label="ระดับ" options={LEVELS.map(l => ({ v: l.k, t: l.t }))} value={f.level} onChange={v => set('level', v)} />
      <Chips label="เป้าหมาย" options={GOALS.map(g => ({ v: g.k, t: g.t }))} value={f.goal} onChange={v => set('goal', v)} />
      <Txt muted size={12.5} style={{ marginTop: -6 }}>{GOALS.find(g => g.k === f.goal)?.why}</Txt>
      <Multi label="อุปกรณ์ที่มี" options={EQUIP.map(e => ({ v: e.k, t: e.t }))} value={f.equip} onChange={(v: EquipKey[]) => set('equip', v)} />
      <Toggle label="วอร์มอัพ 5 นาที" value={f.warmup} onChange={v => set('warmup', v)} />
      <Toggle label="ยืดเหยียดตอนจบ" value={f.stretch} onChange={v => set('stretch', v)} />
      <Toggle label="ไม่ซ้ำท่าที่เพิ่งเล่น" value={f.fresh} onChange={v => set('fresh', v)} hint="เลี่ยงท่าจาก 3 ครั้งล่าสุด" />

      <View style={{ padding: 12, borderRadius: R.field, backgroundColor: C.surface2 }}>
        <Txt bold>{picks ? `${picks.filter(p => p.role === 'main').length} ท่าหลัก` : `${n} ท่าหลัก`} · ประมาณ {est} นาที</Txt>
        {lib === null ? <Txt muted size={13}>กำลังโหลดคลังท่า…</Txt> : null}
      </View>
      <Btn icon="repeat" label={picks ? 'สุ่มใหม่ (ท่าที่ล็อกไว้อยู่เหมือนเดิม)' : 'สุ่มเลย'} onPress={() => draw(picks ?? [])} disabled={!lib} />

      {picks?.map((p, i) => (
        <View key={p.ex.id + i} style={{ borderRadius: R.field, backgroundColor: C.surface2, padding: 10, gap: 8, borderWidth: p.locked ? 1.5 : 0, borderColor: C.accent }}>
          {/* name gets the full width; the three actions sit under it so nothing is squeezed on small phones */}
          <Pressable accessibilityRole="button" accessibilityLabel={`วิธีเล่น ${exName(p.ex)}`} onPress={() => setOpen(open === i ? null : i)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Thumb e={p.ex} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt bold numberOfLines={2}>{exName(p.ex)}</Txt>
              <Txt muted size={12.5} numberOfLines={2}>
                {p.role === 'main' ? (p.ex.kind === 'strength' ? `${p.sets} เซต × ${p.reps} ครั้ง · พัก ${p.rest} วิ` : `${p.reps} นาที`) : `${roleTh[p.role]} · ${p.reps} นาที`}
                {p.ex.muscle ? ` · ${MUSCLE_TH[p.ex.muscle] ?? p.ex.muscle}` : ''}
              </Txt>
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: -4 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={p.locked ? 'ปลดล็อก' : 'ล็อกท่านี้ไว้'} onPress={() => toggleLock(i)} hitSlop={4}
              style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: p.locked ? C.accentSoft : 'transparent' }}>
              <Icon name={p.locked ? 'check' : 'star'} size={16} color={p.locked ? C.accent : C.muted} />
              <Txt size={13} style={{ color: p.locked ? C.accent : C.muted }}>{p.locked ? 'ล็อกแล้ว' : 'ล็อก'}</Txt>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="เปลี่ยนท่านี้" onPress={() => lib && setPicks(swap(lib, picks!, i, f, recent))} hitSlop={4}
              style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="refresh-cw" size={16} color={C.fg} />
              <Txt size={13}>เปลี่ยน</Txt>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="เอาท่านี้ออก" onPress={() => remove(i)} hitSlop={4}
              style={{ minHeight: 36, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={18} color={C.muted} />
            </Pressable>
          </View>
          {open === i ? <ExerciseInfo id={p.ex.id} e={p.ex} /> : null}
        </View>
      ))}
      {picks?.length ? <>
        <Txt muted size={12.5}>ดาว = ล็อกท่าที่ชอบไว้ตอนสุ่มใหม่ · ลูกศรวน = เปลี่ยนเฉพาะท่านั้น · แตะชื่อท่าเพื่อดูวิธีเล่น</Txt>
        <Btn icon="dumbbell" label="เริ่มเล่นเลย" onPress={() => onStart(title(), picks.map(p => ({ ex: p.ex, sets: p.sets, reps: p.reps })))} />
        <Btn kind="ghost" icon="star" label="เก็บไว้เป็นโปรแกรมของฉัน" onPress={keep} loading={busy} />
      </> : null}
    </Card>
  );
}
