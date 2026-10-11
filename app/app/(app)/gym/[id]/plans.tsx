import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { baht, isManager, planLength, type Plan, useGym } from '../../../../src/lib/gym';
import { Btn, Card, ConfirmBtn, Field, H, Header, Notice, Pill, Row, Screen, Toggle, Txt } from '../../../../src/ui';

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
    <Screen>
      <Header title="แพ็กเกจสมาชิก" sub={gym?.name} back={() => router.replace(`/gym/${id}` as any)} />
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
      ) : can ? <Btn label="+ เพิ่มแพ็กเกจ" onPress={() => setD({ ...empty })} /> : null}

      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {plans.length === 0 ? <Txt muted style={{ paddingVertical: 12 }}>ยังไม่มีแพ็กเกจ{can ? ' · กด "เพิ่มแพ็กเกจ" ด้านบน' : ''}</Txt> : null}
        {plans.map(p => (
          <Row key={p.id} title={p.name} sub={planLength(p)}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Txt bold>{baht(p.price)}</Txt>{!p.active ? <Pill text="ปิดขาย" kind="mute" /> : null}</View>}
            onPress={can ? () => setD({ id: p.id, name: p.name, months: String(p.months), days: String(p.days), price: String(p.price), active: p.active }) : undefined} />
        ))}
      </Card>
    </Screen>
  );
}
