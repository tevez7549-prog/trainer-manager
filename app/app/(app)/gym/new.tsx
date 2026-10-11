import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { Btn, Card, Field, H, Notice, Screen, Txt } from '../../../src/ui';
import { C } from '../../../src/lib/theme';

const DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']; // index = day of week, 0 = Sunday

export default function NewGym() {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [phone, setPhone] = useState('');
  const [walkin, setWalkin] = useState('100');
  const [closed, setClosed] = useState<number[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (d: number) => setClosed(c => c.includes(d) ? c.filter(x => x !== d) : [...c, d].sort());

  async function go() {
    if (!name.trim()) { setErr('ใส่ชื่อยิม'); return; }
    const price = Number(walkin || 0);
    if (Number.isNaN(price) || price < 0) { setErr('ราคาขาจรต้องเป็นตัวเลข'); return; }
    setBusy(true); setErr('');
    const { data, error } = await supabase.from('gyms')
      .insert({ name: name.trim(), branch: branch.trim() || null, phone: phone.trim() || null, walkin_price: price, closed_weekdays: closed, created_by: profile!.id })
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
        <View style={{ gap: 8 }}>
          <Txt bold size={13.5}>วันปิดประจำ</Txt>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map((d, i) => {
              const on = closed.includes(i);
              return (
                <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`ปิดวัน${d}`} onPress={() => toggle(i)}
                  style={{ minWidth: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt bold style={{ color: on ? '#fff' : C.fg }}>{d}</Txt>
                </Pressable>
              );
            })}
          </View>
          <Txt muted size={12}>วันที่ปิดไม่นับอายุสมาชิกและแพ็ก PT · แก้ทีหลังได้</Txt>
        </View>
        <Btn label="สร้างยิม" onPress={go} loading={busy} />
        <Txt muted size={12.5}>คุณจะเป็นเจ้าของ (Owner) ของยิมนี้ แล้วค่อยเพิ่มทีมงานทีหลัง</Txt>
      </Card>
    </Screen>
  );
}
