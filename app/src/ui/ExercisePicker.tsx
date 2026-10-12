import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { C, R } from '../lib/theme';
import { EQUIP_TH, exName, exSub, LEVEL_TH, loadLibrary, mediaUri, MUSCLE_TH, searchLib, type LibEx } from '../lib/exercise';
import { PART_TH } from '../lib/me';
import { Btn, Field, Select, Txt } from './index';
import { Icon } from './Icon';

const PAGE = 25;
// muscle chips in the order people think: upper body, core, legs, then cardio / stretching
const MUSCLE_ORDER = ['chest', 'shoulders', 'lats', 'middle back', 'lower back', 'traps', 'biceps', 'triceps', 'forearms', 'abdominals',
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck'];
type Filter = { k: 'all' } | { k: 'muscle'; v: string } | { k: 'part'; v: 'cardio' | 'stretch' } | { k: 'mine' };

/**
 * Find a move in the library: type an English or Thai name, or tap a muscle; filter by equipment.
 * Each row shows the moving picture; tap it for how-to, + to add.
 */
export function ExercisePicker({ onPick, picked = [], ownerId, reloadKey }: { onPick?: (e: LibEx) => void; picked?: string[]; ownerId?: string; reloadKey?: number }) {
  const [lib, setLib] = useState<LibEx[] | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>({ k: 'muscle', v: 'chest' });
  const [equip, setEquip] = useState('all');
  const [n, setN] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { loadLibrary(!!reloadKey).then(setLib); }, [reloadKey]);
  useEffect(() => { setN(PAGE); }, [q, f, equip]);

  const shown = useMemo(() => {
    if (!lib) return [];
    let l = searchLib(lib, q);
    if (!q.trim()) {
      if (f.k === 'muscle') l = l.filter(e => e.muscle === f.v && e.kind === 'strength');
      else if (f.k === 'part') l = l.filter(e => e.body_part === f.v);
      else if (f.k === 'mine') l = l.filter(e => e.created_by && e.created_by === ownerId);
    }
    if (equip !== 'all') l = l.filter(e => e.equipment === equip);
    // easier, pictured moves first
    const rank = (e: LibEx) => (e.media_url ? 0 : 2) + (e.level === 'expert' ? 1 : 0);
    return [...l].sort((a, b) => rank(a) - rank(b));
  }, [lib, q, f, equip, ownerId]);

  const chip = (key: string, label: string, on: boolean, press: () => void) => (
    <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={press}
      style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, justifyContent: 'center',
        borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface }}>
      <Txt size={14} bold={on} style={on ? { color: C.accent } : undefined}>{label}</Txt>
    </Pressable>
  );
  const isOn = (x: Filter) => !q.trim() && JSON.stringify(x) === JSON.stringify(f);

  return (
    <View style={{ gap: 10 }}>
      <Field label="ค้นหาท่า" icon="search" value={q} onChangeText={setQ} placeholder="เช่น squat, bench, ดัมเบล, แพลงก์" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
        {MUSCLE_ORDER.map(m => chip(m, MUSCLE_TH[m], isOn({ k: 'muscle', v: m }), () => { setQ(''); setF({ k: 'muscle', v: m }); }))}
        {chip('cardio', PART_TH.cardio, isOn({ k: 'part', v: 'cardio' }), () => { setQ(''); setF({ k: 'part', v: 'cardio' }); })}
        {chip('stretch', PART_TH.stretch, isOn({ k: 'part', v: 'stretch' }), () => { setQ(''); setF({ k: 'part', v: 'stretch' }); })}
        {ownerId ? chip('mine', 'ท่าของฉัน', isOn({ k: 'mine' }), () => { setQ(''); setF({ k: 'mine' }); }) : null}
        {chip('all', 'ทั้งหมด', isOn({ k: 'all' }), () => { setQ(''); setF({ k: 'all' }); })}
      </ScrollView>
      <Select label="อุปกรณ์" value={equip} onChange={setEquip}
        options={[{ v: 'all', t: 'ทุกอุปกรณ์' }, ...Object.keys(EQUIP_TH).map(k => ({ v: k, t: EQUIP_TH[k] }))]} />

      {lib === null ? <Txt muted>กำลังโหลดคลังท่า…</Txt> : null}
      {lib && !shown.length ? <Txt muted>ไม่เจอท่า ลองคำอื่น หรือเปลี่ยนอุปกรณ์</Txt> : null}
      {lib ? <Txt muted size={12.5}>{shown.length.toLocaleString('en-US')} ท่า{q.trim() ? ` ที่ตรงกับ "${q.trim()}"` : ''}</Txt> : null}

      <View style={{ borderRadius: R.field, backgroundColor: C.surface2, overflow: 'hidden' }}>
        {shown.slice(0, n).map((e, i) => {
          const on = picked.includes(e.id);
          return (
            <View key={e.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`ดูวิธีเล่น ${exName(e)}`} onPress={() => setOpen(open === e.id ? null : e.id)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Thumb e={e} size={56} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt bold size={15} numberOfLines={2}>{exName(e)}</Txt>
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
      </View>
      {shown.length > n ? <Btn kind="ghost" label={`ดูเพิ่มอีก ${Math.min(PAGE, shown.length - n)} ท่า`} onPress={() => setN(n + PAGE)} /> : null}
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
