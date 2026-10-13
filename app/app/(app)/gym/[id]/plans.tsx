import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { baht, isManager, planLength, type Plan, type PtPlan, useGym } from '../../../../src/lib/gym';
import { Btn, Card, Chips, ConfirmBtn, Field, H, Header, Notice, Pill, Row, Toggle, Txt } from '../../../../src/ui';
import { GymFrame } from '../../../../src/ui/GymFrame';

const QUICK = [
  { name: '1 เดือน', months: 1, days: 0 }, { name: '3 เดือน', months: 3, days: 0 },
  { name: '6 เดือน', months: 6, days: 0 }, { name: '1 ปี', months: 12, days: 0 }, { name: '7 วัน', months: 0, days: 7 },
];

type Draft = { id?: string; name: string; months: string; days: string; price: string; active: boolean };
const empty: Draft = { name: '', months: '1', days: '0', price: '', active: true };

export default function Plans() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role } = useGym(id);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const can = isManager(role);
  const [kind, setKind] = useState<'mem' | 'pt'>('mem');

  const load = useCallback(async () => {
    const { data } = await supabase.from('membership_plans').select('*').eq('gym_id', id).order('active', { ascending: false }).order('sort').order('months').order('days');
    setPlans((data as Plan[]) ?? []);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    if (!d) return;
    const months = Number(d.months || 0), days = Number(d.days || 0), price = Number(d.price);
    if (!d.name.trim()) { setErr('ใส่ชื่อแพ็กเกจ'); return; }
    if (!(months > 0 || days > 0) || months < 0 || days < 0) { setErr('ใส่จำนวนเดือนหรือวันอย่างน้อย 1'); return; }
    if (d.price === '' || Number.isNaN(price) || price < 0) { setErr('ใส่ราคาเป็นตัวเลข'); return; }
    setBusy(true); setErr('');
    const row = { gym_id: id, name: d.name.trim(), months, days, price, active: d.active, sort: months * 31 + days };
    const { error } = d.id ? await supabase.from('membership_plans').update(row).eq('id', d.id) : await supabase.from('membership_plans').insert(row);
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    setD(null); load();
  }

  async function del(p: Draft) {
    // plans already sold stay in history (the sale keeps its own name and price)
    const { error } = await supabase.from('membership_plans').delete().eq('id', p.id!);
    if (error) { setErr(thError(error)); return; }
    setD(null); load();
  }

  return (
    <GymFrame id={id} gym={gym} role={role} active="plans">
      <Header title="แพ็กเกจและราคา" sub={gym?.name} back={() => router.replace(`/gym/${id}/more` as any)} />
      <Chips options={[{ v: 'mem', t: 'สมาชิกยิม' }, { v: 'pt', t: 'PT' }]} value={kind} onChange={v => { setKind(v); setD(null); setErr(''); }} />
      {kind === 'pt' ? <PtPlans gymId={id} can={can} /> : <>
      {err ? <Notice text={err} /> : null}

      {d ? (
        <Card>
          <H size={17}>{d.id ? 'แก้ไขแพ็กเกจ' : 'เพิ่มแพ็กเกจ'}</H>
          {!d.id ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {QUICK.map(q => <Btn key={q.name} kind="ghost" label={q.name} style={{ minHeight: 38 }}
                onPress={() => setD({ ...d, name: q.name, months: String(q.months), days: String(q.days) })} />)}
            </View>
          ) : null}
          <Field label="ชื่อแพ็กเกจ" value={d.name} onChangeText={v => setD({ ...d, name: v })} placeholder="เช่น 3 เดือน" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="เดือน" value={d.months} onChangeText={v => setD({ ...d, months: v.replace(/\D/g, '') })} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="วัน" value={d.days} onChangeText={v => setD({ ...d, days: v.replace(/\D/g, '') })} keyboardType="number-pad" /></View>
          </View>
          <Field label="ราคา (บาท)" value={d.price} onChangeText={v => setD({ ...d, price: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" />
          <Toggle label="เปิดขาย" value={d.active} onChange={v => setD({ ...d, active: v })} hint="ปิดไว้ = ไม่โชว์ตอนขาย แต่ประวัติเดิมยังอยู่" />
          <Txt muted size={12}>วันปิดประจำและวันหยุดของยิมไม่นับอายุ ระบบเลื่อนวันหมดให้เอง</Txt>
          <Btn label="บันทึก" onPress={save} loading={busy} />
          <Btn kind="ghost" label="ยกเลิก" onPress={() => { setD(null); setErr(''); }} />
          {d.id ? <ConfirmBtn label="ลบแพ็กเกจนี้" onConfirm={() => del(d)} /> : null}
        </Card>
      ) : can ? <Btn icon="plus" label="เพิ่มแพ็กเกจ" onPress={() => setD({ ...empty })} /> : null}

      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {plans.length === 0 ? <Txt muted style={{ paddingVertical: 12 }}>ยังไม่มีแพ็กเกจ{can ? ' · กด "เพิ่มแพ็กเกจ" ด้านบน' : ''}</Txt> : null}
        {plans.map(p => (
          <Row key={p.id} title={p.name} sub={planLength(p)}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Txt bold>{baht(p.price)}</Txt>{!p.active ? <Pill text="ปิดขาย" kind="mute" /> : null}</View>}
            onPress={can ? () => setD({ id: p.id, name: p.name, months: String(p.months), days: String(p.days), price: String(p.price), active: p.active }) : undefined} />
        ))}
      </Card>
      </>}
    </GymFrame>
  );
}

type PtDraft = { id?: string; name: string; sessions: string; months: string; price: string; active: boolean };
const PT_QUICK = [{ s: 10, m: 3 }, { s: 20, m: 6 }, { s: 1, m: 0 }];

function PtPlans({ gymId, can }: { gymId: string; can: boolean }) {
  const [list, setList] = useState<PtPlan[]>([]);
  const [d, setD] = useState<PtDraft | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from('pt_plans').select('*').eq('gym_id', gymId).order('active', { ascending: false }).order('sessions');
    setList((data as PtPlan[]) ?? []);
  }, [gymId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    if (!d) return;
    const sessions = Number(d.sessions), months = Number(d.months || 0), price = Number(d.price);
    if (!(sessions > 0)) { setErr('ใส่จำนวนครั้ง'); return; }
    if (d.price === '' || Number.isNaN(price) || price < 0) { setErr('ใส่ราคาเป็นตัวเลข'); return; }
    const name = d.name.trim() || (sessions === 1 ? 'PT 1 ครั้ง' : `PT ${sessions} ครั้ง`);
    setBusy(true); setErr('');
    const row = { gym_id: gymId, name, sessions, months, price, active: d.active, sort: sessions };
    const { error } = d.id ? await supabase.from('pt_plans').update(row).eq('id', d.id) : await supabase.from('pt_plans').insert(row);
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    setD(null); load();
  }
  async function del(x: PtDraft) {
    const { error } = await supabase.from('pt_plans').delete().eq('id', x.id!);
    if (error) { setErr(thError(error)); return; }
    setD(null); load();
  }

  return <>
    {err ? <Notice text={err} /> : null}
    {d ? (
      <Card>
        <H size={17}>{d.id ? 'แก้แพ็กเกจ PT' : 'เพิ่มแพ็กเกจ PT'}</H>
        {!d.id ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PT_QUICK.map(q => <Btn key={q.s} kind="ghost" label={`${q.s} ครั้ง`} style={{ minHeight: 38 }}
              onPress={() => setD({ ...d, sessions: String(q.s), months: String(q.m), name: '' })} />)}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="จำนวนครั้ง" value={d.sessions} onChangeText={v => setD({ ...d, sessions: v.replace(/\D/g, '') })} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="ใช้ภายใน (เดือน)" value={d.months} onChangeText={v => setD({ ...d, months: v.replace(/\D/g, '') })} keyboardType="number-pad" hint="0 = ไม่หมดอายุ" /></View>
        </View>
        <Field label="ราคา (บาท)" value={d.price} onChangeText={v => setD({ ...d, price: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" />
        <Field label="ชื่อ (ไม่บังคับ)" value={d.name} onChangeText={v => setD({ ...d, name: v })} placeholder={`PT ${d.sessions || 10} ครั้ง`} />
        <Toggle label="เปิดขาย" value={d.active} onChange={v => setD({ ...d, active: v })} />
        <Btn label="บันทึก" onPress={save} loading={busy} />
        <Btn kind="ghost" label="ยกเลิก" onPress={() => { setD(null); setErr(''); }} />
        {d.id ? <ConfirmBtn label="ลบแพ็กเกจนี้" onConfirm={() => del(d)} /> : null}
      </Card>
    ) : can ? <Btn icon="plus" label="เพิ่มแพ็กเกจ PT" onPress={() => setD({ name: '', sessions: '10', months: '3', price: '', active: true })} /> : null}
    <Card style={{ gap: 0, paddingVertical: 4 }}>
      {!list.length ? <Txt muted style={{ paddingVertical: 12 }}>ยังไม่มีแพ็กเกจ PT{can ? ' · กด "เพิ่มแพ็กเกจ PT"' : ''}</Txt> : null}
      {list.map(p => (
        <Row key={p.id} title={p.name} sub={`${p.sessions} ครั้ง · ${p.months ? `ใช้ภายใน ${p.months} เดือน` : 'ไม่หมดอายุ'}`}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Txt bold>{baht(p.price)}</Txt>{!p.active ? <Pill text="ปิดขาย" kind="mute" /> : null}</View>}
          onPress={can ? () => setD({ id: p.id, name: p.name, sessions: String(p.sessions), months: String(p.months), price: String(p.price), active: p.active }) : undefined} />
      ))}
    </Card>
    <Txt muted size={13}>ขาย PT ที่หน้าสมาชิก: กด ขาย / ต่ออายุ แล้วเลือก PT และเทรนเนอร์</Txt>
  </>;
}
