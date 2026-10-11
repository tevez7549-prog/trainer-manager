import { useState } from 'react';
import { Platform } from 'react-native';
import { Link } from 'expo-router';
import { supabase, thError } from '../../src/lib/supabase';
import { Btn, Card, Field, H, Notice, Screen, Txt } from '../../src/ui';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!email.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/reset` : undefined,
    });
    setBusy(false);
    setMsg(error ? { t: thError(error), ok: false } : { t: 'ถ้ามีบัญชีนี้ เราส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว', ok: true });
  }

  return (
    <Screen center>
      <Card>
        <H size={20}>ลืมรหัสผ่าน</H>
        <Txt muted>ใส่อีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้</Txt>
        {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
        <Field label="อีเมล" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Btn label="ส่งลิงก์" onPress={go} loading={busy} />
        <Link href="/login" style={{ alignSelf: 'center' }}><Txt muted>กลับไปเข้าสู่ระบบ</Txt></Link>
      </Card>
    </Screen>
  );
}
