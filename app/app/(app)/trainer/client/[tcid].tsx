import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/lib/auth';
import { addDays, baht, isoDate, thDate, thDateTs, todayISO } from '../../../../src/lib/gym';
import {
  APPT_COLS, apptRange, dayLabel, DURATIONS, inLeave, overlaps, TC_COLS, tcName, tcPhone, toTs,
  type Appt, type Leave, type Pkg, type TC,
} from '../../../../src/lib/trainer';
import { Btn, Card, Chips, ConfirmBtn, DateField, Field, H, Header, Notice, Pill, Screen, TimeField, Txt } from '../../../../src/ui';
import { ApptCard } from '../../../../src/ui/Appt';
import { C } from '../../../../src/lib/theme';

type Ledger = { id: string; package_id: string; delta: number; kind: string; reason: string | null; extend_days: number | null; at: string };
const KIND_TH: Record<string, string> = { session: 'มาเทรน', noshow: 'ไม่มา (หัก)', bonus: 'แถม', refund: 'คืนเงิน', adjust: 'ปรับ', extend: 'ขยายวันหมด', import: 'นำเข้า' };
type Panel = '' | 'book' | 'sell' | 'goal';

export default function ClientPage() {
  const { tcid } = useLocalSearchParams<{ tcid: string }>();
  const { profile } = useAuth();
  const [tc, setTc] = useState<TC | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [panel, setPanel] = useState<Panel>('');
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    const t = await supabase.from('trainer_clients').select(TC_COLS).eq('id', tcid).maybeSingle();
    if (t.error || !t.data) { setErr('ไม่พบลูกเทรนนี้ หรือคุณไม่มีสิทธิ์ดู'); return; }
    const x = t.data as any as TC;
    setTc(x);
    const [p, a, l, lv, role] = await Promise.all([
      supabase.from('pt_package_status').select('*').eq('trainer_client_id', tcid).order('start_date', { ascending: false }),
      supabase.from('appointments').select(APPT_COLS).eq('trainer_client_id', tcid).order('starts_at', { ascending: false }).limit(60),
      supabase.from('pt_package_ledger').select('id,package_id,delta,kind,reason,extend_days,at, pkg:pt_packages!inner(trainer_client_id)').eq('pkg.trainer_client_id', tcid).order('at', { ascending: false }).limit(30),
      supabase.from('trainer_leave').select('id,start_at,end_at,reason').eq('trainer_id', x.trainer_id).gte('end_at', new Date().toISOString()),
      x.gym_id && profile ? supabase.from('gym_staff').select('role').eq('gym_id', x.gym_id).eq('user_id', profile.id).eq('active', true).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setPkgs((p.data as Pkg[]) ?? []);
    setAppts(((a.data as any) ?? []) as Appt[]);
    setLedger(((l.data as any) ?? []) as Ledger[]);
    setLeaves((lv.data as Leave[]) ?? []);
    const r = (role as any)?.data?.role as string | undefined;
    setCanManage(x.trainer_id === profile?.id || r === 'owner' || r === 'admin' || !!profile?.is_super_admin);
  }, [tcid, profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (err) return <Screen><Header title="ลูกเทรน" back={() => router.replace('/trainer' as any)} /><Notice text={err} /></Screen>;
  if (!tc) return <Screen><Header title="ลูกเทรน" back={() => router.back()} /><Txt muted>กำลังโหลด…</Txt></Screen>;

  // scheduled ones from the last 12 hours count as upcoming, so today's session can still be marked
  const upcoming = appts.filter(a => a.status === 'scheduled' && new Date(a.starts_at).getTime() > Date.now() - 12 * 3600000).reverse();
  const past = appts.filter(a => !upcoming.includes(a));
  const totalLeft = pkgs.reduce((s, p) => s + Math.max(0, p.sessions_left), 0);
  const done = (t: string, ok: boolean) => { setMsg({ t, ok }); load(); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/trainer' as any));

  async function remove() {
    const { error } = await supabase.from('trainer_clients').update({ status: 'removed', removed_at: new Date().toISOString() }).eq('id', tcid);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    router.replace('/trainer' as any);
  }

  return (
    <Screen>
      <Header title={tcName(tc)} sub={[tcPhone(tc), tc.gym?.name ?? 'ฟรีแลนซ์', tc.client_id ? null : 'ไม่มีแอป'].filter(Boolean).join(' · ')} back={back} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      {tc.trainer_id !== profile?.id && tc.trainer ? <Txt muted>เทรนเนอร์: {tc.trainer.display_name}</Txt> : null}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Txt muted size={13}>คงเหลือ</Txt>
            <H size={30} style={{ color: totalLeft === 0 ? C.badFg : totalLeft <= 2 ? C.warnFg : C.fg }}>{totalLeft} ครั้ง</H>
          </View>
          {upcoming[0] ? <View style={{ alignItems: 'flex-end' }}><Txt muted size={13}>นัดถัดไป</Txt><Txt bold>{dayLabel(upcoming[0].starts_at)} {apptRange(upcoming[0])}</Txt></View> : null}
        </View>
        {tc.goal ? <Txt>เป้าหมาย: {tc.goal}</Txt> : null}
      </Card>

      {canManage && panel === '' ? (
        <View style={{ gap: 10 }}>
          <Btn label="+ นัดเทรน" onPress={() => setPanel('book')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn kind="ghost" label="+ ขายแพ็กเกจ PT" onPress={() => setPanel('sell')} style={{ flex: 1 }} />
            <Btn kind="ghost" label="แก้เป้าหมาย" onPress={() => setPanel('goal')} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
      {panel === 'book' ? <BookForm tc={tc} leaves={leaves} onClose={(t) => { setPanel(''); if (t) done(t, true); }} /> : null}
      {panel === 'sell' ? <SellPkgForm tc={tc} onClose={(t) => { setPanel(''); if (t) done(t, true); }} /> : null}
      {panel === 'goal' ? <GoalForm tc={tc} onClose={(t) => { setPanel(''); if (t) done(t, true); }} /> : null}

      <Card style={{ gap: 2 }}>
        <H size={17}>นัดที่จะถึง ({upcoming.length})</H>
        {!upcoming.length ? <Txt muted>ยังไม่มีนัด</Txt> : null}
        {upcoming.map(a => <ApptCard key={a.id} a={a} showName={false} showDay canManage={canManage} onLeave={inLeave(a.starts_at, leaves)} onDone={done} />)}
      </Card>

      <Card style={{ gap: 6 }}>
        <H size={17}>แพ็กเกจ PT</H>
        {!pkgs.length ? <Txt muted>ยังไม่มีแพ็กเกจ</Txt> : null}
        {pkgs.map(p => <PkgRow key={p.id} p={p} canManage={canManage} onDone={done} />)}
      </Card>

      <Card style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <H size={17} style={{ flex: 1 }}>ประวัติการเทรน</H>
          <Btn kind="ghost" label={showPast ? 'ซ่อน' : `ดู (${past.length})`} onPress={() => setShowPast(!showPast)} style={{ minHeight: 36 }} />
        </View>
        {showPast ? past.map(a => <ApptCard key={a.id} a={a} showName={false} showDay canManage={canManage} onDone={done} />) : null}
        {showPast && ledger.length ? <>
          <Txt bold size={13.5} style={{ marginTop: 10 }}>การเปลี่ยนแปลงครั้ง</Txt>
          {ledger.map(l => <Txt key={l.id} size={13} muted>{thDateTs(l.at)} · {KIND_TH[l.kind] ?? l.kind} {l.kind === 'extend' ? `+${l.extend_days} วัน` : (l.delta > 0 ? '+' : '') + l.delta}{l.reason ? ' · ' + l.reason : ''}</Txt>)}
        </> : null}
      </Card>

      {tc.trainer_id === profile?.id ? (
        <ConfirmBtn label="ลบออกจากรายชื่อลูกเทรน" confirmLabel="กดอีกครั้ง: ลบออกจากรายชื่อ (บัญชีและประวัติของเขายังอยู่)" onConfirm={remove} />
      ) : null}
    </Screen>
  );
}

function BookForm({ tc, leaves, onClose }: { tc: TC; leaves: Leave[]; onClose: (msg?: string) => void }) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('18:00');
  const [dur, setDur] = useState<number>(60);
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState<number>(1);
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(force = false) {
    if (!/^\d{2}:\d{2}$/.test(time)) { setErr('เวลาไม่ถูกต้อง'); return; }
    const starts = Array.from({ length: repeat }, (_, i) => toTs(addDays(date, i * 7), time));
    if (!force) {
      // clashes with the trainer's other appointments, or with leave
      const from = starts[0], to = new Date(new Date(starts[starts.length - 1]).getTime() + 86400000).toISOString();
      const { data } = await supabase.from('appointments').select('starts_at,duration_min,status').eq('trainer_id', tc.trainer_id).neq('status', 'cancelled').gte('starts_at', new Date(new Date(from).getTime() - 3 * 3600000).toISOString()).lt('starts_at', to);
      const clash = starts.filter(s => ((data as any[]) ?? []).some(o => overlaps(s, dur, o.starts_at, o.duration_min)));
      const leave = starts.filter(s => inLeave(s, leaves));
      if (clash.length || leave.length) {
        setWarn([clash.length ? `ชนกับนัดอื่น ${clash.length} ครั้ง (${clash.map(s => dayLabel(s)).join(', ')})` : '', leave.length ? `ตรงกับวันลา ${leave.length} ครั้ง` : ''].filter(Boolean).join(' · '));
        return;
      }
    }
    setBusy(true); setErr('');
    const { error } = await supabase.from('appointments').insert(starts.map(s => ({
      trainer_id: tc.trainer_id, trainer_client_id: tc.id, gym_id: tc.gym_id, starts_at: s, duration_min: dur, note: note.trim() || null,
    })));
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onClose(repeat > 1 ? `นัด ${repeat} ครั้งแล้ว (ทุกสัปดาห์ เริ่ม ${dayLabel(starts[0])} ${time})` : `นัดแล้ว ${dayLabel(starts[0])} ${time} · ${dur} นาที`);
  }

  return (
    <Card>
      <H size={17}>นัดเทรน</H>
      {err ? <Notice text={err} /> : null}
      <DateField label="วันที่" value={date} onChange={v => { setDate(v); setWarn(''); }} min={todayISO()} />
      <TimeField label="เวลาเริ่ม" value={time} onChange={v => { setTime(v); setWarn(''); }} />
      <Chips label="ระยะเวลา" options={DURATIONS.map(d => ({ v: d as number, t: `${d} นาที` }))} value={dur} onChange={v => { setDur(v); setWarn(''); }} />
      <Chips label="นัดซ้ำทุกสัปดาห์" options={[1, 4, 8, 12].map(n => ({ v: n, t: n === 1 ? 'ครั้งเดียว' : `${n} สัปดาห์` }))} value={repeat} onChange={v => { setRepeat(v); setWarn(''); }} />
      <Field label="หมายเหตุ (ไม่บังคับ)" value={note} onChangeText={setNote} placeholder="เช่น ขา / อก-หลัง" />
      {warn ? <>
        <Notice kind="info" text={warn} />
        <Btn label="นัดอยู่ดี" onPress={() => save(true)} loading={busy} />
      </> : <Btn label="บันทึกนัด" onPress={() => save()} loading={busy} />}
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onClose()} />
    </Card>
  );
}

function SellPkgForm({ tc, onClose }: { tc: TC; onClose: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState('10');
  const [months, setMonths] = useState<number>(3);
  const [price, setPrice] = useState('');
  const [start, setStart] = useState(todayISO());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(sessions), pr = Number(price);
    if (!n || n < 1 || n > 500) { setErr('จำนวนครั้งต้องเป็น 1–500'); return; }
    if (price === '' || Number.isNaN(pr) || pr < 0) { setErr('ใส่ราคาเป็นตัวเลข'); return; }
    let end: string | null = null;
    if (months) { const d = new Date(start + 'T00:00:00'); d.setMonth(d.getMonth() + months); d.setDate(d.getDate() - 1); end = isoDate(d); }
    setBusy(true); setErr('');
    const label = `${n} ครั้ง${months ? ` / ${months} เดือน` : ''}`;
    const { error } = await supabase.from('pt_packages').insert({
      trainer_client_id: tc.id, gym_id: tc.gym_id, label, sessions_total: n, start_date: start, end_date: end, price: pr, sold_by: profile!.id,
    });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onClose(`ขายแพ็กเกจ ${label} · ${baht(pr)} แล้ว`);
  }

  return (
    <Card>
      <H size={17}>ขายแพ็กเกจ PT</H>
      {err ? <Notice text={err} /> : null}
      <Chips label="จำนวนครั้ง" options={['1', '5', '10', '20', '30'].map(v => ({ v, t: `${v} ครั้ง` }))} value={sessions} onChange={setSessions} />
      <Field label="หรือพิมพ์จำนวนครั้ง" value={sessions} onChangeText={v => setSessions(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      <Chips label="ใช้ภายใน" options={[0, 1, 2, 3, 6, 12].map(m => ({ v: m, t: m ? `${m} เดือน` : 'ไม่หมดอายุ' }))} value={months} onChange={setMonths} />
      <DateField label="เริ่มนับวันที่" value={start} onChange={setStart} hint="เลยวันหมดยังนัดได้ ระบบแค่เตือนว่าเกินกำหนด" />
      <Field label="ราคา (บาท)" value={price} onChangeText={v => setPrice(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
      <Btn label="บันทึกการขาย" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onClose()} />
    </Card>
  );
}

function GoalForm({ tc, onClose }: { tc: TC; onClose: (msg?: string) => void }) {
  const [goal, setGoal] = useState(tc.goal ?? '');
  const [err, setErr] = useState('');
  async function save() {
    const { error } = await supabase.from('trainer_clients').update({ goal: goal.trim() || null }).eq('id', tc.id);
    if (error) { setErr(thError(error)); return; }
    onClose('บันทึกเป้าหมายแล้ว');
  }
  return (
    <Card>
      {err ? <Notice text={err} /> : null}
      <Field label="เป้าหมาย" value={goal} onChangeText={setGoal} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
      <Btn label="บันทึก" onPress={save} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onClose()} />
    </Card>
  );
}

/** A package with sessions left; open it to add/remove sessions or extend the end date (a reason is required) */
function PkgRow({ p, canManage, onDone }: { p: Pkg; canManage: boolean; onDone: (t: string, ok: boolean) => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'bonus' | 'adjust' | 'extend'>('bonus');
  const [n, setN] = useState('1');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const overdue = p.days_overdue && p.days_overdue > 0;

  async function save() {
    const v = Number(n);
    if (!v || v < 1) { onDone('ใส่จำนวนเป็นตัวเลข', false); return; }
    if (!reason.trim()) { onDone('ต้องใส่เหตุผลทุกครั้งที่แก้ไข', false); return; }
    setBusy(true);
    let error;
    if (kind === 'extend') {
      const base = p.end_date ?? todayISO();
      const r1 = await supabase.from('pt_packages').update({ end_date: addDays(base, v) }).eq('id', p.id);
      error = r1.error;
      if (!error) error = (await supabase.from('pt_package_ledger').insert({ package_id: p.id, delta: 0, kind: 'extend', extend_days: v, reason: reason.trim(), by_user: profile!.id })).error;
    } else {
      error = (await supabase.from('pt_package_ledger').insert({ package_id: p.id, delta: kind === 'bonus' ? v : -v, kind, reason: reason.trim(), by_user: profile!.id })).error;
    }
    setBusy(false);
    if (error) { onDone(thError(error), false); return; }
    setOpen(false); setReason('');
    onDone(kind === 'extend' ? `ขยายวันหมด ${v} วันแล้ว` : kind === 'bonus' ? `เพิ่ม ${v} ครั้งแล้ว` : `หัก ${v} ครั้งแล้ว`, true);
  }

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt bold>{p.label}</Txt>
          <Txt muted size={12.5}>{thDate(p.start_date)}{p.end_date ? ` – ${thDate(p.end_date)}` : ' · ไม่หมดอายุ'} · {baht(p.price)}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Txt bold>{p.sessions_left}/{p.sessions_total}</Txt>
          {overdue && p.sessions_left > 0 ? <Pill text={`เกินกำหนด ${p.days_overdue} วัน`} kind="warn" /> : p.sessions_left <= 0 ? <Pill text="ใช้ครบ" kind="mute" /> : null}
        </View>
        {canManage ? <Txt muted accessibilityRole="button" accessibilityLabel="แก้แพ็กเกจนี้" onPress={() => setOpen(!open)} style={{ padding: 6 }}>{open ? 'ปิด' : 'แก้'}</Txt> : null}
      </View>
      {open ? (
        <View style={{ gap: 10, backgroundColor: C.surface2, borderRadius: 12, padding: 10 }}>
          <Chips options={[{ v: 'bonus', t: 'เพิ่มครั้ง' }, { v: 'adjust', t: 'หักครั้ง' }, { v: 'extend', t: 'ขยายวันหมด' }]} value={kind} onChange={setKind} />
          <Field label={kind === 'extend' ? 'จำนวนวัน' : 'จำนวนครั้ง'} value={n} onChangeText={v => setN(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          <Field label="เหตุผล (จำเป็น)" value={reason} onChangeText={setReason} placeholder="เช่น แถมโปรโมชัน / ลูกเทรนป่วย" />
          <Btn label="บันทึก" onPress={save} loading={busy} />
        </View>
      ) : null}
    </View>
  );
}
