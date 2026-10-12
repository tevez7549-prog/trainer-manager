import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/lib/auth';
import { addDays, baht, isoDate, thDate, thDateTs, todayISO } from '../../../../src/lib/gym';
import {
  APPT_COLS, apptRange, dayLabel, DURATIONS, gymChoice, inLeave, useMyGyms, overlaps, TC_COLS, tcName, tcPhone, toTs,
  type Appt, type Leave, type Pkg, type TC,
} from '../../../../src/lib/trainer';
import { Btn, Card, Chips, ConfirmBtn, DateField, Field, H, Header, Notice, Pill, Screen, TimeField, Toggle, Txt } from '../../../../src/ui';
import { ApptCard } from '../../../../src/ui/Appt';
import { WeekGrid } from '../../../../src/ui/WeekGrid';
import { TraineeHealth } from '../../../../src/ui/TraineeHealth';
import { C } from '../../../../src/lib/theme';

type Ledger = { id: string; package_id: string; delta: number; kind: string; reason: string | null; extend_days: number | null; at: string };
const KIND_TH: Record<string, string> = { session: 'มาเทรน', noshow: 'ไม่มา (หัก)', bonus: 'แถม', refund: 'คืนเงิน', adjust: 'ปรับ', extend: 'ขยายวันหมด', import: 'นำเข้า' };
type Panel = '' | 'book' | 'sell' | 'goal' | 'move';

export default function ClientPage() {
  const { tcid } = useLocalSearchParams<{ tcid: string }>();
  const { profile } = useAuth();
  const [tc, setTc] = useState<TC | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [mgr, setMgr] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [panel, setPanel] = useState<Panel>('');
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    const t = await supabase.from('trainer_clients').select(TC_COLS).eq('id', tcid).maybeSingle();
    if (t.error || !t.data) { setErr('ไม่พบคนนี้ หรือคุณไม่มีสิทธิ์ดู'); return; }
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
    setMgr(!!x.gym_id && (r === 'owner' || r === 'admin' || !!profile?.is_super_admin));
  }, [tcid, profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (err) return <Screen><Header title="คนที่ฉันดูแล" back={() => router.replace('/groups' as any)} /><Notice text={err} /></Screen>;
  if (!tc) return <Screen><Header title="คนที่ฉันดูแล" back={() => router.back()} /><Txt muted>กำลังโหลด…</Txt></Screen>;

  // scheduled ones from the last 12 hours count as upcoming, so today's session can still be marked
  const upcoming = appts.filter(a => a.status === 'scheduled' && new Date(a.starts_at).getTime() > Date.now() - 12 * 3600000).reverse();
  const past = appts.filter(a => !upcoming.includes(a));
  const totalLeft = pkgs.reduce((s, p) => s + Math.max(0, p.sessions_left), 0);
  const done = (t: string, ok: boolean) => { setMsg({ t, ok }); load(); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/groups' as any));

  async function cancelAll() {
    const ids = upcoming.filter(a => new Date(a.starts_at).getTime() > Date.now()).map(a => a.id);
    if (!ids.length) return;
    const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).in('id', ids).eq('status', 'scheduled');
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    done(`ยกเลิก ${ids.length} นัดแล้ว · ไม่หักครั้ง`, true);
  }

  async function remove() {
    const { error } = await supabase.from('trainer_clients').update({ status: 'removed', removed_at: new Date().toISOString() }).eq('id', tcid);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    router.replace('/groups' as any);
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
          <Btn icon="calendar" label="นัดเทรน" onPress={() => setPanel('book')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {!tc.gym_id ? <Btn kind="ghost" icon="receipt" label="ขายแพ็กเกจ PT" onPress={() => setPanel('sell')} style={{ flex: 1 }} /> : null}
            <Btn kind="ghost" icon="pencil" label="แก้เป้าหมาย" onPress={() => setPanel('goal')} style={{ flex: 1 }} />
          </View>
          {mgr ? <Btn kind="ghost" icon="refresh-cw" label="ย้ายไปเทรนเนอร์คนอื่น" onPress={() => setPanel('move')} /> : null}
          {tc.gym_id ? <Txt muted size={13}>ซื้อ PT เพิ่ม: ขายที่หน้าสมาชิกของยิม (ขาย / ต่ออายุ › PT)</Txt> : null}
        </View>
      ) : null}
      {panel === 'book' ? <BookForm tc={tc} leaves={leaves} left={Math.max(0, totalLeft - upcoming.length)} onClose={(t) => { setPanel(''); if (t) done(t, true); }} /> : null}
      {panel === 'sell' ? <SellPkgForm tc={tc} onClose={(t) => { setPanel(''); if (t) done(t, true); }} /> : null}
      {panel === 'move' ? <MoveForm tc={tc} onClose={(t, id) => { setPanel(''); if (t) { done(t, true); if (id && id !== tc.id) router.replace(`/trainer/client/${id}` as any); } }} /> : null}
      {panel === 'goal' ? <GoalForm tc={tc} onClose={(t) => { setPanel(''); if (t) done(t, true); }} /> : null}

      {canManage ? <TraineeHealth clientId={tc.client_id ?? tc.member?.profile_id ?? null} tcId={tc.id} name={tcName(tc)} /> : null}

      <Card style={{ gap: 2 }}>
        <H size={17}>นัดที่จะถึง ({upcoming.length})</H>
        {!upcoming.length ? <Txt muted>ยังไม่มีนัด</Txt> : null}
        {upcoming.map(a => <ApptCard key={a.id} a={a} showName={false} showDay canManage={canManage} onLeave={inLeave(a.starts_at, leaves)} onDone={done} />)}
        {canManage && upcoming.length > 1 ? (
          <ConfirmBtn label={`ยกเลิกนัดที่จะถึงทั้งหมด (${upcoming.length})`} confirmLabel={`กดอีกครั้ง: ยกเลิก ${upcoming.length} นัด (ไม่หักครั้ง)`} onConfirm={cancelAll} />
        ) : null}
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
        <ConfirmBtn label="เลิกดูแลคนนี้" confirmLabel="กดอีกครั้ง: ลบออกจากรายชื่อ (บัญชีและประวัติของเขายังอยู่)" onConfirm={remove} />
      ) : null}
    </Screen>
  );
}

