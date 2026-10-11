import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { addDays, todayISO } from '../lib/gym';
import { agoText, nextInRotation, SPLITS, suggest, type RecentWorkout, type SplitKey } from '../lib/plan';
import { loadTemplates, type Template } from './ProgramEditor';
import { C, R } from '../lib/theme';
import { Btn, Chips, H, Txt } from './index';

type Plan =
  | { kind: 'trainer'; id: string; name: string; from: string }
  | { kind: 'done'; title: string; sets: number }
  | { kind: 'mine'; p: Template; lastDone: string | null }
  | { kind: 'suggest'; key: SplitKey; reason: string };

/**
 * Top of the member's home: what to train today.
 * 1) the trainer's program for today  2) already trained today  3) next of my own programs  4) our suggestion
 */
export function TodayWorkout({ tcIds }: { tcIds: string[] }) {
  const { profile } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [mine, setMine] = useState<Template[]>([]);
  const [other, setOther] = useState(false);
  const key = tcIds.join(',');

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const today = todayISO();
      const [w, tpls, tp] = await Promise.all([
        supabase.from('workouts').select('started_at,title,sets:workout_sets(exercise:exercises(body_part))').eq('user_id', profile.id)
          .gte('started_at', new Date(addDays(today, -14) + 'T00:00:00').toISOString()).order('started_at', { ascending: false }),
        loadTemplates(profile.id),
        tcIds.length ? supabase.from('programs').select('id,name,owner:profiles!programs_owner_id_fkey(display_name)').in('trainer_client_id', tcIds).eq('planned_for', today).limit(1) : Promise.resolve({ data: [] }),
      ]);
      const recent: RecentWorkout[] = ((w.data as any[]) ?? []).map(x => ({
        started_at: x.started_at, title: x.title, parts: [...new Set(((x.sets ?? []) as any[]).map(s => s.exercise?.body_part).filter(Boolean))] as string[],
      }));
      setMine(tpls);
      const t = ((tp.data as any[]) ?? [])[0];
      const doneToday = ((w.data as any[]) ?? []).find(x => new Date(x.started_at).toDateString() === new Date().toDateString());
      if (t) setPlan({ kind: 'trainer', id: t.id, name: t.name, from: t.owner?.display_name ?? 'เทรนเนอร์' });
      else if (doneToday) setPlan({ kind: 'done', title: doneToday.title || 'ออกกำลัง', sets: (doneToday.sets ?? []).length });
      else {
        const r = nextInRotation(tpls, recent);
        setPlan(r ? { kind: 'mine', p: r.p, lastDone: r.lastDone } : { kind: 'suggest', ...suggest(recent) });
      }
    })();
  }, [profile, key]);

  if (!plan) return null;
  const go = (q: string) => router.replace(`/my/train?${q}` as any);

  let kicker = 'วันนี้เล่นอะไรดี', title = '', sub = '', startQ = '';
  if (plan.kind === 'trainer') { kicker = 'โปรแกรมวันนี้'; title = plan.name; sub = `จาก ${plan.from}`; startQ = `program=${plan.id}`; }
  if (plan.kind === 'done') { kicker = 'วันนี้เล่นแล้ว'; title = plan.title; sub = `${plan.sets} เซต · พักให้พอ แล้วเจอกันพรุ่งนี้`; }
  if (plan.kind === 'mine') { kicker = 'ถึงคิวตามโปรแกรมของฉัน'; title = plan.p.name; sub = agoText(plan.lastDone); startQ = `program=${plan.p.id}`; }
  if (plan.kind === 'suggest') { kicker = 'แนะนำวันนี้'; title = SPLITS[plan.key].name; sub = plan.reason; startQ = `split=${plan.key}`; }

  return (
    <View style={{ backgroundColor: C.brand, borderRadius: R.card, padding: 20, gap: 6 }}>
      <Txt size={14} style={{ color: C.brandInk }}>{kicker}</Txt>
      <H size={26} style={{ color: C.brandInk }}>{title}</H>
      <Txt size={14} style={{ color: C.brandInk }}>{sub}</Txt>
      {plan.kind === 'done' ? (
        <Btn kind="ghost" label="ดูบันทึก" onPress={() => go('')} style={{ borderColor: C.brandInk, marginTop: 6 }} textColor={C.brandInk} />
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Btn label="เริ่มเล่น" onPress={() => go(startQ)} style={{ flex: 1, backgroundColor: C.brandInk, borderColor: C.brandInk }} textColor={C.brand} />
          <Btn kind="ghost" label={other ? 'ปิด' : 'เลือกอย่างอื่น'} onPress={() => setOther(!other)} style={{ flex: 1, borderColor: C.brandInk }} textColor={C.brandInk} />
        </View>
      )}
      {other ? (
        <View style={{ gap: 8, marginTop: 6, padding: 12, borderRadius: R.field, backgroundColor: C.surface }}>
          {mine.length ? <Chips label="โปรแกรมของฉัน" options={mine.map(m => ({ v: m.id, t: m.name }))} value={null} onChange={id => go(`program=${id}`)} /> : null}
          <Chips label="หรือเลือกส่วนที่จะเล่น" options={(Object.keys(SPLITS) as SplitKey[]).map(k => ({ v: k, t: SPLITS[k].name }))} value={null} onChange={k => go(`split=${k}`)} />
          {!mine.length ? <Txt size={14} style={{ color: C.accent }} onPress={() => go('new=1')}>มีตารางเล่นอยู่แล้ว? สร้างโปรแกรมของฉัน แล้วแอปจะเรียงคิวให้ทุกวัน</Txt> : null}
        </View>
      ) : null}
    </View>
  );
}
