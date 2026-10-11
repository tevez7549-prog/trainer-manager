import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link, Redirect, router } from 'expo-router';
import { supabase, thError } from '../src/lib/supabase';
import { PDPA_VERSION, useAuth } from '../src/lib/auth';
import { Btn, Card, H, Loading, Notice, Screen, Txt } from '../src/ui';
import { C } from '../src/lib/theme';
import { Icon } from '../src/ui/Icon';

import { PRIVACY_POINTS as POINTS } from '../src/lib/legal';

export default function Consent() {
  const { loading, session, hasConsent, refresh, signOut } = useAuth();
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (hasConsent) return <Redirect href="/" />;

  async function accept() {
    setBusy(true); setErr('');
    const { error } = await supabase.from('consents').insert({ user_id: session!.user.id, doc: 'pdpa', version: PDPA_VERSION });
    if (error) { setBusy(false); setErr(thError(error)); return; }
    await refresh();
    setBusy(false);
    router.replace('/');
  }

  return (
    <Screen>
      <H size={24}>ความยินยอมในการใช้ข้อมูล</H>
      <Card>
        {POINTS.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Txt bold style={{ color: C.accent }}>{i + 1}.</Txt>
            <Txt style={{ flex: 1 }}>{p}</Txt>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Link href="/privacy"><Txt size={13.5} bold style={{ color: C.accent }}>อ่านนโยบายฉบับเต็ม</Txt></Link>
          <Link href="/terms"><Txt size={13.5} bold style={{ color: C.accent }}>เงื่อนไขการใช้งาน</Txt></Link>
        </View>
      </Card>
      {err ? <Notice text={err} /> : null}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ok }} onPress={() => setOk(!ok)}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 4 }}>
        <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: ok ? C.accent : C.line, backgroundColor: ok ? C.brand : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          {ok ? <Icon name="check" size={18} color={C.brandInk} /> : null}
        </View>
        <Txt style={{ flex: 1 }}>ฉันอ่านแล้ว และยินยอมให้ใช้ข้อมูลตามที่ระบุ</Txt>
      </Pressable>
      <Btn label="ยินยอมและเริ่มใช้งาน" onPress={accept} disabled={!ok} loading={busy} />
      <Btn kind="ghost" label="ไม่ยินยอม · ออกจากระบบ" onPress={signOut} />
    </Screen>
  );
}
