import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Link } from 'expo-router';
import { supabase, thError } from '../../src/lib/supabase';
import { Btn, Card, Field, H, Notice, Screen, Txt } from '../../src/ui';
import { PhoneField } from '../../src/ui/PhoneField';
import { DEFAULT_COUNTRY, phoneError, toE164, type Country } from '../../src/lib/phone';


export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [pw, setPw] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'ใส่ชื่อ';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'รูปแบบอีเมลไม่ถูก';
    const pe = phoneError(phone, country); if (pe) e.phone = pe;
    if (pw.length < 8) e.pw = 'อย่างน้อย 8 ตัว';
    setErrs(e); setErr('');
    if (Object.keys(e).length) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: pw,
      options: {
        data: { display_name: name.trim(), phone: toE164(phone, country) },
        emailRedirectTo: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    if (!data.session) setSent(email.trim().toLowerCase());
    // with a session the auth layout moves on to the consent page by itself
  }

  if (sent) return (
    <Screen center>
      <Card>
        <H size={20}>เช็กอีเมลของคุณ</H>
        <Txt>เราส่งลิงก์ยืนยันไปที่ <Txt bold>{sent}</Txt> กดลิงก์ในอีเมลแล้วกลับมาเข้าสู่ระบบ</Txt>
        <Txt muted size={13}>ไม่เห็นอีเมล ลองดูในโฟลเดอร์ Junk / Spam</Txt>
        <Link href="/login" asChild><Btn label="ไปหน้าเข้าสู่ระบบ" /></Link>
      </Card>
    </Screen>
  );

  return (
    <Screen>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <H size={26}>สมัครใช้งาน</H>
        <Txt muted>สมัครที่เดียว ใช้ได้ทั้งเจ้าของยิม ทีมงาน เทรนเนอร์ และลูกเทรน</Txt>
      </View>
      <Card>
        {err ? <Notice text={err} /> : null}
        <Field label="ชื่อที่แสดง" value={name} onChangeText={setName} error={errs.name} placeholder="เช่น สมชาย ใจดี" autoComplete="name" />
        <Field label="อีเมล" value={email} onChangeText={setEmail} error={errs.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <PhoneField label="เบอร์โทร" country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} error={errs.phone}
          hint="ถ้ายิมเคยลงทะเบียนคุณด้วยเบอร์นี้ ประวัติจะเชื่อมให้อัตโนมัติ" />
        <Field label="ตั้งรหัสผ่าน" value={pw} onChangeText={setPw} error={errs.pw} secureTextEntry autoComplete="new-password" hint="อย่างน้อย 8 ตัว" />
        <Btn label="สมัครใช้งาน" onPress={go} loading={busy} />
      </Card>
      <Link href="/login" style={{ alignSelf: 'center' }}><Txt muted>มีบัญชีแล้ว · เข้าสู่ระบบ</Txt></Link>
    </Screen>
  );
}
