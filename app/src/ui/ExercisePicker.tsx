import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { C, R } from '../lib/theme';
import { EQUIP_TH, exName, exSub, LEVEL_TH, LIB_COLS, loadLibrary, mediaUri, MUSCLE_TH, searchLib, type LibEx } from '../lib/exercise';
import { Btn, Chips, Field, Notice, Txt } from './index';
import { thError } from '../lib/supabase';
import { Icon } from './Icon';
import { ScrollBox } from './ScrollBox';

const PAGE = 30;
const ROW_H = 73;   // one row (56 px picture + padding); the box shows 6, the rest scroll inside it
// muscle chips in the order people think: upper body, core, legs
const MUSCLE_ORDER = ['chest', 'shoulders', 'lats', 'middle back', 'lower back', 'traps', 'biceps', 'triceps', 'forearms', 'abdominals',
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck'];
// a muscle's body part (own moves are saved with both, so they show under the right filters)
const PART_OF: Record<string, string> = { chest: 'chest', shoulders: 'shoulders', neck: 'shoulders', lats: 'back', 'middle back': 'back', 'lower back': 'back', traps: 'back',
  biceps: 'arms', triceps: 'arms', forearms: 'arms', abdominals: 'core', quadriceps: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', adductors: 'legs', abductors: 'legs' };
type Cat = 'weight' | 'cardio' | 'stretch';
const CATS: { k: Cat; t: string; icon: any }[] = [
  { k: 'weight', t: 'เวทเทรนนิ่ง', icon: 'dumbbell' },
  { k: 'cardio', t: 'คาร์ดิโอ', icon: 'activity' },
  { k: 'stretch', t: 'ยืดเหยียด', icon: 'repeat' },
];
const isWeight = (e: LibEx) => e.kind === 'strength' && e.body_part !== 'stretch' && e.body_part !== 'cardio';

/**
 * Find a move in the library: type an English or Thai name, or pick a type (weights → then a muscle, cardio, stretching).
 * Each row shows the moving picture; tap it for how-to, + to add. "+ ท่าของฉัน" makes a move that isn't in the library.
 */
export function ExercisePicker({ onPick, picked = [], ownerId, reloadKey }: { onPick?: (e: LibEx) => void; picked?: string[]; ownerId?: string; reloadKey?: number }) {
  const [lib, setLib] = useState<LibEx[] | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('weight');
  const [muscle, setMuscle] = useState<string>('all');
  const [n, setN] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [mine, setMine] = useState(0);
  useEffect(() => { loadLibrary(!!reloadKey || mine > 0).then(setLib); }, [reloadKey, mine]);
  useEffect(() => { setN(PAGE); }, [q, cat, muscle]);

  const shown = useMemo(() => {
    if (!lib) return [];
    let l = searchLib(lib, q);
    if (!q.trim()) {
      if (cat === 'weight') l = l.filter(e => isWeight(e) && (muscle === 'all' || e.muscle === muscle));
      else l = l.filter(e => e.body_part === cat);
    }
    // own moves first, then easier, pictured moves
    const rank = (e: LibEx) => (ownerId && e.created_by === ownerId ? -1 : 0) + (e.media_url ? 0 : 2) + (e.level === 'expert' ? 1 : 0);
    return [...l].sort((a, b) => rank(a) - rank(b));
  }, [lib, q, cat, muscle, ownerId]);

  const chip = (key: string, label: string, on: boolean, press: () => void) => (
    <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={press}
      style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, justifyContent: 'center',
        borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface }}>
      <Txt size={14} bold={on} style={on ? { color: C.accent } : undefined}>{label}</Txt>
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }}>
      <Field label="ค้นหาท่า" icon="search" value={q} onChangeText={setQ} placeholder="เช่น squat, bench, ดัมเบล, แพลงก์" autoCorrect={false} />
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
        {CATS.map(c => {
          const on = !q.trim() && cat === c.k;
          return (
            <Pressable key={c.k} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { setQ(''); setCat(c.k); setMuscle('all'); }}
              style={({ pressed }) => ({ flex: 1, minHeight: 64, borderRadius: R.field, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4,
                borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface, opacity: pressed ? 0.8 : 1 })}>
              <Icon name={c.icon} size={20} color={on ? C.accent : C.muted} />
              <Txt size={13.5} bold={on} numberOfLines={1} style={{ color: on ? C.accent : C.fg }}>{c.t}</Txt>
            </Pressable>
          );
        })}
      </View>
      {!q.trim() && cat === 'weight' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {chip('all', 'ทั้งหมด', muscle === 'all', () => setMuscle('all'))}
          {MUSCLE_ORDER.map(m => chip(m, MUSCLE_TH[m], muscle === m, () => setMuscle(m)))}
        </ScrollView>
      ) : null}
      {ownerId ? (making
        ? <OwnMove ownerId={ownerId} cat={cat} muscle={muscle} add={!!onPick} onCancel={() => setMaking(false)}
            onMade={e => { setMaking(false); setMine(mine + 1); setQ(''); onPick?.(e); }} />
        : <Pressable accessibilityRole="button" onPress={() => setMaking(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36 }}>
            <Icon name="plus" size={18} color={C.accent} /><Txt bold size={14} style={{ color: C.accent }}>ท่าของฉัน</Txt>
            <Txt muted size={13}>· ไม่มีในคลัง สร้างเองได้</Txt>
          </Pressable>) : null}

      {lib === null ? <Txt muted>กำลังโหลดคลังท่า…</Txt> : null}
      {lib && !shown.length ? <Txt muted>ไม่เจอท่า ลองคำอื่น หรือกด + ท่าของฉัน</Txt> : null}
      {lib ? <Txt muted size={12.5}>{shown.length.toLocaleString('en-US')} ท่า{q.trim() ? ` ที่ตรงกับ "${q.trim()}"` : ''}{shown.length > 6 ? ' · เลื่อนในกรอบเพื่อดูเพิ่ม' : ''}</Txt> : null}

      <View style={{ borderRadius: R.field, backgroundColor: C.surface2, overflow: 'hidden' }}>
       <ScrollBox maxHeight={ROW_H * 6} onNearEnd={() => { if (shown.length > n) setN(n + PAGE); }}>
        {shown.slice(0, n).map((e, i) => {
          const on = picked.includes(e.id);
          return (
            <View key={e.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, height: ROW_H - 1 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`ดูวิธีเล่น ${exName(e)}`} onPress={() => setOpen(open === e.id ? null : e.id)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Thumb e={e} size={56} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt bold size={15} numberOfLines={1}>{exName(e)}</Txt>
                    <Txt muted size={12.5} numberOfLines={1}>{[exSub(e), e.muscle && MUSCLE_TH[e.muscle], e.equipment && EQUIP_TH[e.equipment]].filter(Boolean).join(' · ')}</Txt>
                  </View>
                </Pressable>
                {onPick ? <Pressable accessibilityRole="button" accessibilityLabel={`เพิ่ม ${exName(e)}`} onPress={() => onPick(e)} hitSlop={6}
                  style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: on ? C.accentSoft : C.brand, opacity: pressed ? 0.7 : 1 })}>
                  <Icon name={on ? 'check' : 'plus'} size={20} color={on ? C.accent : C.brandInk} />
                </Pressable> : <Icon name={open === e.id ? 'chevron-down' : 'chevron-right'} size={18} color={C.muted} />}
              </View>
              {open === e.id ? <View style={{ paddingHorizontal: 10, paddingBottom: 12 }}><ExerciseInfo id={e.id} e={e} /></View> : null}
            </View>
          );
        })}
       </ScrollBox>
      </View>
    </View>
  );
}

