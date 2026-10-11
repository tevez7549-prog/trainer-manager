import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { supabase, thError } from '../src/lib/supabase';
import { PDPA_VERSION, useAuth } from '../src/lib/auth';
import { Btn, Card, H, Loading, Notice, Screen, Txt } from '../src/ui';
import { C } from '../src/lib/theme';

// Draft wording for the pilot. Have a lawyer review before public launch.
const POINTS = [
  'เราเก็บชื่อ เบอร์โทร อีเมล และข้อมูลที่คุณบันทึกในแอป เพื่อให้บริการจัดการยิม การเทรน และโภชนาการ',
  'รูปร่างกาย น้ำหนัก สัดส่วน และอาหาร: เห็นได้เฉพาะคุณ เทรนเนอร์ที่ดูแลคุณ และเจ้าของยิมที่คุณเป็นสมาชิก',
  'เทรนเนอร์คนอื่น แอดมิน และพนักงานเคาน์เตอร์ ไม่เห็นรูปและอาหารของคุณ',
  'ยิมเห็นข้อมูลสมาชิก (ชื่อ เบอร์ แบบสมาชิก วันหมดอายุ การเช็กอิน) เพื่อใช้ที่เคาน์เตอร์',
  'คุณขอดู แก้ไข หรือลบข้อมูล และถอนความยินยอมได้ทุกเมื่อจากหน้า "ฉัน"',
];

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
      </Card>
      {err ? <Notice text={err} /> : null}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ok }} onPress={() => setOk(!ok)}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 4 }}>
        <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: ok ? C.accent : C.line, backgroundColor: ok ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center' }}>
          {ok ? <Txt bold style={{ color: '#fff' }}>✓</Txt> : null}
        </View>
        <Txt style={{ flex: 1 }}>ฉันอ่านแล้ว และยินยอมให้ใช้ข้อมูลตามที่ระบุ</Txt>
      </Pressable>
      <Btn label="ยินยอมและเริ่มใช้งาน" onPress={accept} disabled={!ok} loading={busy} />
      <Btn kind="ghost" label="ไม่ยินยอม · ออกจากระบบ" onPress={signOut} />
    </Screen>
  );
}
