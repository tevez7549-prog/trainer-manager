import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { gymCountry, isManager, useGym } from '../../../../src/lib/gym';
import { phoneError, prettyPhone, toE164, type Country } from '../../../../src/lib/phone';
import { loadCoaches, type Coach } from '../../../../src/lib/coaches';
import { Btn, Card, Chips, ConfirmBtn, Empty, Field, Header, Label, Notice, Pill, Row, Txt } from '../../../../src/ui';
import { UidField } from '../../../../src/ui/UidField';
import { PhoneField } from '../../../../src/ui/PhoneField';
import { GymFrame } from '../../../../src/ui/GymFrame';
import { WeekGrid } from '../../../../src/ui/WeekGrid';

/** The gym's trainers by name (with or without the app), and each one's free time this week */
export default function Coaches() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role } = useGym(id);
  const [list, setList] = useState<Coach[] | null>(null);
  const [count, setCount] = useState<Record<string, number>>({});
  const [pick, setPick] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'uid' | 'name'>('uid');
  const [uid, setUid] = useState('');
  const [country, setCountry] = useState<Country | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const cc = country ?? gymCountry(gym);
  const can = isManager(role);

  const load = useCallback(async () => {
    const [cs, tc] = await Promise.all([
      loadCoaches(id, true),
      supabase.from('trainer_clients').select('coach_id').eq('gym_id', id).eq('status', 'active').not('coach_id', 'is', null),
    ]);
    setList(cs);
    const n: Record<string, number> = {};
    ((tc.data as { coach_id: string }[]) ?? []).forEach(r => { n[r.coach_id] = (n[r.coach_id] ?? 0) + 1; });
    setCount(n);
    setPick(p => p ?? cs.find(c => c.active)?.id ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    if (!name.trim()) { setMsg({ t: 'ใส่ชื่อเทรนเนอร์', ok: false }); return; }
    if (phone.trim()) { const e = phoneError(phone, cc); if (e) { setMsg({ t: e, ok: false }); return; } }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.from('gym_coaches')
      .insert({ gym_id: id, name: name.trim(), phone: phone.trim() ? toE164(phone, cc) : null }).select('id,profile_id').single();
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    setMsg({ t: (data as any)?.profile_id ? `เพิ่ม ${name.trim()} แล้ว · เบอร์นี้มีแอปอยู่แล้ว เขาเห็นตารางเทรนของตัวเองทันที` : `เพิ่ม ${name.trim()} แล้ว`, ok: true });
    setName(''); setPhone(''); setAdding(false); setPick((data as any)?.id ?? null); load();
  }
  async function addByUid() {
    const n = Number(uid.replace(/\D/g, ''));
    if (!n) { setMsg({ t: 'ใส่ UID (ตัวเลข) หรือกดกล้องสแกน QR', ok: false }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('gym_add_coach_uid', { g: id, person_uid: n, coach_name: name.trim() || null });
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    const d = data as { id: string; name: string; existing: boolean };
    setMsg({ t: d.existing ? `${d.name} อยู่ในรายชื่อแล้ว · เชื่อมกับแอปของเขาแล้ว เห็นตารางเทรนของตัวเองทันที` : `เพิ่ม ${d.name} แล้ว · เขาเห็นตารางเทรนของตัวเองในแอปทันที`, ok: true });
    setUid(''); setName(''); setAdding(false); setPick(d.id); load();
  }
  async function setActive(c: Coach, active: boolean) {
    const { error } = await supabase.from('gym_coaches').update({ active }).eq('id', c.id);
    setMsg(error ? { t: thError(error), ok: false } : { t: active ? `เปิดใช้ ${c.name} แล้ว` : `ปิด ${c.name} แล้ว · ลูกค้าและประวัติเดิมยังอยู่`, ok: true });
    load();
  }

  const c = (list ?? []).find(x => x.id === pick) ?? null;
  return (
    <GymFrame id={id} gym={gym} role={role} active="pt">
      <Header title="เทรนเนอร์" sub={gym?.name} back={() => (router.canGoBack() ? router.back() : router.replace(`/gym/${id}/pt` as any))} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {list === null ? <Txt muted>กำลังโหลด…</Txt> : !list.length ? (
        <Card><Empty ic="users" title="ยังไม่มีชื่อเทรนเนอร์" text="มีแอป: เพิ่มด้วย UID หรือสแกน QR หน้า ฉัน ของเขา · ไม่มีแอป: ใส่แค่ชื่อก็ได้" /></Card>
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {list.map(x => (
            <Row key={x.id} icon={x.name.slice(0, 1)} title={x.name}
              sub={[x.profile_id ? 'มีแอป · เห็นตารางตัวเอง' : 'ไม่มีแอป', x.phone ? prettyPhone(x.phone) : null, `ลูกค้า PT ${count[x.id] ?? 0} คน`].filter(Boolean).join(' · ')}
              right={!x.active ? <Pill kind="mute" text="ปิดแล้ว" /> : x.id === pick ? <Pill text="กำลังดู" /> : null}
              onPress={() => setPick(x.id)} />
          ))}
        </Card>
      )}

      {can ? (adding ? (
        <Card>
          <Txt bold>เพิ่มเทรนเนอร์</Txt>
          <Chips options={[{ v: 'uid', t: 'มีแอป (UID / QR)' }, { v: 'name', t: 'ไม่มีแอป' }]} value={mode} onChange={v => { setMode(v as 'uid' | 'name'); setMsg(null); }} />
          {mode === 'uid' ? <>
            <UidField label="UID ของเทรนเนอร์" value={uid} onChange={setUid} />
            <Field label="ชื่อที่ใช้ในยิม (ไม่บังคับ)" value={name} onChangeText={setName} placeholder="ว่างไว้ = ใช้ชื่อในแอปของเขา" maxLength={60} />
            <Txt muted size={12.5}>ให้เทรนเนอร์เปิดหน้า "ฉัน" ในแอป แล้วพิมพ์ UID หรือกดกล้องสแกน QR · เพิ่มแล้วเขาเห็นตารางเทรนของตัวเองทันที</Txt>
            <Btn label="เพิ่ม" onPress={addByUid} loading={busy} />
          </> : <>
            <Field label="ชื่อ" value={name} onChangeText={setName} placeholder="เช่น โค้ชแนน" maxLength={60} />
            <PhoneField label="เบอร์โทร (ไม่บังคับ)" country={cc} onCountry={setCountry} value={phone} onChangeText={setPhone} />
            <Txt muted size={12.5}>ไม่มีแอปก็เพิ่มได้ ใช้เป็นชื่อในแพ็กเกจ PT และตาราง · ถ้าเบอร์ตรงกับคนที่ใช้แอป (ตอนนี้หรือวันหลัง) เขาจะเห็นตารางเทรนของตัวเอง</Txt>
            <Btn label="เพิ่ม" onPress={add} loading={busy} />
          </>}
          <Btn kind="ghost" label="ยกเลิก" onPress={() => setAdding(false)} />
        </Card>
      ) : <Btn kind="ghost" icon="plus" label="เพิ่มเทรนเนอร์" onPress={() => setAdding(true)} />) : null}

      {c ? <>
        <Label>ตารางว่าง {c.name}</Label>
        <Card><WeekGrid coachId={c.id} trainerId={c.profile_id} closedDays={gym?.closed_weekdays ?? []} openHours={gym?.open_hours} /></Card>
        <Txt muted size={12.5}>นัดใหม่ทำที่หน้าสมาชิก (PT กับ {c.name}) · ช่องลา ขึ้นเมื่อเทรนเนอร์มีแอปและแจ้งลาในแอป</Txt>
        {can ? (c.active
          ? <ConfirmBtn label={`ปิด ${c.name} (เลิกจ้าง/ย้ายออก)`} confirmLabel="ยืนยัน ปิดเทรนเนอร์คนนี้" onConfirm={() => setActive(c, false)} />
          : <Btn kind="ghost" label={`เปิดใช้ ${c.name} อีกครั้ง`} onPress={() => setActive(c, true)} />) : null}
      </> : null}
      <View style={{ height: 8 }} />
    </GymFrame>
  );
}
