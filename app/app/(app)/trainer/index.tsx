import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { isoDate, thDate, todayISO } from '../../../src/lib/gym';
import { TRAINER_TABS } from '../../../src/lib/nav';
import { APPT_COLS, apptRange, dayLabel, leaveText, markAppt, markMsg, tcName, toTs, type Appt, type Leave } from '../../../src/lib/trainer';
import { Btn, Card, DateField, H, Header, Label, Notice, Pill, Row, Screen, TimeField, Txt } from '../../../src/ui';
import { Icon } from '../../../src/ui/Icon';
import { MoveRequests } from '../../../src/ui/MoveRequests';
import { TabBar } from '../../../src/ui/TabBar';
import { C, R } from '../../../src/lib/theme';

type Pk = { trainer_client_id: string; sessions_total: number; sessions_left: number; days_overdue: number | null; end_date: string | null };
type Req = { appointment_id: string; proposed_start: string };

/** Trainer's day at a glance: the next session big, today's list with what needs attention, then the rest */
export default function TrainerToday() {
  const { profile } = useAuth();
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [next, setNext] = useState<Appt | null>(null);
  const [pk, setPk] = useState<Record<string, Pk>>({});
  const [reqs, setReqs] = useState<Req[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [gymName, setGymName] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [showReq, setShowReq] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    const [a, nx, l, g, r] = await Promise.all([
      supabase.from('appointments').select(APPT_COLS).eq('trainer_id', profile.id).gte('starts_at', s.toISOString()).lt('starts_at', e.toISOString()).neq('status', 'cancelled').order('starts_at'),
      supabase.from('appointments').select(APPT_COLS).eq('trainer_id', profile.id).eq('status', 'scheduled').gte('starts_at', new Date(Date.now() - 3 * 3600000).toISOString()).order('starts_at').limit(1),
      supabase.from('trainer_leave').select('id,start_at,end_at,reason').eq('trainer_id', profile.id).gte('end_at', new Date().toISOString()).order('start_at'),
      supabase.from('gym_staff').select('gym:gyms(name)').eq('user_id', profile.id).eq('active', true).limit(1),
      supabase.from('reschedule_requests').select('appointment_id,proposed_start,appt:appointments!inner(trainer_id)').eq('status', 'pending').eq('appt.trainer_id', profile.id),
    ]);
    const list = ((a.data as any) ?? []) as Appt[];
    const n = (((nx.data as any) ?? []) as Appt[])[0] ?? null;
    setAppts(list); setNext(n);
    setLeaves((l.data as Leave[]) ?? []);
    setGymName(((g.data as any)?.[0]?.gym?.name as string) ?? '');
    setReqs(((r.data as any) ?? []) as Req[]);
    const ids = [...new Set([...list, ...(n ? [n] : [])].map(x => x.trainer_client_id))];
    if (ids.length) {
      const { data } = await supabase.from('pt_package_status').select('trainer_client_id,sessions_total,sessions_left,days_overdue,end_date').in('trainer_client_id', ids).order('start_date');
      const m: Record<string, Pk> = {};
      ((data as Pk[]) ?? []).forEach(p => {
        const cur = m[p.trainer_client_id];
        // the package in use = oldest one with sessions left; fall back to the newest
        if (!cur || (cur.sessions_left <= 0 && p.sessions_left > 0)) m[p.trainer_client_id] = p;
      });
      // total left across packages for the label
      ((data as Pk[]) ?? []).forEach(p => { (m[p.trainer_client_id] as any).allLeft = ((m[p.trainer_client_id] as any).allLeft ?? 0) + Math.max(0, p.sessions_left); });
      setPk(m);
    } else setPk({});
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const leftOf = (tcId: string) => ((pk[tcId] as any)?.allLeft ?? 0) as number;
  const nth = (tcId: string) => { const p = pk[tcId]; return p && p.sessions_left > 0 ? `ครั้งที่ ${p.sessions_total - p.sessions_left + 1}/${p.sessions_total}` : `เหลือ ${leftOf(tcId)} ครั้ง`; };
  const reqOf = (id: string) => reqs.find(r => r.appointment_id === id);
  const now = new Date().toISOString();
  const onLeaveNow = leaves.find(l => now >= l.start_at && now < l.end_at);
  const doneCount = (appts ?? []).filter(a => a.status === 'done' || a.status === 'noshow').length;

  async function start(a: Appt) {
    setBusy(true);
    const { data, error } = await markAppt(a.id, 'done', false);
    setBusy(false);
    setMsg(error ? { t: thError(error), ok: false } : { t: `เริ่มเทรน ${tcName(a.tc)} · ${markMsg(data as any).replace(/^✓ มาแล้ว · /, '')}`, ok: true });
    load();
  }

  return (
    <Screen footer={<TabBar tabs={TRAINER_TABS} active="today" />}>
      <Header title="วันนี้" sub={[profile?.display_name, gymName].filter(Boolean).join(' · ')} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      {onLeaveNow ? <Notice kind="info" text={`ตอนนี้คุณลาอยู่ · ${leaveText(onLeaveNow)}`} /> : null}

      {next ? (
        <View style={{ backgroundColor: C.brand, borderRadius: R.card, padding: 20, gap: 6 }}>
          <Txt size={14} style={{ color: C.brandInk }}>นัดถัดไป · {apptRange(next).split('–')[0]} · {dayLabel(next.starts_at)}</Txt>
          <H size={26} style={{ color: C.brandInk }}>{tcName(next.tc)}</H>
          <Txt size={15} style={{ color: C.brandInk }}>{[next.program?.name, nth(next.trainer_client_id)].filter(Boolean).join(' · ')}</Txt>
          {reqOf(next.id) ? <Txt bold size={14} style={{ color: C.brandInk }}>ขอเลื่อนเป็น {dayLabel(reqOf(next.id)!.proposed_start)} {apptRange({ starts_at: reqOf(next.id)!.proposed_start, duration_min: 60 }).split('–')[0]}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Btn label="เริ่มเทรน" onPress={() => start(next)} loading={busy} style={{ flex: 1, backgroundColor: C.brandInk, borderColor: C.brandInk }} textColor={C.brand} />
            <Btn kind="ghost" label="เลื่อนนัด" onPress={() => setMoving(!moving)} style={{ flex: 1, borderColor: C.brandInk }} textColor={C.brandInk} />
          </View>
        </View>
      ) : appts ? <Card><Txt muted>ไม่มีนัดที่จะถึง · นัดใหม่ได้ที่แท็บ ลูกเทรน</Txt></Card> : null}
      {next && moving ? <MoveForm a={next} onDone={(t) => { setMoving(false); if (t) { setMsg({ t, ok: true }); load(); } }} /> : null}

      <Label>ตารางวันนี้ · {(appts ?? []).length} นัด · เสร็จ {doneCount}</Label>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {appts === null ? <Txt muted style={{ paddingVertical: 14 }}>กำลังโหลด…</Txt> : !appts.length ? <Txt muted style={{ paddingVertical: 14 }}>วันนี้ไม่มีนัด</Txt> : null}
        {(appts ?? []).map(a => {
          const r = reqOf(a.id), p = pk[a.trainer_client_id];
          const pill = a.status === 'done' ? { t: 'เสร็จแล้ว', k: 'ok' as const } : a.status === 'noshow' ? { t: 'ไม่มา', k: 'bad' as const }
            : r ? { t: 'ขอเลื่อน', k: 'caution' as const } : p?.days_overdue && p.sessions_left > 0 ? { t: `เลยกำหนด ${p.days_overdue} วัน`, k: 'warn' as const }
            : leftOf(a.trainer_client_id) <= 1 ? { t: `เหลือ ${leftOf(a.trainer_client_id)} ครั้ง`, k: 'warn' as const } : null;
          const sub = r ? `ขอเลื่อนเป็น ${thDate(isoDate(new Date(r.proposed_start)))} ${apptRange({ starts_at: r.proposed_start, duration_min: a.duration_min }).split('–')[0]}`
            : [a.program?.name, `เหลือ ${leftOf(a.trainer_client_id)} ครั้ง`].filter(Boolean).join(' · ');
          return (
            <Pressable key={a.id} accessibilityRole="button" onPress={() => router.push(`/trainer/client/${a.trainer_client_id}` as any)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 56, height: 44, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Txt bold size={14} style={{ color: C.accent, fontVariant: ['tabular-nums'] }}>{apptRange(a).split('–')[0]}</Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt bold numberOfLines={1}>{tcName(a.tc)}</Txt>
                <Txt muted size={13} numberOfLines={1}>{sub}</Txt>
              </View>
              {pill ? <Pill text={pill.t} kind={pill.k} /> : null}
              <Icon name="chevron-right" size={18} color={C.muted} />
            </Pressable>
          );
        })}
      </Card>

      <Label>อื่น ๆ</Label>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <Row ic="repeat" title="คำขอเลื่อนนัด" sub={reqs.length ? `${reqs.length} รายการรอตอบ` : 'ไม่มีคำขอ'} onPress={() => setShowReq(!showReq)}
          right={reqs.length ? <Pill text={String(reqs.length)} kind="caution" /> : undefined} />
        <Row ic="calendar-off" title="วันลา" sub={leaves.length ? `${leaves.length} ช่วงที่จะถึง` : 'แจ้งวันลา แอปเตือนนัดที่ชน'} onPress={() => router.push('/trainer/leave' as any)} />
        <Row ic="bell" title="การแจ้งเตือน" sub="เตือนก่อนนัด · เร็ว ๆ นี้" />
      </Card>
      {showReq ? <MoveRequests onChange={(t, ok) => { setMsg({ t, ok }); load(); }} /> : null}
    </Screen>
  );
}

/** Trainer moves a session directly (the trainee sees the new time) */
function MoveForm({ a, onDone }: { a: Appt; onDone: (msg?: string) => void }) {
  const d = new Date(a.starts_at);
  const [date, setDate] = useState(isoDate(d) < todayISO() ? todayISO() : isoDate(d));
  const [time, setTime] = useState(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const [err, setErr] = useState('');
  async function save() {
    if (!/^\d{2}:\d{2}$/.test(time)) { setErr('เวลาไม่ถูกต้อง'); return; }
    const ts = toTs(date, time);
    const { error } = await supabase.from('appointments').update({ starts_at: ts }).eq('id', a.id);
    if (error) { setErr(thError(error)); return; }
    onDone(`เลื่อน ${tcName(a.tc)} เป็น ${dayLabel(ts)} ${time} แล้ว`);
  }
  return (
    <Card>
      <H size={17}>เลื่อนนัด {tcName(a.tc)}</H>
      {err ? <Notice text={err} /> : null}
      <DateField label="วันใหม่" value={date} onChange={setDate} min={todayISO()} />
      <TimeField label="เวลาใหม่" value={time} onChange={setTime} />
      <Btn label="บันทึก" onPress={save} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}
