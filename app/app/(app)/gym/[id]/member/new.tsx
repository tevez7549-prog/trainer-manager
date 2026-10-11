import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../../src/lib/supabase';
import { useAuth } from '../../../../../src/lib/auth';
import { gymCountry, isDesk, type Plan, useGym } from '../../../../../src/lib/gym';
import { phoneError, toE164, type Country } from '../../../../../src/lib/phone';
import { Btn, Card, Field, Header, Notice, Screen, Toggle, Txt } from '../../../../../src/ui';
import { PhoneField } from '../../../../../src/ui/PhoneField';
import { newSale, saleError, sell, SellForm, type Sale } from '../../../../../src/ui/SellForm';

export default function NewMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { gym, role } = useGym(id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country | null>(null);
  const [ptOnly, setPtOnly] = useState(false);
  const [note, setNote] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sellNow, setSellNow] = useState(true);
  const [sale, setSale] = useState<Sale>(newSale());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (gym && !country) setCountry(gymCountry(gym)); }, [gym, country]);
  useFocusEffect(useCallback(() => {
    supabase.from('membership_plans').select('*').eq('gym_id', id).eq('active', true).order('sort').then(({ data }) => setPlans((data as Plan[]) ?? []));
  }, [id]));

  const c = country ?? gymCountry(gym);
  const willSell = sellNow && !ptOnly && plans.length > 0;

  async function save() {
    if (!name.trim()) { setErr('ใส่ชื่อ'); return; }
    if (phone.trim()) { const pe = phoneError(phone, c); if (pe) { setErr(pe); return; } }
    if (willSell) { const se = saleError(sale); if (se) { setErr(se); return; } }
    setBusy(true); setErr('');
    const { data, error } = await supabase.from('members')
      .insert({ gym_id: id, name: name.trim(), phone: phone.trim() ? toE164(phone, c) : null, pt_only: ptOnly, note: note.trim() || null, created_by: profile!.id })
      .select('id').single();
    if (error) { setBusy(false); setErr(thError(error)); return; }
    if (willSell) {
      const r = await sell(data!.id, sale);
      if (r.error) { setBusy(false); router.replace(`/gym/${id}/member/${data!.id}?sell=1` as any); return; }
    }
    setBusy(false);
    router.replace(`/gym/${id}/member/${data!.id}` as any);
  }

  if (gym && !isDesk(role)) return <Screen><Header title="เพิ่มสมาชิก" back={() => router.back()} /><Notice text="คุณไม่มีสิทธิ์เพิ่มสมาชิก" /></Screen>;

  return (
    <Screen>
      <Header title="เพิ่มสมาชิก" sub={gym?.name} back={() => (router.canGoBack() ? router.back() : router.replace(`/gym/${id}/members` as any))} />
      {err ? <Notice text={err} /> : null}
      <Card>
        <Field label="ชื่อ" value={name} onChangeText={setName} placeholder="ชื่อ-นามสกุล หรือชื่อเล่น" />
        <PhoneField label="เบอร์โทร (ไม่บังคับ แต่ควรใส่)" country={c} onCountry={setCountry} value={phone} onChangeText={setPhone}
          hint="ถ้าสมาชิกสมัครแอปด้วยเบอร์นี้ ประวัติจะเชื่อมให้เอง" />
        <Field label="หมายเหตุ (ไม่บังคับ)" value={note} onChangeText={setNote} />
        <Toggle label="เทรน PT อย่างเดียว" value={ptOnly} onChange={setPtOnly} hint="มาเทรนกับเทรนเนอร์ ไม่ได้ซื้อสมาชิกยิม" />
      </Card>
      {!ptOnly ? (
        <Card>
          <Toggle label="ขายแพ็กเกจสมาชิกเลย" value={sellNow} onChange={setSellNow} />
          {sellNow ? <SellForm gymId={id} plans={plans} value={sale} onChange={setSale} /> : <Txt muted size={13}>ขายทีหลังได้จากหน้าสมาชิก</Txt>}
        </Card>
      ) : null}
      <Btn label={willSell ? 'บันทึกและขายแพ็กเกจ' : 'บันทึกสมาชิก'} onPress={save} loading={busy} />
    </Screen>
  );
}