export function Thumb({ e, size }: { e: { media_url?: string | null; name_th: string; name_en?: string | null }; size: number }) {
  const uri = mediaUri(e.media_url);
  return uri ? (
    <Image source={{ uri }} accessibilityLabel={`ภาพท่า ${exName(e)}`} resizeMode="cover"
      style={{ width: size, height: size, borderRadius: 10, backgroundColor: C.surface }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="dumbbell" size={Math.round(size / 2.6)} color={C.muted} />
    </View>
  );
}

type Detail = { how_to: string | null; how_to_th: string | null; how_to_en: string | null; muscles2: string[] | null; level: string | null; equipment: string | null; muscle: string | null; media_url: string | null; name_th: string; name_en: string | null };

/** Big moving picture + step-by-step how-to (Thai, with the English original one tap away) */
export function ExerciseInfo({ id, e }: { id: string; e?: Partial<LibEx> }) {
  const [d, setD] = useState<Detail | null>(null);
  const [en, setEn] = useState(false);
  useEffect(() => {
    supabase.from('exercises').select('how_to,how_to_th,how_to_en,muscles2,level,equipment,muscle,media_url,name_th,name_en').eq('id', id).maybeSingle()
      .then(({ data }) => setD(data as Detail));
  }, [id]);
  const x = { ...(e ?? {}), ...(d ?? {}) } as Detail;
  const uri = mediaUri(x.media_url);
  const th = x.how_to_th || x.how_to;
  const steps = (en ? x.how_to_en : th || x.how_to_en)?.split('\n').filter(Boolean) ?? [];
  const tags = [x.muscle && `กล้ามหลัก: ${MUSCLE_TH[x.muscle] ?? x.muscle}`, x.muscles2?.length ? `เสริม: ${x.muscles2.map(m => MUSCLE_TH[m] ?? m).join(', ')}` : '',
    x.equipment && `อุปกรณ์: ${EQUIP_TH[x.equipment] ?? x.equipment}`, x.level && `ระดับ: ${LEVEL_TH[x.level] ?? x.level}`].filter(Boolean);
  return (
    <View style={{ gap: 10 }}>
      {uri ? <Image source={{ uri }} accessibilityLabel={`ภาพเคลื่อนไหวท่า ${x.name_en || x.name_th || ''}`} resizeMode="contain"
        style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: R.field, backgroundColor: '#FFFFFF' }} /> : null}
      {tags.length ? <Txt muted size={13}>{tags.join(' · ')}</Txt> : null}
      {!d ? <Txt muted size={13}>กำลังโหลดวิธีเล่น…</Txt> : steps.length ? (
        <View style={{ gap: 6 }}>
          {steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Txt bold size={14} style={{ width: 20, color: C.accent }}>{i + 1}.</Txt>
              <Txt size={14} style={{ flex: 1 }}>{s}</Txt>
            </View>
          ))}
        </View>
      ) : <Txt muted size={13}>ยังไม่มีวิธีเล่น</Txt>}
      {d && x.how_to_en ? (
        <Txt size={13} style={{ color: C.accent }} onPress={() => setEn(!en)} accessibilityRole="button">
          {en ? 'ดูภาษาไทย' : th ? 'Show in English' : 'กำลังแปลเป็นภาษาไทย · ตอนนี้แสดงภาษาอังกฤษ'}
        </Txt>
      ) : null}
    </View>
  );
}

