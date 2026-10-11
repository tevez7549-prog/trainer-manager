import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/lib/auth';
import { isManager, useGym, type Role } from '../../../../src/lib/gym';
import { APPT_COLS, sessionsLeft, TC_COLS, tcName, type Appt, type TC } from '../../../../src/lib/trainer';
import { Card, Chips, Empty, Field, Header, Label, Notice, Pill, Row, Txt } from '../../../../src/ui';
import { ApptCard } from '../../../../src/ui/Appt';
import { GymFrame } from '../../../../src/ui/GymFrame';
import { WeekGrid } from '../../../../src/ui/WeekGrid';

type Staff = { user_id: string; role: Role; profile: { display_name: string; uid: number } | null };
type Range = 'today' | 'week';

/** Owner / Admin / Operator: every trainer's trainees, sessions left and appointments at this gym */
export default function GymPT() {
  const { id, low: low0 } = useLocalSearchParams<{ id: string; low?: string }>();
  const { gym, role } = useGym(id);
  const me = useAuth().profile?.id;
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tcs, setTcs] = useState<TC[] | null>(null);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [appts, setAppts] = useState<Appt[]>([]);
  const [who, setWho] = useState<string>('all');
  const [range, setRange] = useState<Range>('today');
  const [q, setQ] = useState('');
  const [low, setLow] = useState(low0 === '1');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      supabase.from('gym_staff').select('user_id,role,profile:profiles(display_name,uid)').eq('gym_id', id).eq('active', true),
      supabase.from('trainer_clients').select(TC_COLS).eq('gym_id', id).eq('status', 'active').order('created_at', { ascending: false }),
    ]);
    const list = ((t.data as any) ?? []) as TC[];
    setStaff(((s.data as any) ?? []) as Staff[]);
    setTcs(list);
    setLeft(await sessionsLeft(list.map(x => x.id)));
    if (!list.length) { setAppts([]); return; }
    const a0 = new Date(); a0.setHours(0, 0, 0, 0);
    const a1 = new Date(a0); a1.setDate(a1.getDate() + (range === 'today' ? 1 : 7));
    const { data } = await supabase.from('appointments').select(APPT_COLS).in('trainer_client_id', list.map(x => x.id))
      .gte('starts_at', a0.toISOString()).lt('starts_at', a1.toISOString()).order('starts_at');
    setAppts(((data as any) ?? []) as Appt[]);
  }, [id, range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // trainers = gym trainers + anyone (owner/admin) who has trainees here
  const trainers = useMemo(() => {
    const ids = new Set<string>(staff.filter(s => s.role === 'trainer').map(s => s.user_id));
    (tcs ?? []).forEach(t => ids.add(t.trainer_id));
    return [...ids].map(uid => {
      const st = staff.find(s => s.user_id === uid);
      const mine = (tcs ?? []).filter(t => t.trainer_id === uid);
      const name = uid === me ? 'คุณ' : st?.profile?.display_name || mine[0]?.trainer?.display_name || 'เทรนเนอร์';
      return { id: uid, name, role: st?.role ?? null, count: mine.length,
        today: appts.filter(a => a.trainer_id === uid && a.status !== 'cancelled').length,
        low: mine.filter(t => (left[t.id] ?? 0) <= 2).length };
    }).sort((a, b) => b.count - a.count);
  }, [staff, tcs, appts, left, me]);

  const nameOf = (uid: string) => trainers.find(t => t.id === uid)?.name ?? 'เทรนเนอร์';
  const shownTc = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tcs ?? []).filter(t => (who === 'all' || t.trainer_id === who) && (!low || (left[t.id] ?? 0) <= 2) && (!s || tcName(t).toLowerCase().includes(s) || (t.member?.code ?? '').toLowerCase().includes(s)));
  }, [tcs, who, q, low, left]);
  const shownAppt = appts.filter(a => who === 'all' || a.trainer_id === who);
  const total = tcs?.length ?? 0;
  const lowAll = (tcs ?? []).filter(t => (left[t.id] ?? 0) <= 2).length;

  return (
    <GymFrame id={id} gym={gym} role={role} active="pt">
      <Header title="PT" sub={gym?.name} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {trainers.length ? (
        <Chips options={[{ v: 'all', t: `ทุกคน (${total})` }, ...trainers.map(t => ({ v: t.id, t: `${t.name} (${t.count})` }))]} value={who} onChange={setWho} />
      ) : null}
      {tcs && !trainers.length ? (
        <Card><Empty ic="dumbbell" title="ยังไม่มี PT" text="ขาย PT ได้ที่หน้าสมาชิก: กด ขาย / ต่ออายุ แล้วเลือก PT · เพิ่มเทรนเนอร์ได้ที่ เพิ่มเติม › ทีมงาน" /></Card>
      ) : null}

      {who !== 'all' ? <>
        <Label>ตารางว่างของ {nameOf(who)}</Label>
        <Card><WeekGrid trainerId={who} closedDays={gym?.closed_weekdays ?? []} reloadKey={appts.length} /></Card>
      </> : trainers.length ? <Txt muted size={13}>แตะชื่อเทรนเนอร์ด้านบนเพื่อดูตารางว่างทั้งสัปดาห์</Txt> : null}

      {tcs?.length ? <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Label style={{ flex: 1 }}>นัด ({shownAppt.filter(a => a.status !== 'cancelled').length})</Label>
          <Chips options={[{ v: 'today', t: 'วันนี้' }, { v: 'week', t: '7 วัน' }]} value={range} onChange={setRange} />
        </View>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {!shownAppt.length ? <Txt muted style={{ paddingVertical: 14 }}>{range === 'today' ? 'วันนี้ไม่มีนัด' : 'ไม่มีนัดใน 7 วันนี้'}</Txt> : null}
          {shownAppt.map(a => (
            <View key={a.id}>
              {who === 'all' ? <Txt muted size={12.5} style={{ paddingTop: 8 }}>กับ {nameOf(a.trainer_id)}</Txt> : null}
              <ApptCard a={a} showDay={range === 'week'} canManage={isManager(role)} onDone={(t, ok) => { setMsg({ t, ok }); load(); }} />
            </View>
          ))}
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Label style={{ flex: 1 }}>ลูกเทรน ({shownTc.length})</Label>
          <Chips options={[{ v: 'all', t: 'ทั้งหมด' }, { v: 'low', t: `ใกล้หมด (${lowAll})` }]} value={low ? 'low' : 'all'} onChange={v => setLow(v === 'low')} />
        </View>
        {total > 8 ? <Field label="ค้นหา" value={q} onChangeText={setQ} placeholder="ชื่อหรือรหัสสมาชิก" /> : null}
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {!shownTc.length ? <Txt muted style={{ paddingVertical: 14 }}>ไม่มีลูกเทรนในกลุ่มนี้</Txt> : null}
          {shownTc.map(t => {
            const n = left[t.id] ?? 0;
            return (
              <Row key={t.id} icon={tcName(t).slice(0, 2)} title={tcName(t)}
                sub={[who === 'all' ? `กับ ${nameOf(t.trainer_id)}` : null, t.member?.code ?? null].filter(Boolean).join(' · ') || undefined}
                right={<Pill text={`เหลือ ${n} ครั้ง`} kind={n === 0 ? 'bad' : n <= 2 ? 'warn' : 'ok'} />}
                onPress={() => router.push(`/trainer/client/${t.id}` as any)} />
            );
          })}
        </Card>
      </> : null}
    </GymFrame>
  );
}
