import { useState } from 'react';
import { router } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { DEFAULT_COUNTRY, phoneError, toE164, type Country } from '../../../src/lib/phone';
import { Btn, Card, Chips, Field, Header, Notice, Screen, Txt } from '../../../src/ui';
import { PhoneField } from '../../../src/ui/PhoneField';

type Mode = 'app' | 'noapp';

export default function AddTrainee() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>('app');
  const [uid, setUid] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [goal, setGoal] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite() {
    const n = Number(uid.replace(/\D/g, ''));
    if (!n) { setMsg({ t: 'ใส่ UID (ตัวเลข)', ok: false }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('invite_client', { client_uid: n });
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    setMsg({ t: `ส่งคำเชิญถึง ${(data as any)?.display_name || 'UID ' + n} แล้ว · เมื่อเขากดรับในแอป จะขึ้นในรายชื่อลูกเทรนของคุณ`, ok: true });
    setUid('');
  }

  async function addNoApp() {
    if (!name.trim()) { setMsg({ t: 'ใส่ชื่อ', ok: false }); return; }
    if (phone.trim()) { const pe = phoneError(phone, country); if (pe) { setMsg({ t: pe, ok: false }); return; } }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.from('trainer_clients')
      .insert({ trainer_id: profile!.id, client_name: name.trim(), client_phone: phone.trim() ? toE164(phone, country) : null, goal: goal.trim() || null })
      .select('id').single();
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    router.replace(`/trainer/client/${data!.id}` as any);
  }

  return (
    <Screen>
      <Header title="เพิ่มลูกเทรน" back={() => (router.canGoBack() ? router.back() : router.replace('/trainer' as any))} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      <Chips options={[{ v: 'app', t: 'มีแอปแล้ว (เชิญด้วย UID)' }, { v: 'noapp', t: 'ยังไม่มีแอป' }]} value={mode} onChange={v => { setMode(v); setMsg(null); }} />
      {mode === 'app' ? (
        <Card>
          <Txt muted size={13.5}>ให้ลูกเทรนเปิดหน้า "ฉัน" ในแอป แล้วบอก UID (ตัวเลข) · ลูกเทรนต้องกดรับก่อน คุณถึงจะเห็นข้อมูลของเขา</Txt>
          <Field label="UID ของลูกเทรน" value={uid} onChangeText={setUid} keyboardType="number-pad" placeholder="เช่น 100002" />
          <Btn label="ส่งคำเชิญ" onPress={invite} loading={busy} />
        </Card>
      ) : (
        <Card>
          <Txt muted size={13.5}>สำหรับลูกเทรนที่ไม่ใช้แอป คุณจดนัดและแพ็กเกจให้เขาได้ตามปกติ</Txt>
          <Field label="ชื่อ" value={name} onChangeText={setName} />
          <PhoneField label="เบอร์โทร (ไม่บังคับ)" country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} />
          <Field label="เป้าหมาย (ไม่บังคับ)" value={goal} onChangeText={setGoal} placeholder="เช่น ลดไขมัน 5 กก. ใน 3 เดือน" />
          <Btn label="เพิ่มลูกเทรน" onPress={addNoApp} loading={busy} />
        </Card>
      )}
    </Screen>
  );
}
