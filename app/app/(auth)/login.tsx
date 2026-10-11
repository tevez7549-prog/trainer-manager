import { useState } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { supabase, thError } from '../../src/lib/supabase';
import { Btn, Card, Field, H, Notice, Screen, Txt } from '../../src/ui';
import { C } from '../../src/lib/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr('');
    if (!email.trim() || !pw) { setErr('ใส่อีเมลและรหัสผ่าน'); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw });
    setBusy(false);
    if (error) setErr(thError(error));
    // success: the auth layout redirects to home on its own
  }

  return (
    <Screen center>
      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={22} bold style={{ color: '#fff' }}>TM</Txt>
        </View>
        <H size={30} style={{ marginTop: 8 }}>Trainer Manager</H>
        <Txt muted>จัดการยิม เทรนเนอร์ และลูกเทรน ในที่เดียว</Txt>
      </View>
      <Card>
        <H size={19}>เข้าสู่ระบบ</H>
        {err ? <Notice text={err} /> : null}
        <Field label="อีเมล" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
        <Field label="รหัสผ่าน" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={go} returnKeyType="go" />
        <Btn label="เข้าสู่ระบบ" onPress={go} loading={busy} />
        <Link href="/forgot" style={{ alignSelf: 'center' }}><Txt muted size={13.5}>ลืมรหัสผ่าน</Txt></Link>
      </Card>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Txt muted>ยังไม่มีบัญชี?</Txt>
        <Link href="/signup" asChild><Btn kind="ghost" label="สมัครใช้งาน" style={{ alignSelf: 'stretch' }} /></Link>
      </View>
    </Screen>
  );
}