/** Make a move that isn't in the library: name, type, the muscle for weights, how-to. It is added straight away. */
function OwnMove({ ownerId, cat, muscle, add, onMade, onCancel }: { ownerId: string; cat: Cat; muscle: string; add: boolean; onMade: (e: LibEx) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Cat>(cat);
  const [m, setM] = useState(muscle === 'all' ? 'chest' : muscle);
  const [how, setHow] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    if (!name.trim()) { setErr('ใส่ชื่อท่า'); return; }
    setBusy(true); setErr('');
    const row = kind === 'weight'
      ? { kind: 'strength', body_part: PART_OF[m] ?? 'chest', muscle: m }
      : { kind, body_part: kind, muscle: null };
    const { data, error } = await supabase.from('exercises').insert({ name_th: name.trim(), how_to: how.trim() || null, created_by: ownerId, ...row }).select(LIB_COLS).single();
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onMade(data as any);
  }
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: R.field, borderWidth: 1.5, borderColor: C.accent }}>
      <Txt bold>ท่าของฉัน</Txt>
      {err ? <Notice text={err} /> : null}
      <Field label="ชื่อท่า" value={name} onChangeText={setName} placeholder="เช่น บัลแกเรียนสปลิตสควอท" />
      <Chips label="ประเภท" options={CATS.map(c => ({ v: c.k, t: c.t }))} value={kind} onChange={v => setKind(v as Cat)} />
      {kind === 'weight' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {MUSCLE_ORDER.map(k => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: m === k }} onPress={() => setM(k)}
              style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, justifyContent: 'center', borderColor: m === k ? C.accent : C.line, backgroundColor: m === k ? C.accentSoft : C.surface }}>
              <Txt size={14} bold={m === k} style={m === k ? { color: C.accent } : undefined}>{MUSCLE_TH[k]}</Txt>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <Field label="วิธีเล่น (ไม่บังคับ)" value={how} onChangeText={setHow} multiline style={{ minHeight: 64, textAlignVertical: 'top' } as any} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn kind="ghost" label="ยกเลิก" onPress={onCancel} style={{ flex: 1 }} />
        <Btn label={add ? "สร้างแล้วเพิ่ม" : "สร้างท่า"} onPress={save} loading={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
