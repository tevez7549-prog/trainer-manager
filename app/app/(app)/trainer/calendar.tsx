import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { TRAINER_TABS } from '../../../src/lib/nav';
import { APPT_COLS, apptRange, dayLabel, inLeave, leaveText, markAppt, markMsg, sessionsLeft, tcName, type Appt, type Leave } from '../../../src/lib/trainer';
import { Btn, Card, Chips, H, Header, Label, Notice, Screen, Txt } from '../../../src/ui';
import { ApptCard } from '../../../src/ui/Appt';
import { TabBar } from '../../../src/ui/TabBar';
import { WeekGrid } from '../../../src/ui/WeekGrid';
import { MoveRequests } from '../../../src/ui/MoveRequests';
import { C, R } from '../../../src/lib/theme';

type Range = 'today' | 'week' | 'grid';

/** Calendar: the week grid of free hours, or the list for today / the next 7 days */
export default function TrainerCalendar() {
  const { profile } = useAuth();
  const [range, setRange] = useState<Range>('grid');
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [gymName, setGymName] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + (range === 'today' ? 1 : 7));
    const [a, l, g] = await Promise.all([
      supabase.from('appointments').select(APPT_COLS).eq('trainer_id', profile.id).gte('starts_at', s.toISOString()).lt('starts_at', e.toISOString()).order('starts_at'),
      supabase.from('trainer_leave').select('id,start_at,end_at,reason').eq('trainer_id', profile.id).gte('end_at', new Date().toISOString()).order('start_at'),
      supabase.from('gym_staff').select('gym:gyms(name)').eq('user_id', profile.id).eq('active', true).eq('role', 'trainer').limit(1),
    ]);
    const list = ((a.data as any) ?? []) as Appt[];
    setAppts(list);
    setLeft(await sessionsLeft([...new Set(list.map(x => x.trainer_client_id))]));
    setLeaves((l.data as Leave[]) ?? []);
    setGymName(((g.data as any)?.[0]?.gym?.name as string) ?? '');
  }, [profile, range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const done = (appts ?? []).filter(a => a.status === 'done' || a.status === 'noshow').length;
  const live = (appts ?? []).filter(a => a.status !== 'cancelled').length;
  const now = new Date().toISOString();
  const onLeaveNow = leaves.find(l => now >= l.start_at && now < l.end_at);


  return (
    <Screen footer={<TabBar tabs={TRAINER_TABS} active="calendar" />}>
      <Header title="ปฏิทิน" sub={[profile?.display_name, gymName].filter(Boolean).join(' · ')}
        right={appts && range === 'today' && live ? <Txt muted size={14}>เช็กแล้ว {done}/{live}</Txt> : undefined} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      {onLeaveNow ? <Notice kind="info" text={`ตอนนี้คุณลาอยู่ · ${leaveText(onLeaveNow)}`} /> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Label style={{ flex: 1 }}>{range === 'today' ? 'ทั้งวัน' : range === 'week' ? '7 วันนี้' : 'ตารางว่าง'}</Label>
        <Chips options={[{ v: 'grid', t: 'ตาราง' }, { v: 'week', t: '7 วัน' }, { v: 'today', t: 'วันนี้' }]} value={range} onChange={setRange} />
      </View>
      {range === 'grid' && profile ? <Card><WeekGrid trainerId={profile.id} reloadKey={appts?.length} /></Card> : null}
      {range !== 'grid' ? <Card style={{ gap: 0, paddingVertical: 4 }}>
        {appts === null ? <Txt muted style={{ paddingVertical: 14 }}>กำลังโหลด…</Txt>
          : !appts.length ? <Txt muted style={{ paddingVertical: 14 }}>{range === 'today' ? 'วันนี้ไม่มีนัด' : 'ไม่มีนัดใน 7 วันนี้'} · นัดใหม่ได้ที่แท็บ ลูกเทรน</Txt> : null}
        {(appts ?? []).map(a => (
          <ApptCard key={a.id} a={a} showDay={range === 'week'} canManage onLeave={inLeave(a.starts_at, leaves)}
            onDone={(t, ok) => { setMsg({ t, ok }); load(); }} />
        ))}
      </Card> : null}
      <Txt muted size={13}>ไม่มา = ไม่หักครั้ง · ถ้าต้องการหัก กดที่นัดนั้นแล้วเลือก</Txt>
      <Btn kind="ghost" icon="calendar-off" label={`วันลา${leaves.length ? ` (${leaves.length})` : ''}`} onPress={() => router.push('/trainer/leave' as any)} />
    </Screen>
  );
}
