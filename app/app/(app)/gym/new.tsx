import { useState } from 'react';
import { router } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { Btn, Card, Field, H, Notice, Screen, Txt } from '../../../src/ui';
import { DEFAULT_HOURS, hoursError, hoursToGym, OpenHours, type Hours } from '../../../src/ui/OpenHours';

export default function NewGym() {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [phone, setPhone] = useState('');
  const [walkin, setWalkin] = useState('100');
  const [hours, setHours] = useState<Hours>(DEFAULT_HOURS);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!name.trim()) { setErr('ใส่ชื่อยิม'); return; }
    const price = Number(walkin || 0);
    if (Number.isNaN(price) || price < 0) { setErr('ราคาขาจรต้องเป็นตัวเลข'); return; }
    const he = hoursError(hours); if (he) { setErr(he); return; }
    setBusy(true); setErr('');
    const { data, error } = await supabase.from('gyms')
      .insert({ name: name.trim(), branch: branch.trim() || null, phone: phone.trim() || null, walkin_price: price, ...hoursToGym(hours), created_by: profile!.id })
      .select('id').single();
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    router.replace(`/gym/${data!.id}`);
  }

  return (
    <Screen>
      <Btn kind="ghost" label="‹ กลับ" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ alignSelf: 'flex-start', minHeight: 40 }} />
      <H size={24}>สร้างยิมใหม่</H>
      <Card>
        {err ? <Notice text={err} /> : null}
        <Field label="ชื่อยิม" value={name} onChangeText={setName} placeholder="เช่น FitLab" />
        <Field label="สาขา (ไม่บังคับ)" value={branch} onChangeText={setBranch} placeholder="เช่น ลาดพร้าว" />
        <Field label="เบอร์โทรยิม (ไม่บังคับ)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="ราคาขาจรต่อวัน (บาท)" value={walkin} onChangeText={setWalkin} keyboardType="number-pad" />
        <OpenHours value={hours} onChange={setHours} />
        <Btn label="สร้างยิม" onPress={go} loading={busy} />
        <Txt muted size={12.5}>คุณจะเป็นเจ้าของ (Owner) ของยิมนี้ แล้วค่อยเพิ่มทีมงานทีหลัง</Txt>
      </Card>
    </Screen>
  );
}
