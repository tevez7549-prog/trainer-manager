import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../src/lib/supabase';
import { isManager, ROLE_TH, useGym, type Role } from '../../../../src/lib/gym';
import { APPT_COLS, sessionsLeft, TC_COLS, tcName, type Appt, type TC } from '../../../../src/lib/trainer';
import { Card, Chips, Empty, Field, H, Header, Notice, Pill, Row, Stat, Txt } from '../../../../src/ui';
import { ApptCard } from '../../../../src/ui/Appt';
import { GymFrame } from '../../../../src/ui/GymFrame';

type Staff = { user_id: string; role: Role; profile: { display_name: string; uid: number } | null };
type Range = 'today' | 'week';

/** Owner / Admin / Operator: every trainer's trainees, sessions left and appointments at this gym */
export default function GymPT() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role } = useGym(id);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tcs, setTcs] = useState<TC[] | null>(null);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [appts, setAppts] = useState<Appt[]>([]);
  const [who, setWho] = useState<string>('all');
  const [range, setRange] = useState<Range>('today');
  const [q, setQ] = useState('');
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
      const name = st?.profile?.display_name || mine[0]?.trainer?.display_name || 'เทรนเนอร์';
      return { id: uid, name, role: st?.role ?? null, count: mine.length,
        today: appts.filter(a => a.trainer_id === uid && a.status !== 'cancelled').length,
        low: mine.filter(t => (left[t.id] ?? 0) <= 2).length };
    }).sort((a, b) => b.count - a.count);
  }, [staff, tcs, appts, left]);

  const nameOf = (uid: string) => trainers.find(t => t.id === uid)?.name ?? 'เทรนเนอร์';
  const shownTc = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tcs ?? []).filter(t => (who === 'all' || t.trainer_id === who) && (!s || tcName(t).toLowerCase().includes(s) || (t.member?.code ?? '').toLowerCase().includes(s)));
  }, [tcs, who, q]);
  const shownAppt = appts.filter(a => who === 'all' || a.trainer_id === who);
  const total = tcs?.length ?? 0;
  const lowAll = (tcs ?? []).filter(t => (left[t.id] ?? 0) <= 2).length;

  return (
    <GymFrame id={id} gym={gym} role={role} active="pt">
      <Header title="เทรนเนอร์ & PT" sub={gym?.name} back={() => router.replace(`/gym/${id}` as any)} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Stat n={tcs ? total : '–'} t="ลูกเทรน PT" />
        <Stat n={tcs ? appts.filter(a => a.status !== 'cancelled').length : '–'} t={range === 'today' ? 'นัดวันนี้' : 'นัด 7 วัน'} />
        <Stat n={tcs ? lowAll : '–'} t="ใกล้หมด (≤ 2 ครั้ง)" kind={lowAll ? 'warn' : undefined} />
      </View>

      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <H size={17} style={{ paddingTop: 10, paddingBottom: 4 }}>เทรนเนอร์ ({trainers.length})</H>
        {tcs && !trainers.length ? (
          <Empty ic="dumbbell" title="ยังไม่มีเทรนเนอร์" text={isManager(role) ? 'เพิ่มเทรนเนอร์ที่เมนู ทีมงาน หรือมอบหมายเทรนเนอร์ให้สมาชิกที่หน้าสมาชิก' : undefined} />
        ) : null}
        {trainers.map(t => (
          <Row key={t.id} icon={t.name.slice(0, 2)} title={t.name}
            sub={[t.role && t.role !== 'trainer' ? ROLE_TH[t.role] : null, `ลูกเทรน ${t.count} คน`, `นัด${range === 'today' ? 'วันนี้' : ' 7 วัน'} ${t.today}`].filter(Boolean).join(' · ')}
            right={t.low ? <Pill text={`ใกล้หมด ${t.low}`} kind="warn" /> : who === t.id ? <Pill text="กำลังดู" kind="info" /> : undefined}
            onPress={() => setWho(who === t.id ? 'all' : t.id)} />
        ))}
      </Card>

      {trainers.length > 1 ? (
        <Chips label="ดูของ" options={[{ v: 'all', t: 'ทุกคน' }, ...trainers.map(t => ({ v: t.id, t: t.name }))]} value={who} onChange={setWho} />
      ) : null}

      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <H size={17} style={{ flex: 1 }}>นัดเทรน</H>
          <Chips options={[{ v: 'today', t: 'วันนี้' }, { v: 'week', t: '7 วัน' }]} value={range} onChange={setRange} />
        </View>
        {!shownAppt.length ? <Txt muted>{range === 'today' ? 'วันนี้ไม่มีนัด' : 'ไม่มีนัดใน 7 วันนี้'}</Txt> : null}
        {shownAppt.map(a => (
          <View key={a.id}>
            {who === 'all' ? <Txt muted size={12} style={{ paddingTop: 6 }}>{nameOf(a.trainer_id)}</Txt> : null}
            <ApptCard a={a} showDay={range === 'week'} canManage={isManager(role)} onDone={(t, ok) => { setMsg({ t, ok }); load(); }} />
          </View>
        ))}
      </Card>

      <Card style={{ gap: 4 }}>
        <H size={17}>ลูกเทรน ({shownTc.length})</H>
        {total > 6 ? <Field label="ค้นหา" value={q} onChangeText={setQ} placeholder="ชื่อหรือรหัสสมาชิก" /> : null}
        {tcs === null ? <Txt muted>กำลังโหลด…</Txt> : !shownTc.length ? <Txt muted style={{ paddingVertical: 8 }}>ยังไม่มีลูกเทรน</Txt> : null}
        {shownTc.map(t => {
          const n = left[t.id] ?? 0;
          return (
            <Row key={t.id} icon={tcName(t).slice(0, 2)} title={tcName(t)}
              sub={[who === 'all' ? `เทรนเนอร์ ${nameOf(t.trainer_id)}` : null, t.member?.code ?? null].filter(Boolean).join(' · ') || undefined}
              right={<Pill text={`เหลือ ${n} ครั้ง`} kind={n === 0 ? 'bad' : n <= 2 ? 'warn' : 'ok'} />}
              onPress={() => router.push(`/trainer/client/${t.id}` as any)} />
          );
        })}
        <Txt muted size={12} style={{ paddingTop: 6 }}>เห็นเฉพาะลูกเทรนที่ผูกกับยิมนี้ · ลูกเทรนส่วนตัวของเทรนเนอร์ (นอกยิม) เป็นข้อมูลของเทรนเนอร์คนนั้น</Txt>
      </Card>
    </GymFrame>
  );
}
