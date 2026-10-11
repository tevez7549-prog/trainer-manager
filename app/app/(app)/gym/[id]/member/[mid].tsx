import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../../src/lib/supabase';
import { useAuth } from '../../../../../src/lib/auth';
import { baht, gymCountry, isDesk, isManager, PAY_TH, thDate, thDateTs, thTime, type Plan, useGym } from '../../../../../src/lib/gym';
import { enqueue, liveStatus, STATUS_TH, type Member } from '../../../../../src/lib/counter';
import { phoneError, prettyPhone, splitE164, toE164, type Country } from '../../../../../src/lib/phone';
import { Btn, Card, ConfirmBtn, Field, H, Header, Notice, Pill, Screen, Toggle, Txt } from '../../../../../src/ui';
import { PhoneField } from '../../../../../src/ui/PhoneField';
import { expiryText } from '../../../../../src/ui/MemberRow';
import { newSale, saleError, sell, SellForm, type Sale } from '../../../../../src/ui/SellForm';
import { C } from '../../../../../src/lib/theme';
import { sessionsLeft } from '../../../../../src/lib/trainer';
import { Chips, Row } from '../../../../../src/ui';

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
  const [mode, setMode] = useState<'' | 'sell' | 'edit'>(sellParam ? 'sell' : '');
  const [sale, setSale] = useState<Sale>(newSale());
  const [busy, setBusy] = useState(false);
  const [openMs, setOpenMs] = useState<string | null>(null);

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

  if (err) return <Screen><Header title="สมาชิก" back={() => router.replace(`/gym/${id}/members` as any)} /><Notice text={err} /></Screen>;
  if (!m) return <Screen><Header title="สมาชิก" back={() => router.back()} /><Txt muted>กำลังโหลด…</Txt></Screen>;
  const st = STATUS_TH[m.status];
  const desk = isDesk(role), mgr = isManager(role);
  const canCheckIn = m.status === 'active' || m.status === 'expiring' || m.status === 'pt_only';

  return (
    <Screen>
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
        <Txt muted size={12.5}>{m.profile_id ? '✓ เชื่อมกับบัญชีแอปแล้ว' : 'ยังไม่ได้ใช้แอป · ถ้าสมัครแอปด้วยเบอร์นี้ จะเชื่อมให้เอง'}{m.imported ? ' · นำเข้าจาก Excel' : ''}</Txt>
      </Card>

      {desk && mode === '' ? (
        <View style={{ gap: 10 }}>
          {canCheckIn ? <Btn label="เช็กอินวันนี้" onPress={checkIn} /> : null}
          <Btn kind={canCheckIn ? 'ghost' : 'primary'} label={m.end_date ? 'ต่ออายุ / ขายแพ็กเกจ' : 'ขายแพ็กเกจ'} onPress={() => setMode('sell')} />
          <Btn kind="ghost" label="แก้ไขข้อมูล" onPress={() => setMode('edit')} />
        </View>
      ) : null}

      {mode === 'sell' ? (
        <Card>
          <H size={17}>{m.end_date ? 'ต่ออายุ / ขายแพ็กเกจ' : 'ขายแพ็กเกจ'}</H>
          <SellForm gymId={id} plans={plans} value={sale} onChange={setSale} currentEnd={m.end_date} />
          <Btn label="ยืนยันการขาย" onPress={doSell} loading={busy} />
          <Btn kind="ghost" label="ยกเลิก" onPress={() => setMode('')} />
        </Card>
      ) : null}

      {mode === 'edit' && gym ? <EditMember m={m} country={gymCountry(gym)} onDone={(t) => { setMode(''); if (t) setMsg({ t, ok: true }); load(); }} /> : null}

      {desk ? <MemberPT gymId={id} m={m} manager={mgr} /> : null}

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
    </Screen>
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
type GymTrainer = { user_id: string; profile: { display_name: string } | null };

/** Trainers this member trains with at this gym; owner/admin can assign one */
function MemberPT({ gymId, m, manager }: { gymId: string; m: Member; manager: boolean }) {
  const [links, setLinks] = useState<PtLink[]>([]);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [trainers, setTrainers] = useState<GymTrainer[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [l, t] = await Promise.all([
      supabase.from('trainer_clients').select('id,trainer_id,trainer:profiles!trainer_clients_trainer_id_fkey(display_name)').eq('member_id', m.id).eq('status', 'active'),
      supabase.from('gym_staff').select('user_id,profile:profiles(display_name)').eq('gym_id', gymId).eq('role', 'trainer').eq('active', true),
    ]);
    const ls = ((l.data as any) ?? []) as PtLink[];
    setLinks(ls); setTrainers(((t.data as any) ?? []) as GymTrainer[]);
    setLeft(await sessionsLeft(ls.map(x => x.id)));
  }, [gymId, m.id]);
  useEffect(() => { load(); }, [load]);

  async function assign() {
    if (!pick) { setErr('เลือกเทรนเนอร์'); return; }
    const { error } = await supabase.from('trainer_clients').insert({ trainer_id: pick, member_id: m.id, client_id: m.profile_id, gym_id: gymId });
    if (error) { setErr(thError(error)); return; }
    setOpen(false); setPick(null); setErr(''); load();
  }

  const free = trainers.filter(t => !links.some(l => l.trainer_id === t.user_id));
  return (
    <Card style={{ gap: 4 }}>
      <H size={17}>เทรน PT</H>
      {err ? <Notice text={err} /> : null}
      {!links.length ? <Txt muted>ยังไม่มีเทรนเนอร์</Txt> : null}
      {links.map(l => (
        <Row key={l.id} title={l.trainer?.display_name ?? 'เทรนเนอร์'} sub="ดูนัดและแพ็กเกจ PT"
          right={<Pill text={`เหลือ ${left[l.id] ?? 0} ครั้ง`} kind={(left[l.id] ?? 0) === 0 ? 'bad' : 'ok'} />}
          onPress={() => router.push(`/trainer/client/${l.id}` as any)} />
      ))}
      {manager && !open ? <Btn kind="ghost" label="+ มอบหมายเทรนเนอร์" onPress={() => setOpen(true)} /> : null}
      {manager && open ? (
        <View style={{ gap: 10 }}>
          {free.length
            ? <Chips label="เทรนเนอร์ของยิม" options={free.map(t => ({ v: t.user_id, t: t.profile?.display_name ?? 'เทรนเนอร์' }))} value={pick} onChange={setPick} />
            : <Txt muted size={13}>ยังไม่มีเทรนเนอร์ในทีม เพิ่มได้ที่เมนู ทีมงาน (ตำแหน่ง เทรนเนอร์)</Txt>}
          {free.length ? <Btn label="มอบหมาย" onPress={assign} /> : null}
          <Btn kind="ghost" label="ยกเลิก" onPress={() => setOpen(false)} />
        </View>
      ) : null}
    </Card>
  );
}
