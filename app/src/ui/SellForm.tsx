import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { supabase } from '../lib/supabase';
import { addDays, baht, planLength, thDate, todayISO, type Plan } from '../lib/gym';
import { Chips, DateField, Field, Notice, Txt } from './index';
import { C } from '../lib/theme';

export type Pay = 'cash' | 'transfer' | 'qr' | 'free';
export type Sale = { planId: string | null; start: string; pay: Pay; price: string };
const PAYS: { v: Pay; t: string }[] = [{ v: 'cash', t: 'เงินสด' }, { v: 'transfer', t: 'โอน' }, { v: 'qr', t: 'QR' }, { v: 'free', t: 'ฟรี' }];

export const newSale = (): Sale => ({ planId: null, start: todayISO(), pay: 'cash', price: '' });

/** Pick a plan, start date, payment. Shows the real start and end (renewing early continues from the old end date). */
export function SellForm({ gymId, plans, value, onChange, currentEnd }: {
  gymId: string; plans: Plan[]; value: Sale; onChange: (s: Sale) => void; currentEnd?: string | null;
}) {
  const plan = plans.find(p => p.id === value.planId) ?? null;
  const realStart = currentEnd && currentEnd >= value.start ? addDays(currentEnd, 1) : value.start;
  const [end, setEnd] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) { setEnd(null); return; }
    let alive = true;
    supabase.rpc('calc_end_date', { g: gymId, start_d: realStart, months: plan.months, days: plan.days })
      .then(({ data }) => { if (alive) setEnd((data as string) ?? null); });
    return () => { alive = false; };
  }, [gymId, plan?.id, realStart]);

  if (!plans.length) return <Notice kind="info" text="ยังไม่มีแพ็กเกจ ให้เจ้าของหรือ Admin เพิ่มที่เมนู แพ็กเกจสมาชิก ก่อน" />;

  return (
    <View style={{ gap: 12 }}>
      <Chips label="แพ็กเกจ" options={plans.map(p => ({ v: p.id, t: `${p.name} · ${baht(p.price)}` }))} value={value.planId}
        onChange={v => onChange({ ...value, planId: v, price: String(plans.find(p => p.id === v)?.price ?? '') })} />
      <DateField label="วันเริ่ม" value={value.start} onChange={v => onChange({ ...value, start: v })}
        hint={currentEnd && currentEnd >= value.start ? `แพ็กเกจเดิมยังไม่หมด จะต่อจากวันหมดเดิม (${thDate(currentEnd)})` : undefined} />
      {plan ? (
        <View style={{ backgroundColor: C.surface2, borderRadius: 12, padding: 12, gap: 2 }}>
          <Txt bold>{plan.name} ({planLength(plan)})</Txt>
          <Txt>เริ่ม {thDate(realStart, true)} → หมด {end ? thDate(end, true) : '…'}</Txt>
          <Txt muted size={12}>วันปิดประจำและวันหยุดของยิมไม่นับ</Txt>
        </View>
      ) : null}
      <Chips label="ชำระโดย" options={PAYS} value={value.pay} onChange={v => onChange({ ...value, pay: v, price: v === 'free' ? '0' : value.price || String(plan?.price ?? '') })} />
      <Field label="รับเงิน (บาท)" value={value.price} onChangeText={v => onChange({ ...value, price: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad"
        hint={plan && Number(value.price) !== Number(plan.price) ? `ราคาปกติ ${baht(plan.price)}` : undefined} />
    </View>
  );
}

export function saleError(s: Sale): string | null {
  if (!s.planId) return 'เลือกแพ็กเกจ';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.start)) return 'วันเริ่มไม่ถูกต้อง';
  const p = Number(s.price);
  if (s.price === '' || Number.isNaN(p) || p < 0) return 'ใส่จำนวนเงินเป็นตัวเลข';
  return null;
}

export const sell = (memberId: string, s: Sale) =>
  supabase.rpc('sell_membership', { m: memberId, plan: s.planId, start_on: s.start, pay: s.pay, price_paid: Number(s.price) });
