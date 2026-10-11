import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { signInWith, supabase, thError } from '../../src/lib/supabase';
import { Btn, Card, Field, H, Notice, Screen, Txt } from '../../src/ui';
import { C, F, LINE_GREEN, LINE_INK, R } from '../../src/lib/theme';
import { Lockup } from '../../src/ui/Logo';

// LINE and Google logos must be their official files; until they are added the buttons carry text only.
function ProviderBtn({ label, bg, fg, border, onPress, busy }: { label: string; bg: string; fg: string; border?: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ busy: !!busy }} onPress={busy ? undefined : onPress}
      style={(st: any) => ({ minHeight: 52, borderRadius: R.field, backgroundColor: bg, borderWidth: 1, borderColor: border ?? bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: busy ? 0.6 : st.pressed ? 0.85 : st.hovered ? 0.93 : 1 })}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ fontFamily: F.body, color: fg, fontWeight: '600', fontSize: 16, lineHeight: 24 }}>{label}</Text>}
    </Pressable>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'email' | 'google' | 'line'>('');
  const [showEmail, setShowEmail] = useState(false);

  // Google / LINE send errors back in the address bar
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#/, ''));
    const d = q.get('error_description') || q.get('error');
    if (d) setErr(thError(d.replace(/\+/g, ' ')));
  }, []);

  async function oauth(p: 'google' | 'line') {
    setErr(''); setBusy(p);
    const { error } = await signInWith(p);
    if (error) { setBusy(''); setErr(thError(error)); }
    // on success the browser leaves this page for Google / LINE
  }

  async function go() {
    setErr('');
    if (!email.trim() || !pw) { setErr('ใส่อีเมลและรหัสผ่าน'); return; }
    setBusy('email');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw });
    setBusy('');
    if (error) setErr(thError(error));
  }

  return (
    <Screen center>
      <View style={{ gap: 16, paddingHorizontal: 4 }}>
        <Lockup height={40} />
        <Txt muted size={16}>จัดการยิม เทรนเนอร์ และลูกเทรน ในที่เดียว</Txt>
      </View>

      <Card>
        <H size={22}>เข้าสู่ระบบ</H>
        <Txt muted size={13.5}>ครั้งแรกกดแล้วสมัครให้อัตโนมัติ</Txt>
        {err ? <Notice text={err} /> : null}
        <ProviderBtn label="ดำเนินการต่อด้วย LINE" bg={LINE_GREEN} fg={LINE_INK} onPress={() => oauth('line')} busy={busy === 'line'} />
        <ProviderBtn label="ดำเนินการต่อด้วย Google" bg={C.surface} fg={C.fg} border={C.line} onPress={() => oauth('google')} busy={busy === 'google'} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: C.line }} /><Txt muted size={12.5}>หรือ</Txt><View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
        </View>

        {!showEmail ? (
          <Btn kind="ghost" icon="mail" label="ใช้อีเมลและรหัสผ่าน" onPress={() => setShowEmail(true)} />
        ) : (
          <View style={{ gap: 12 }}>
            <Field label="อีเมล" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" />
            <Field label="รหัสผ่าน" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={go} returnKeyType="go" />
            <Btn label="เข้าสู่ระบบ" onPress={go} loading={busy === 'email'} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Link href="/forgot"><Txt muted size={13.5}>ลืมรหัสผ่าน</Txt></Link>
              <Link href="/signup"><Txt size={13.5} style={{ color: C.accent }} bold>สมัครด้วยอีเมล</Txt></Link>
            </View>
          </View>
        )}
      </Card>
      <Txt muted size={12} style={{ textAlign: 'center' }}>
        การเข้าใช้งานถือว่ายอมรับ<Link href="/terms"><Txt size={12} style={{ color: C.accent }}>เงื่อนไขการใช้งาน</Txt></Link>และ<Link href="/privacy"><Txt size={12} style={{ color: C.accent }}>นโยบายความเป็นส่วนตัว</Txt></Link>
      </Txt>
    </Screen>
  );
}
