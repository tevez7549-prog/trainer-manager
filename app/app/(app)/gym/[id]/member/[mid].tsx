import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../../src/lib/supabase';
import { useAuth } from '../../../../../src/lib/auth';
import { addDays, baht, daysBetween, gymCountry, todayISO, isDesk, isManager, PAY_TH, thDate, thDateTs, thTime, type Plan, type PtPlan, useGym } from '../../../../../src/lib/gym';
import { enqueue, liveStatus, STATUS_TH, type Member } from '../../../../../src/lib/counter';
import { phoneError, prettyPhone, splitE164, toE164, type Country } from '../../../../../src/lib/phone';
import { Btn, Card, ConfirmBtn, Field, H, Header, Notice, Pill, Screen, Toggle, Txt } from '../../../../../src/ui';
import { PhoneField } from '../../../../../src/ui/PhoneField';
import { expiryText } from '../../../../../src/ui/MemberRow';
import { newSale, saleError, sell, SellForm, type Sale } from '../../../../../src/ui/SellForm';
import { C } from '../../../../../src/lib/theme';
import { sessionsLeft } from '../../../../../src/lib/trainer';
import { Chips, DateField, Row } from '../../../../../src/ui';
import { GymFrame } from '../../../../../src/ui/GymFrame';

type Ms = { id: string; plan_name: string; start_date: string; end_date: string; price: number; pay_method: string | null; created_at: string };
type Ci = { id: string; checked_at: string; kind: string };
const COLS = 'id,gym_id,profile_id,code,name,phone,phone_norm,pt_only,plan_name,start_date,end_date,frozen_until,status,days_left,note,imported,created_at';

