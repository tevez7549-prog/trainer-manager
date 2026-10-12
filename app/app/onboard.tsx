import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { supabase, thError } from '../src/lib/supabase';
import { useAuth } from '../src/lib/auth';
import { DEFAULT_COUNTRY, phoneError, toE164, type Country } from '../src/lib/phone';
import { Btn, Card, Field, H, Loading, Notice, Screen, Txt } from '../src/ui';
import { PhoneField } from '../src/ui/PhoneField';

/** First sign-in: make sure we have a display name and a phone number (gyms look members up by phone) */
export default function Onboard() {
  const { loading, session, profile, refresh, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Loading />;
  if (profile.phone && profile.display_name) return <Redirect href="/" />;

  async function save() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'ใส่ชื่อ';
    const pe = phoneError(phone, country); if (pe) e.phone = pe;
    setErrs(e); setErr('');
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), phone: toE164(phone, country) }).eq('id', profile!.id);
    if (error) { setBusy(false); setErr(thError(error)); return; }
    await refresh();
    setBusy(false);
    router.replace('/');
  }

  return (
    <Screen center>
      <H size={24}>อีกนิดเดียว</H>
      <Txt muted>เบอร์โทรใช้ให้คนที่ดูแลคุณ (เช่น แฟน ลูก เทรนเนอร์) หาคุณเจอ ถ้าเขาเคยบันทึกข้อมูลแทนคุณไว้ จะมีคำขอให้กดรับ แล้วข้อมูลย้ายมาอยู่ในแอปของคุณ</Txt>
      <Card>
        {err ? <Notice text={err} /> : null}
        <Field label="ชื่อที่แสดง" value={name} onChangeText={setName} error={errs.name} autoComplete="name" />
        <PhoneField label="เบอร์โทร" country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} error={errs.phone} />
        <Btn label="เริ่มใช้งาน" onPress={save} loading={busy} />
      </Card>
      <Btn kind="ghost" label="ออกจากระบบ" onPress={signOut} />
    </Screen>
  );
}