const WD_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
type Until = 'left' | 4 | 8 | 12;

/** Book one session, or a weekly routine (e.g. Mon/Wed/Fri) where each day can have its own time */
function BookForm({ tc, leaves, left, onClose }: { tc: TC; leaves: Leave[]; left: number; onClose: (msg?: string) => void }) {
  const [mode, setMode] = useState<'once' | 'weekly'>('once');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('18:00');
  const [days, setDays] = useState<Record<number, string>>({});   // weekday -> "HH:MM"
  const [until, setUntil] = useState<Until>(left > 0 ? 'left' : 4);
  const [dur, setDur] = useState<number>(60);
  const [note, setNote] = useState('');
  const [taken, setTaken] = useState<{ starts_at: string; duration_min: number }[]>([]);
  const [keepClash, setKeepClash] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // the trainer's other sessions for the next 6 months, to flag clashes as the plan is built
  useEffect(() => {
    const to = new Date(Date.now() + 186 * 86400000).toISOString();
    supabase.from('appointments').select('starts_at,duration_min').eq('trainer_id', tc.trainer_id).neq('status', 'cancelled')
      .gte('starts_at', new Date(Date.now() - 3 * 3600000).toISOString()).lt('starts_at', to)
      .then(({ data }) => setTaken((data as any[]) ?? []));
  }, [tc.trainer_id]);

  const toggleDay = (d: number) => setDays(x => {
    const n = { ...x };
    if (d in n) delete n[d]; else n[d] = Object.values(x).slice(-1)[0] ?? time;
    return n;
  });

  // the sessions this form would create
  const plan = (() => {
    const out: string[] = [];
    if (mode === 'once') { if (/^\d{2}:\d{2}$/.test(time)) out.push(toTs(date, time)); return out; }
    const picked = Object.keys(days).map(Number);
    if (!picked.length) return out;
    const max = until === 'left' ? Math.max(left, 0) : until * picked.length;
    const now = Date.now();
    for (let i = 0; i < 26 * 7 && out.length < Math.min(max, 60); i++) {
      const d = addDays(date, i);
      const wd = new Date(d + 'T00:00:00').getDay();
      const t = days[wd];
      if (t === undefined || !/^\d{2}:\d{2}$/.test(t)) continue;
      const ts = toTs(d, t);
      if (new Date(ts).getTime() > now) out.push(ts);
    }
    return out;
  })();
  const clashOf = (s: string) => taken.some(o => overlaps(s, dur, o.starts_at, o.duration_min)) ? 'ชนนัดอื่น' : inLeave(s, leaves) ? 'วันลา' : '';
  const rows = plan.map(s => ({ s, clash: clashOf(s) }));
  const clashes = rows.filter(r => r.clash).length;
  const toBook = rows.filter(r => keepClash || !r.clash).map(r => r.s);

  async function save() {
    if (!toBook.length) { setErr(mode === 'weekly' && !Object.keys(days).length ? 'เลือกวันในสัปดาห์' : 'ไม่มีนัดให้บันทึก'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.from('appointments').insert(toBook.map(s => ({
      trainer_id: tc.trainer_id, trainer_client_id: tc.id, gym_id: tc.gym_id, starts_at: s, duration_min: dur, note: note.trim() || null,
    })));
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onClose(toBook.length > 1
      ? `นัด ${toBook.length} ครั้งแล้ว · ${dayLabel(toBook[0])} ถึง ${dayLabel(toBook[toBook.length - 1])}${clashes && !keepClash ? ` · ข้าม ${clashes} ครั้งที่ชน` : ''}`
      : `นัดแล้ว ${dayLabel(toBook[0])} ${apptRange({ starts_at: toBook[0], duration_min: dur })}`);
  }

  const hhmm = (s: string) => apptRange({ starts_at: s, duration_min: dur }).split('–')[0];
  return (
    <Card>
      <H size={17}>นัดเทรน</H>
      {err ? <Notice text={err} /> : null}
      <Chips options={[{ v: 'once', t: 'ครั้งเดียว' }, { v: 'weekly', t: 'ประจำทุกสัปดาห์' }]} value={mode} onChange={v => { setMode(v); setErr(''); }} />

      {mode === 'once' ? <>
        <Btn kind="ghost" icon="calendar" label={showGrid ? 'ซ่อนตารางว่าง' : 'เลือกจากตารางว่าง'} onPress={() => setShowGrid(!showGrid)} />
        {showGrid ? <WeekGrid trainerId={tc.trainer_id} onPick={(d, t) => { setDate(d); setTime(t); }} /> : null}
        <DateField label="วันที่" value={date} onChange={setDate} min={todayISO()} />
        <TimeField label="เวลาเริ่ม" value={time} onChange={setTime} />
      </> : <>
        <View style={{ gap: 8 }}>
          <Txt bold size={14}>วันไหนบ้าง</Txt>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {WD_ORDER.map(d => {
              const on = d in days;
              return (
                <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={WD_TH[d]} onPress={() => toggleDay(d)}
                  style={{ flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
                    borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface2 }}>
                  <Txt bold style={{ color: on ? C.accent : C.fg }}>{WD_TH[d]}</Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
        {WD_ORDER.filter(d => d in days).map(d => (
          <View key={d} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <Txt bold style={{ width: 36, paddingBottom: 12 }}>{WD_TH[d]}.</Txt>
            <View style={{ flex: 1, minWidth: 0 }}><TimeField label={`เวลาวัน${WD_TH[d]}`} value={days[d]} onChange={v => setDays(x => ({ ...x, [d]: v }))} /></View>
          </View>
        ))}
        <DateField label="เริ่มตั้งแต่" value={date} onChange={setDate} min={todayISO()} />
        <Chips label="นัดไปจนถึง" value={until} onChange={setUntil}
          options={[...(left > 0 ? [{ v: 'left' as Until, t: `ครั้งที่เหลือหมด (${left})` }] : []), { v: 4 as Until, t: '4 สัปดาห์' }, { v: 8 as Until, t: '8 สัปดาห์' }, { v: 12 as Until, t: '12 สัปดาห์' }]} />
      </>}

      <Chips label="ระยะเวลา" options={DURATIONS.map(d => ({ v: d as number, t: `${d} นาที` }))} value={dur} onChange={setDur} />
      <Field label="หมายเหตุ (ไม่บังคับ)" value={note} onChangeText={setNote} placeholder="เช่น ขา / อก-หลัง" />

      {mode === 'weekly' && rows.length ? (
        <View style={{ gap: 4, padding: 12, borderRadius: 12, backgroundColor: C.surface2 }}>
          <Txt bold>จะนัด {toBook.length} ครั้ง{clashes ? ` · ชน ${clashes}` : ''}</Txt>
          {rows.slice(0, 12).map(r => (
            <Txt key={r.s} size={14} style={{ color: r.clash ? C.warnFg : C.fg }}>
              {dayLabel(r.s)} {hhmm(r.s)}{r.clash ? ` · ${r.clash}${keepClash ? '' : ' (ข้าม)'}` : ''}
            </Txt>
          ))}
          {rows.length > 12 ? <Txt muted size={13}>และอีก {rows.length - 12} ครั้ง</Txt> : null}
        </View>
      ) : null}
      {mode === 'once' && rows[0]?.clash ? <Notice kind="warn" text={`เวลานี้${rows[0].clash === 'วันลา' ? 'ตรงกับวันลา' : 'ชนกับนัดอื่น'}`} /> : null}
      {clashes ? <Toggle label="นัดตัวที่ชนด้วย" value={keepClash} onChange={setKeepClash} /> : null}

      <Btn label={toBook.length > 1 ? `บันทึก ${toBook.length} นัด` : 'บันทึกนัด'} onPress={save} loading={busy} />
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
  const { profile } = useAuth();
  const mine = tc.trainer_id === profile?.id;
  const gyms = useMyGyms(mine ? profile?.id : null);
  const [goal, setGoal] = useState(tc.goal ?? '');
  const [gym, setGym] = useState(tc.gym_id ?? '');
  const [err, setErr] = useState('');
  async function save() {
    const row: Record<string, unknown> = { goal: goal.trim() || null };
    if (mine && !tc.member_id) row.gym_id = gym || null;
    const { error } = await supabase.from('trainer_clients').update(row).eq('id', tc.id);
    if (error) { setErr(thError(error)); return; }
    onClose('บันทึกแล้ว');
  }
  return (
    <Card>
      {err ? <Notice text={err} /> : null}
      <Field label="เป้าหมาย" value={goal} onChangeText={setGoal} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
      {mine && !tc.member_id && gyms.length ? <>
        <Chips label="ลูกเทรนของ" options={gymChoice(gyms)} value={gym} onChange={setGym} />
        <Txt muted size={12.5}>เลือกยิม = เจ้าของและผู้จัดการ ของยิมนั้นเห็นลูกเทรนคนนี้ นัด และครั้งที่เหลือ · ส่วนตัว = เห็นแค่คุณ</Txt>
      </> : null}
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

type GymTrainer = { user_id: string; role: string; profile: { display_name: string } | null };

/** Owner / manager: hand this trainee to another trainer. Sessions left and future appointments go along. */
function MoveForm({ tc, onClose }: { tc: TC; onClose: (msg?: string, id?: string) => void }) {
  const { profile } = useAuth();
  const [list, setList] = useState<GymTrainer[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('gym_staff').select('user_id,role,profile:profiles(display_name)').eq('gym_id', tc.gym_id!).eq('active', true).in('role', ['trainer', 'owner', 'admin'])
      .then(({ data }) => setList((((data as any) ?? []) as GymTrainer[]).filter(t => t.user_id !== tc.trainer_id)));
  }, [tc.gym_id, tc.trainer_id]);
  const nameOf = (t: GymTrainer) => (t.user_id === profile?.id ? 'คุณ' : t.profile?.display_name ?? 'เทรนเนอร์');

  async function go() {
    if (!pick) { setErr('เลือกเทรนเนอร์'); return; }
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('move_trainee', { tc: tc.id, new_trainer: pick });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    const r = data as { trainer_client_id: string; future_appointments: number };
    const who = nameOf(list!.find(t => t.user_id === pick)!);
    onClose(`ย้ายไปให้ ${who} แล้ว${r.future_appointments ? ` · นัดที่จะถึง ${r.future_appointments} นัดย้ายไปด้วย` : ''}`, r.trainer_client_id);
  }

  return (
    <Card>
      <H size={17}>ย้ายไปเทรนเนอร์คนอื่น</H>
      {err ? <Notice text={err} /> : null}
      {list === null ? <Txt muted>กำลังโหลด…</Txt> : !list.length ? <Txt muted>ยังไม่มีเทรนเนอร์คนอื่นในทีม เพิ่มได้ที่ เพิ่มเติม › ทีมงาน</Txt>
        : <Chips label="ย้ายไปให้" options={list.map(t => ({ v: t.user_id, t: nameOf(t) }))} value={pick} onChange={setPick} />}
      <Txt muted size={13}>ครั้งที่เหลือและนัดที่จะถึงย้ายไปด้วย · ครั้งที่เทรนไปแล้วยังนับเป็นของเทรนเนอร์คนเดิม</Txt>
      {list?.length ? <Btn label="ยืนยันการย้าย" onPress={go} loading={busy} /> : null}
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onClose()} />
    </Card>
  );
}