export default function MemberPage() {
  const { id, mid, sell: sellParam } = useLocalSearchParams<{ id: string; mid: string; sell?: string }>();
  const { profile } = useAuth();
  const { gym, role } = useGym(id);
  const [m, setM] = useState<Member | null>(null);
  const [ms, setMs] = useState<Ms[]>([]);
  const [ci, setCi] = useState<Ci[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [mode, setMode] = useState<'' | 'sell' | 'edit' | 'freeze'>(sellParam ? 'sell' : '');
  const [sale, setSale] = useState<Sale>(newSale());
  const [busy, setBusy] = useState(false);
  const [openMs, setOpenMs] = useState<string | null>(null);
  const [sellKind, setSellKind] = useState<'mem' | 'pt'>(sellParam === 'pt' ? 'pt' : 'mem');
  const [ptKey, setPtKey] = useState(0);

  const load = useCallback(async () => {
    const [a, b, c, p] = await Promise.all([
      supabase.from('member_status').select(COLS).eq('id', mid).maybeSingle(),
      supabase.from('memberships').select('id,plan_name,start_date,end_date,price,pay_method,created_at').eq('member_id', mid).order('end_date', { ascending: false }),
      supabase.from('checkins').select('id,checked_at,kind').eq('member_id', mid).order('checked_at', { ascending: false }).limit(30),
      supabase.from('membership_plans').select('*').eq('gym_id', id).eq('active', true).order('sort'),
    ]);
    if (a.error || !a.data) { setErr('ไม่พบสมาชิกนี้ หรือคุณไม่มีสิทธิ์ดู'); return; }
    setM(liveStatus(a.data as Member)); setMs((b.data as Ms[]) ?? []); setCi((c.data as Ci[]) ?? []); setPlans((p.data as Plan[]) ?? []);
  }, [id, mid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function doSell() {
    const e = saleError(sale); if (e) { setMsg({ t: e, ok: false }); return; }
    setBusy(true);
    const { data, error } = await sell(mid, sale);
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    const r = data as any;
    setMsg({ t: `ขาย ${r.plan_name} แล้ว · ${thDate(r.start_date)} – ${thDate(r.end_date)}`, ok: true });
    setMode(''); setSale(newSale()); load();
  }

  async function checkIn() {
    if (!m) return;
    await enqueue({ type: 'checkin', gym_id: id, member_id: m.id, member_name: m.name, kind: m.status === 'pt_only' ? 'pt' : 'member', by: profile!.id });
    setMsg({ t: `✓ เช็กอิน ${m.name} แล้ว`, ok: true });
    setTimeout(load, 1500);
  }

  async function delMs(x: Ms) {
    const { error } = await supabase.from('memberships').delete().eq('id', x.id);
    if (error) setMsg({ t: thError(error), ok: false }); else { setOpenMs(null); load(); }
  }

  async function delMember() {
    const { error } = await supabase.from('members').delete().eq('id', mid);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    router.replace(`/gym/${id}/members` as any);
  }

  if (err) return <GymFrame id={id} gym={gym} role={role} active="members"><Header title="สมาชิก" back={() => router.replace(`/gym/${id}/members` as any)} /><Notice text={err} /></GymFrame>;
  if (!m) return <GymFrame id={id} gym={gym} role={role} active="members"><Header title="สมาชิก" back={() => router.back()} /><Txt muted>กำลังโหลด…</Txt></GymFrame>;
  const st = STATUS_TH[m.status];
  const desk = isDesk(role), mgr = isManager(role);
  const canCheckIn = m.status === 'active' || m.status === 'expiring' || m.status === 'pt_only';

  return (
    <GymFrame id={id} gym={gym} role={role} active="members">
      <Header title={m.name} sub={`${m.code}${gym ? ' · ' + gym.name : ''}`} back={() => (router.canGoBack() ? router.back() : router.replace(`/gym/${id}/members` as any))} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pill text={st.t} kind={st.k} />
          {m.plan_name && m.status !== 'pt_only' ? <Txt bold>{m.plan_name}</Txt> : null}
        </View>
        {expiryText(m) ? <Txt>{expiryText(m)}</Txt> : null}
        {m.phone_norm || m.phone ? <Txt muted>โทร {prettyPhone(m.phone_norm ?? m.phone)}</Txt> : <Txt muted>ไม่มีเบอร์โทร</Txt>}
        {m.note ? <Txt muted>หมายเหตุ: {m.note}</Txt> : null}
        <Txt muted size={12.5}>{m.profile_id ? '✓ ใช้แอปแล้ว · เห็นบัตร นัด PT และบันทึกของตัวเองในแอป' : 'ยังไม่ได้เชื่อมกับแอป · ถ้าเขาใช้แอปด้วยเบอร์นี้ จะเชื่อมให้เอง'}{m.imported ? ' · นำเข้าจาก Excel' : ''}</Txt>
        {!m.profile_id && desk ? <LinkUid mid={m.id} onDone={(t) => { setMsg({ t, ok: true }); load(); }} /> : null}
      </Card>

      {desk ? <MemberPT m={m} reloadKey={ptKey} /> : null}

      {desk && mode === '' ? (
        <View style={{ gap: 10 }}>
          <Btn icon="receipt" label="ขาย / ต่ออายุ" onPress={() => setMode('sell')} />
          {canCheckIn ? <Btn kind="ghost" icon="circle-check" label="เช็กอินวันนี้" onPress={checkIn} /> : null}
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {m.end_date && m.end_date >= todayISO() && !m.pt_only ? <Row ic="pause" title="พักสมาชิก" onPress={() => setMode('freeze')} /> : null}
            <Row ic="pencil" title="แก้ไขข้อมูล" onPress={() => setMode('edit')} />
          </Card>
        </View>
      ) : null}

      {mode === 'sell' ? (
        <Card>
          <H size={17}>ขายให้ {m.name}</H>
          <Chips options={[{ v: 'mem', t: 'สมาชิกยิม' }, { v: 'pt', t: 'PT' }]} value={sellKind} onChange={setSellKind} />
          {sellKind === 'mem' ? <>
            <SellForm gymId={id} plans={plans} value={sale} onChange={setSale} currentEnd={m.end_date} />
            <Btn label="ยืนยันการขาย" onPress={doSell} loading={busy} />
          </> : <PtSell gymId={id} m={m} onDone={(t) => { setMsg({ t, ok: true }); setMode(''); setPtKey(k => k + 1); }} />}
          <Btn kind="ghost" label="ยกเลิก" onPress={() => setMode('')} />
        </Card>
      ) : null}

      {mode === 'edit' && gym ? <EditMember m={m} country={gymCountry(gym)} onDone={(t) => { setMode(''); if (t) setMsg({ t, ok: true }); load(); }} /> : null}

      {mode === 'freeze' ? <FreezeForm m={m} onDone={(t) => { setMode(''); if (t) setMsg({ t, ok: true }); load(); }} /> : null}
      {desk ? <Freezes m={m} onDone={(t, ok) => { setMsg({ t, ok }); load(); }} /> : null}

      <Card style={{ gap: 4 }}>
        <H size={17}>ประวัติแพ็กเกจ ({ms.length})</H>
        {!ms.length ? <Txt muted>ยังไม่มี</Txt> : null}
        {ms.map(x => (
          <View key={x.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line, gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt bold>{x.plan_name}</Txt>
                <Txt muted size={13}>{thDate(x.start_date)} – {thDate(x.end_date)}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt>{baht(x.price)}</Txt>
                <Txt muted size={12}>{PAY_TH[x.pay_method ?? ''] ?? ''}</Txt>
              </View>
              {mgr ? <Txt muted accessibilityRole="button" accessibilityLabel="ตัวเลือกรายการนี้" onPress={() => setOpenMs(openMs === x.id ? null : x.id)} style={{ padding: 6 }}>⋯</Txt> : null}
            </View>
            {openMs === x.id ? <ConfirmBtn label="ลบรายการนี้ (ขายผิด)" onConfirm={() => delMs(x)} /> : null}
          </View>
        ))}
      </Card>

      <Card style={{ gap: 4 }}>
        <H size={17}>เช็กอินล่าสุด</H>
        {!ci.length ? <Txt muted>ยังไม่เคยเช็กอิน</Txt> : null}
        {ci.map(x => <Txt key={x.id} size={14}>{thDateTs(x.checked_at)} · {thTime(x.checked_at)}{x.kind === 'pt' ? ' · PT' : ''}</Txt>)}
      </Card>

      {mgr ? <ConfirmBtn label="ลบสมาชิกนี้" confirmLabel="กดอีกครั้ง: ลบสมาชิกและประวัติทั้งหมด" onConfirm={delMember} /> : null}
    </GymFrame>
  );
}

function EditMember({ m, country, onDone }: { m: Member; country: Country; onDone: (msg?: string) => void }) {
  const init = m.phone_norm ? splitE164(m.phone_norm) : { country, local: m.phone ?? '' };
  const [name, setName] = useState(m.name);
  const [c, setC] = useState<Country>(init.country);
  const [phone, setPhone] = useState(init.local);
  const [note, setNote] = useState(m.note ?? '');
  const [pt, setPt] = useState(m.pt_only);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setErr(''), [name, phone]);

  async function save() {
    if (!name.trim()) { setErr('ใส่ชื่อ'); return; }
    if (phone.trim()) { const pe = phoneError(phone, c); if (pe) { setErr(pe); return; } }
    setBusy(true);
    const { error } = await supabase.from('members').update({ name: name.trim(), phone: phone.trim() ? toE164(phone, c) : null, note: note.trim() || null, pt_only: pt }).eq('id', m.id);
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone('บันทึกแล้ว');
  }

  return (
    <Card>
      <H size={17}>แก้ไขข้อมูล</H>
      {err ? <Notice text={err} /> : null}
      <Field label="ชื่อ" value={name} onChangeText={setName} />
      <PhoneField label="เบอร์โทร" country={c} onCountry={setC} value={phone} onChangeText={setPhone} />
      <Field label="หมายเหตุ" value={note} onChangeText={setNote} />
      <Toggle label="เทรน PT อย่างเดียว" value={pt} onChange={setPt} />
      <Btn label="บันทึก" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}

type PtLink = { id: string; trainer_id: string; trainer: { display_name: string } | null };
type Staff = { user_id: string; role: string; profile: { display_name: string } | null };

/** This member's PT: one row per trainer, sessions left; tap to book or mark sessions */
function MemberPT({ m, reloadKey }: { m: Member; reloadKey: number }) {
  const [links, setLinks] = useState<PtLink[]>([]);
  const [left, setLeft] = useState<Record<string, number>>({});
  const load = useCallback(async () => {
    const { data } = await supabase.from('trainer_clients').select('id,trainer_id,trainer:profiles!trainer_clients_trainer_id_fkey(display_name)').eq('member_id', m.id).eq('status', 'active');
    const ls = ((data as any) ?? []) as PtLink[];
    setLinks(ls);
    setLeft(await sessionsLeft(ls.map(x => x.id)));
  }, [m.id]);
  useEffect(() => { load(); }, [load, reloadKey]);
  if (!links.length) return null;
  return (
    <Card style={{ gap: 0, paddingVertical: 4 }}>
      {links.map(l => {
        const n = left[l.id] ?? 0;
        return (
          <Row key={l.id} ic="dumbbell" title={`PT กับ ${l.trainer?.display_name ?? 'เทรนเนอร์'}`} sub="นัดเทรน · ดูครั้งที่ใช้"
            right={<Pill text={`เหลือ ${n} ครั้ง`} kind={n === 0 ? 'bad' : n <= 2 ? 'warn' : 'ok'} />}
            onPress={() => router.push(`/trainer/client/${l.id}` as any)} />
        );
      })}
    </Card>
  );
}

/** Sell a PT plan: plan, trainer, payment */
function PtSell({ gymId, m, onDone }: { gymId: string; m: Member; onDone: (msg: string) => void }) {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<PtPlan[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const [trainer, setTrainer] = useState<string | null>(null);
  const [pay, setPay] = useState<'cash' | 'transfer' | 'qr' | 'free'>('cash');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('pt_plans').select('*').eq('gym_id', gymId).eq('active', true).order('sessions'),
      supabase.from('gym_staff').select('user_id,role,profile:profiles(display_name)').eq('gym_id', gymId).eq('active', true).in('role', ['trainer', 'owner', 'admin']),
    ]).then(([p, s]) => {
      const ps = (p.data as PtPlan[]) ?? [];
      setPlans(ps);
      if (ps[0]) { setPlan(ps[0].id); setPrice(String(ps[0].price)); }
      const st = (((s.data as any) ?? []) as Staff[]).sort((a, b) => (a.role === 'trainer' ? 0 : 1) - (b.role === 'trainer' ? 0 : 1));
      setStaff(st);
      if (st.length === 1) setTrainer(st[0].user_id);
    });
  }, [gymId]);

  const pl = (plans ?? []).find(x => x.id === plan);
  async function go() {
    if (!plan) { setErr('เลือกแพ็กเกจ'); return; }
    if (!trainer) { setErr('เลือกเทรนเนอร์'); return; }
    const p = Number(price);
    if (price === '' || Number.isNaN(p) || p < 0) { setErr('ใส่จำนวนเงินเป็นตัวเลข'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('sell_pt', { m: m.id, plan, trainer, pay, price_paid: p });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    const tn = trainer === profile?.id ? 'คุณ' : staff.find(s => s.user_id === trainer)?.profile?.display_name ?? 'เทรนเนอร์';
    onDone(`ขาย ${pl?.name ?? 'PT'} กับ ${tn} แล้ว`);
  }

  if (plans === null) return <Txt muted>กำลังโหลด…</Txt>;
  if (!plans.length) return <Notice kind="info" text="ยังไม่มีแพ็กเกจ PT · เจ้าของหรือผู้จัดการเพิ่มได้ที่ เพิ่มเติม › แพ็กเกจและราคา › PT" />;
  return <>
    {err ? <Notice text={err} /> : null}
    <Chips label="แพ็กเกจ" options={plans.map(x => ({ v: x.id, t: `${x.name} · ${baht(x.price)}` }))} value={plan}
      onChange={v => { setPlan(v); setPrice(pay === 'free' ? '0' : String(plans.find(x => x.id === v)?.price ?? '')); }} />
    {staff.length ? (
      <Chips label="เทรนเนอร์" options={staff.map(s => ({ v: s.user_id, t: s.user_id === profile?.id ? 'คุณ' : s.profile?.display_name ?? 'เทรนเนอร์' }))} value={trainer} onChange={setTrainer} />
    ) : <Notice kind="info" text="ยังไม่มีเทรนเนอร์ในทีม เพิ่มได้ที่ เพิ่มเติม › ทีมงาน" />}
    <Chips label="ชำระโดย" options={[{ v: 'cash', t: 'เงินสด' }, { v: 'transfer', t: 'โอน' }, { v: 'qr', t: 'QR' }, { v: 'free', t: 'ฟรี' }]} value={pay}
      onChange={v => { setPay(v); setPrice(v === 'free' ? '0' : price === '0' ? String(pl?.price ?? '') : price); }} />
    <Field label="รับเงิน (บาท)" value={price} onChangeText={v => setPrice(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad"
      hint={pl ? `${pl.sessions} ครั้ง${pl.months ? ` · ใช้ภายใน ${pl.months} เดือน` : ''}` : undefined} />
    <Btn label={`รับเงิน ${baht(Number(price || 0))}`} onPress={go} loading={busy} />
  </>;
}

/** Put a membership on hold: the end date moves back by the days on hold */
function FreezeForm({ m, onDone }: { m: Member; onDone: (msg?: string) => void }) {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(addDays(todayISO(), 29));
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const days = daysBetween(from, to) + 1;

  async function save() {
    if (to < from) { setErr('วันสุดท้ายต้องไม่ก่อนวันแรก'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('freeze_member', { m: m.id, start_on: from, end_on: to, why: why.trim() || null });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(`พักสมาชิก ${days} วันแล้ว · วันหมดใหม่ ${thDate((data as any)?.new_end)}`);
  }

  return (
    <Card>
      <H size={17}>พักสมาชิก</H>
      {err ? <Notice text={err} /> : null}
      <DateField label="เริ่มพัก" value={from} onChange={v => { setFrom(v); if (to < v) setTo(v); }} min={todayISO()} />
      <DateField label="พักถึง" value={to} onChange={setTo} min={from} />
      <Field label="เหตุผล (ไม่บังคับ)" value={why} onChangeText={setWhy} placeholder="เช่น บาดเจ็บ / ไปต่างประเทศ" />
      <Txt muted size={13}>พัก {days} วัน · วันหมดเลื่อนจาก {thDate(m.end_date)} เป็น {m.end_date ? thDate(addDays(m.end_date, days)) : '–'} · ระหว่างพักเช็กอินไม่ได้</Txt>
      <Btn label="ยืนยันพักสมาชิก" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}

type Fz = { id: string; start_date: string; end_date: string; reason: string | null };
function Freezes({ m, onDone }: { m: Member; onDone: (t: string, ok: boolean) => void }) {
  const [list, setList] = useState<Fz[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from('member_freezes').select('id,start_date,end_date,reason').eq('member_id', m.id).order('start_date', { ascending: false }).limit(10);
    setList((data as Fz[]) ?? []);
  }, [m.id, m.end_date]);
  useEffect(() => { load(); }, [load]);
  if (!list.length) return null;
  const t = todayISO();

  async function end(f: Fz) {
    const { data, error } = await supabase.rpc('end_freeze', { f: f.id });
    if (error) { onDone(thError(error), false); return; }
    onDone(`${f.start_date > t ? 'ยกเลิกการพัก' : 'จบการพักวันนี้'} · คืน ${(data as any)?.days ?? 0} วัน · วันหมดใหม่ ${thDate((data as any)?.new_end)}`, true);
  }

  return (
    <Card style={{ gap: 6 }}>
      <H size={17}>การพักสมาชิก</H>
      {list.map(f => (
        <View key={f.id} style={{ gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Txt>{thDate(f.start_date)} – {thDate(f.end_date)} ({daysBetween(f.start_date, f.end_date) + 1} วัน){f.reason ? ` · ${f.reason}` : ''}</Txt>
          {f.end_date >= t ? <ConfirmBtn kind="primary" label={f.start_date > t ? 'ยกเลิกการพักนี้' : 'กลับมาเล่นวันนี้ (จบการพัก)'} onConfirm={() => end(f)} /> : null}
        </View>
      ))}
    </Card>
  );
}

/** Phones didn't match (typo, new number): link the member to their app account by UID */
function LinkUid({ mid, onDone }: { mid: string; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState('');
  const [err, setErr] = useState('');
  async function go() {
    const n = Number(uid.replace(/\D/g, ''));
    if (!n) { setErr('ใส่ UID (ตัวเลข)'); return; }
    const { data, error } = await supabase.rpc('link_member_uid', { m: mid, person_uid: n });
    if (error) { setErr(thError(error)); return; }
    setOpen(false); onDone(`เชื่อมกับ ${(data as any)?.display_name || 'UID ' + n} แล้ว`);
  }
  if (!open) return <Txt size={14} style={{ color: C.accent }} onPress={() => setOpen(true)}>ใช้แอปเบอร์อื่นอยู่? เชื่อมด้วย UID</Txt>;
  return (
    <View style={{ gap: 8 }}>
      {err ? <Notice text={err} /> : null}
      <Field label="UID ของสมาชิก (หน้า ฉัน ในแอปของเขา)" value={uid} onChangeText={setUid} keyboardType="number-pad" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn label="เชื่อม" onPress={go} style={{ flex: 1 }} />
        <Btn kind="ghost" label="ยกเลิก" onPress={() => setOpen(false)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
