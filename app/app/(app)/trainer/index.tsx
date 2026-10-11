import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { thDate, thDateTs } from '../../../src/lib/gym';
import { APPT_COLS, inLeave, leaveText, sessionsLeft, TC_COLS, tcName, tcPhone, type Appt, type Leave, type TC } from '../../../src/lib/trainer';
import { Btn, Card, Chips, Field, H, Header, Notice, Pill, Row, Screen, Txt } from '../../../src/ui';
import { ApptCard } from '../../../src/ui/Appt';

type Range = 'today' | 'week';
type Sent = { id: string; to_name: string; to_uid: number; created_at: string };

export default function TrainerHome() {
  const { profile } = useAuth();
  const [range, setRange] = useState<Range>('today');
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [tcs, setTcs] = useState<TC[]>([]);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + (range === 'today' ? 1 : 7));
    const [a, t, l, si] = await Promise.all([
      supabase.from('appointments').select(APPT_COLS).eq('trainer_id', profile.id).gte('starts_at', s.toISOString()).lt('starts_at', e.toISOString()).order('starts_at'),
      supabase.from('trainer_clients').select(TC_COLS).eq('trainer_id', profile.id).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('trainer_leave').select('id,start_at,end_at,reason').eq('trainer_id', profile.id).gte('end_at', new Date().toISOString()).order('start_at'),
      supabase.rpc('my_sent_invites'),
    ]);
    setAppts(((a.data as any) ?? []) as Appt[]);
    const list = ((t.data as any) ?? []) as TC[];
    setTcs(list);
    setLeft(await sessionsLeft(list.map(x => x.id)));
    setLeaves((l.data as Leave[]) ?? []);
    setSent(((si.data as Sent[]) ?? []));
  }, [profile, range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? tcs.filter(t => tcName(t).toLowerCase().includes(s) || tcPhone(t).replace(/\D/g, '').includes(s.replace(/\D/g, '') || '§')) : tcs;
  }, [tcs, q]);

  const now = new Date().toISOString();
  const onLeaveNow = leaves.find(l => now >= l.start_at && now < l.end_at);
  const active = (appts ?? []).filter(a => a.status !== 'cancelled');

  return (
    <Screen>
      <Header title="เทรนเนอร์" sub="ตารางนัด ลูกเทรน แพ็กเกจ PT" back={() => router.replace('/')} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      {onLeaveNow ? <Notice kind="info" text={`ตอนนี้คุณลาอยู่ · ${leaveText(onLeaveNow)}`} /> : null}

      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <H size={17} style={{ flex: 1 }}>นัดเทรน</H>
          <Chips options={[{ v: 'today', t: 'วันนี้' }, { v: 'week', t: '7 วัน' }]} value={range} onChange={setRange} />
        </View>
        {appts === null ? <Txt muted>กำลังโหลด…</Txt> : !active.length ? <Txt muted>{range === 'today' ? 'วันนี้ไม่มีนัด' : 'ไม่มีนัดใน 7 วันนี้'} · นัดใหม่ได้ที่หน้าลูกเทรน</Txt> : null}
        {(appts ?? []).map(a => (
          <ApptCard key={a.id} a={a} showDay={range === 'week'} canManage onLeave={inLeave(a.starts_at, leaves)}
            onDone={(t, ok) => { setMsg({ t, ok }); load(); }} />
        ))}
      </Card>

      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <H size={17} style={{ flex: 1 }}>ลูกเทรน ({tcs.length})</H>
          <Btn label="+ เพิ่ม" onPress={() => router.push('/trainer/add' as any)} style={{ minHeight: 38 }} />
        </View>
        {tcs.length > 6 ? <Field label="ค้นหาลูกเทรน" value={q} onChangeText={setQ} placeholder="ชื่อหรือเบอร์" /> : null}
        {!tcs.length ? <Txt muted style={{ paddingVertical: 8 }}>ยังไม่มีลูกเทรน · กด "+ เพิ่ม" เพื่อเชิญคนที่มีแอป หรือเพิ่มคนที่ไม่มีแอปด้วยชื่อและเบอร์</Txt> : null}
        {shown.map(t => {
          const n = left[t.id] ?? 0;
          return (
            <Row key={t.id} icon={tcName(t).slice(0, 2)} title={tcName(t)}
              sub={[t.gym?.name ?? 'ฟรีแลนซ์', t.client_id ? null : 'ไม่มีแอป'].filter(Boolean).join(' · ')}
              right={<Pill text={`เหลือ ${n} ครั้ง`} kind={n === 0 ? 'bad' : n <= 2 ? 'warn' : 'ok'} />}
              onPress={() => router.push(`/trainer/client/${t.id}` as any)} />
          );
        })}
      </Card>

      {sent.length ? (
        <Card style={{ gap: 4 }}>
          <H size={17}>รอตอบรับคำเชิญ</H>
          {sent.map(s => <Txt key={s.id} size={14}>{s.to_name} (UID {s.to_uid}) · ส่งเมื่อ {thDateTs(s.created_at)}</Txt>)}
          <Txt muted size={12.5}>อีกฝ่ายต้องเปิดแอปแล้วกดรับคำเชิญที่หน้าแรก คำเชิญหมดอายุใน 7 วัน</Txt>
        </Card>
      ) : null}

      <Btn kind="ghost" label={`วันลา${leaves.length ? ` (${leaves.length})` : ''}`} onPress={() => router.push('/trainer/leave' as any)} />
    </Screen>
  );
}
