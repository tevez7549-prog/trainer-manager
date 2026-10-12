import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { supabase, thError } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { Btn, Card, Chips, Field, H, Notice, Screen, Txt } from '../../src/ui';
import { useThemeMode, type ThemeMode } from '../../src/lib/themePref';
import { C, R } from '../../src/lib/theme';
import { phoneError, splitE164, toE164 } from '../../src/lib/phone';
import { PhoneField } from '../../src/ui/PhoneField';
import { TabBar } from '../../src/ui/TabBar';
import { MEMBER_TABS } from '../../src/lib/nav';
import { Row } from '../../src/ui';


export default function Me() {
  const { profile, refresh, signOut } = useAuth();
  const { mode, setMode } = useThemeMode();
  const tabs = MEMBER_TABS;
  const [name, setName] = useState(profile?.display_name ?? '');
  const init = splitE164(profile?.phone);
  const [country, setCountry] = useState(init.country);
  const [phone, setPhone] = useState(init.local);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  async function save() {
    if (!name.trim()) { setMsg({ t: 'ใส่ชื่อ', ok: false }); return; }
    const pe = phoneError(phone, country); if (pe) { setMsg({ t: pe, ok: false }); return; }
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), phone: toE164(phone, country) }).eq('id', profile!.id);
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    await refresh();
    setMsg({ t: 'บันทึกแล้ว', ok: true });
  }

  return (
    <Screen footer={tabs ? <TabBar tabs={tabs} active="me" /> : undefined}>
      {tabs ? <H size={24} style={{ paddingTop: 8 }}>ฉัน</H>
        : <Btn kind="ghost" label="‹ กลับ" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ alignSelf: 'flex-start', minHeight: 40 }} />}
      <View style={{ backgroundColor: C.brand, borderRadius: R.card, padding: 20, gap: 2, alignItems: 'center' }}>
        <Txt size={14} style={{ color: C.brandInk, opacity: 0.8 }}>UID ของฉัน</Txt>
        <H size={40} style={{ color: C.brandInk, letterSpacing: 2 }}>{profile.uid}</H>
        <Txt size={14} style={{ color: C.brandInk, textAlign: 'center' }}>บอก UID นี้ให้คนที่จะดูแลคุณ หรือใช้โค้ดกลุ่มชวนเข้ากลุ่ม</Txt>
      </View>
      {true ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <Row ic="scale" title="ร่างกาย" sub="น้ำหนัก สัดส่วน รูปความคืบหน้า" onPress={() => router.push('/my/body' as any)} />
        </Card>
      ) : null}
      <Card>
        <H size={17}>ข้อมูลส่วนตัว</H>
        {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
        <Field label="ชื่อที่แสดง" value={name} onChangeText={setName} />
        <PhoneField label="เบอร์โทร" country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} />
        <View style={{ gap: 4 }}>
          <Txt bold size={13.5}>อีเมล</Txt>
          <Txt muted>{profile.email}</Txt>
        </View>
        <Btn label="บันทึก" onPress={save} loading={busy} />
      </Card>
      <Card>
        <H size={17}>หน้าตาแอป</H>
        <Chips options={[{ v: 'dark', t: 'มืด' }, { v: 'light', t: 'สว่าง' }, { v: 'system', t: 'ตามเครื่อง' }]} value={mode} onChange={v => setMode(v as ThemeMode)} />
      </Card>
      {profile.is_super_admin ? <Btn kind="ghost" icon="shield" label="หลังบ้าน (Super Admin)" onPress={() => router.push('/admin' as any)} /> : null}
      <Btn kind="danger" icon="log-out" label="ออกจากระบบ" onPress={signOut} />
    </Screen>
  );
}
