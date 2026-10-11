import { useState } from 'react';
import { router } from 'expo-router';
import { supabase, thError } from '../src/lib/supabase';
import { useAuth } from '../src/lib/auth';
import { Btn, Card, Field, H, Loading, Notice, Screen, Txt } from '../src/ui';

/** Opened from the "reset password" email link */
export default function Reset() {
  const { loading, session } = useAuth();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;

  if (!session) return (
    <Screen center><Card>
      <H size={20}>ลิงก์หมดอายุ</H>
      <Txt muted>ขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้งจากหน้าเข้าสู่ระบบ</Txt>
      <Btn label="ไปหน้าเข้าสู่ระบบ" onPress={() => router.replace('/login')} />
    </Card></Screen>
  );

  async function go() {
    if (pw.length < 8) { setErr('อย่างน้อย 8 ตัว'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    router.replace('/');
  }

  return (
    <Screen center><Card>
      <H size={20}>ตั้งรหัสผ่านใหม่</H>
      {err ? <Notice text={err} /> : null}
      <Field label="รหัสผ่านใหม่" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" hint="อย่างน้อย 8 ตัว" />
      <Btn label="บันทึกรหัสผ่าน" onPress={go} loading={busy} />
    </Card></Screen>
  );
}
