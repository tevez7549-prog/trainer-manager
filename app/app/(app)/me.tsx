import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { Btn, Card, Chips, Field, H, Notice, Screen, Txt } from '../../src/ui';
import { useThemeMode, type ThemeMode } from '../../src/lib/themePref';
import { KEEP, useLang, type Lang } from '../../src/lib/i18n';
import { C, R } from '../../src/lib/theme';
import { phoneError, splitE164, toE164 } from '../../src/lib/phone';
import { PhoneField } from '../../src/ui/PhoneField';
import { TabBar } from '../../src/ui/TabBar';
import { gymHref, MEMBER_TABS, operatorTabs, rememberGym, TRAINER_TABS, useModes } from '../../src/lib/nav';
import { Icon } from '../../src/ui/Icon';
import { Pressable } from 'react-native';
import { ROLE_TH } from '../../src/lib/gym';
import { Row } from '../../src/ui';


export default function Me() {
  const { profile, refresh, signOut } = useAuth();
  const { mode, setMode } = useThemeMode();
  const { lang, setLang } = useLang();
  const { from, g } = useLocalSearchParams<{ from?: string; g?: string }>();
  const modes = useModes();
  const tabs = from === 'trainer' ? TRAINER_TABS : from === 'member' ? MEMBER_TABS : from === 'desk' && g ? operatorTabs(g) : null;
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

  async function makeTrainer() {
    setMsg(null);
    const { error } = await supabase.from('trainer_profiles').upsert({ user_id: profile!.id });
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    router.replace('/trainer' as any);
  }

  return (
    <Screen footer={tabs ? <TabBar tabs={tabs} active="me" /> : undefined}>
      {tabs ? <H size={24} style={{ paddingTop: 8 }}>ฉัน</H>
        : <Btn kind="ghost" label="‹ กลับ" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ alignSelf: 'flex-start', minHeight: 40 }} />}
      <View style={{ backgroundColor: C.brand, borderRadius: R.card, padding: 20, gap: 2, alignItems: 'center' }}>
        <Txt size={14} style={{ color: C.brandInk, opacity: 0.8 }}>UID ของฉัน</Txt>
        <H size={40} style={{ color: C.brandInk, letterSpacing: 2 }}>{profile.uid}</H>
        <Txt size={14} style={{ color: C.brandInk, textAlign: 'center' }}>บอก UID นี้ให้ยิม เทรนเนอร์ หรือคนที่จะดูแลคุณ</Txt>
      </View>
      {from === 'member' || !tabs ? (
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
        <Chips label={KEEP + 'ภาษา / Language'} options={[{ v: 'th', t: KEEP + 'ไทย' }, { v: 'en', t: 'English' }]} value={lang} onChange={v => setLang(v as Lang)} />
      </Card>
      {/* switch between personal, trainer and gym modes (only the ones this person has) */}
      {modes.isTrainer || modes.gyms.length ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <H size={17} style={{ paddingTop: 8 }}>สลับโหมด</H>
          <ModeRow ic="user" title="โหมดส่วนตัว" sub="อาหาร ออกกำลัง กลุ่ม ร่างกาย" on={from === 'member' || !from}
            onPress={() => router.replace('/?me=1' as any)} />
          {modes.isTrainer ? <ModeRow ic="dumbbell" title="โหมดเทรนเนอร์" sub="นัด ลูกเทรน ปฏิทิน คลังโปรแกรม" on={from === 'trainer'}
            onPress={() => router.replace('/trainer' as any)} /> : null}
          {modes.gyms.map(p => (
            <ModeRow key={p.gym.id} ic="house" title={`ดูแลยิม ${p.gym.name}`} sub={ROLE_TH[p.role]} on={from === 'desk' && g === p.gym.id}
              onPress={() => { rememberGym(p.gym.id); router.replace(gymHref(p) as any); }} />
          ))}
        </Card>
      ) : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <Row ic="plus" title="สร้างยิมของฉัน" sub="สำหรับเจ้าของยิม: สมาชิก แพ็กเกจรายเดือน PT และเทรนเนอร์" onPress={() => router.push('/gym/new' as any)} />
        {modes.ready && !modes.hasOwnTrainerAccount ? (
          <Row ic="plus" title="สร้างบัญชีเทรนเนอร์" sub="สำหรับเทรนเนอร์: ดูแลลูกเทรน นัด ตัดครั้ง และจัดโปรแกรม" onPress={makeTrainer} />
        ) : null}
      </Card>
      {profile.is_super_admin ? <Btn kind="ghost" icon="shield" label="หลังบ้าน (Super Admin)" onPress={() => router.push('/admin' as any)} /> : null}
      <Btn kind="danger" icon="log-out" label="ออกจากระบบ" onPress={signOut} />
    </Screen>
  );
}

/** One mode in the switcher; the current one is marked */
function ModeRow({ ic, title, sub, on, onPress }: { ic: any; title: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={on ? undefined : onPress}
      style={(st: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64, borderRadius: R.field,
        marginHorizontal: -8, paddingHorizontal: 8, backgroundColor: !on && (st.pressed || st.hovered) ? C.surface2 : 'transparent' })}>
      <View style={{ width: 40, height: 40, borderRadius: R.field, backgroundColor: on ? C.brand : C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ic} size={20} color={on ? C.brandInk : C.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt bold size={16} numberOfLines={2}>{title}</Txt>
        <Txt muted size={14}>{sub}</Txt>
      </View>
      {on ? <Txt bold size={13} style={{ color: C.accent }}>ใช้อยู่</Txt> : <Icon name="chevron-right" size={18} />}
    </Pressable>
  );
}
