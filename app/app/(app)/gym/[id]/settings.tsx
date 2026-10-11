import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { DAYS_SHORT, gymCountry, isManager, useGym } from '../../../../src/lib/gym';
import { COUNTRIES } from '../../../../src/lib/phone';
import { Btn, Card, ConfirmBtn, Field, Header, Notice, Screen, Txt } from '../../../../src/ui';
import { useAuth } from '../../../../src/lib/auth';
import { C, R } from '../../../../src/lib/theme';
import { GymFrame } from '../../../../src/ui/GymFrame';

export default function GymSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role, reload } = useGym(id);
  const { profile } = useAuth();
  const [f, setF] = useState({ name: '', branch: '', phone: '', address: '', walkin: '', cc: '66', closed: [] as number[] });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (gym) setF({ name: gym.name, branch: gym.branch ?? '', phone: gym.phone ?? '', address: gym.address ?? '', walkin: String(gym.walkin_price), cc: gym.country_code || '66', closed: gym.closed_weekdays ?? [] });
  }, [gym]);

  const country = gymCountry({ country_code: f.cc });
  const toggle = (d: number) => setF(x => ({ ...x, closed: x.closed.includes(d) ? x.closed.filter(y => y !== d) : [...x.closed, d].sort() }));

  async function save() {
    const price = Number(f.walkin || 0);
    if (!f.name.trim()) { setMsg({ t: 'ใส่ชื่อยิม', ok: false }); return; }
    if (Number.isNaN(price) || price < 0) { setMsg({ t: 'ราคาขาจรต้องเป็นตัวเลข', ok: false }); return; }
    setBusy(true);
    const { error } = await supabase.from('gyms').update({
      name: f.name.trim(), branch: f.branch.trim() || null, phone: f.phone.trim() || null, address: f.address.trim() || null,
      walkin_price: price, country_code: f.cc, closed_weekdays: f.closed,
    }).eq('id', id);
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    setMsg({ t: 'บันทึกแล้ว', ok: true }); reload();
  }

  async function delGym() {
    setBusy(true);
    const { error } = await supabase.from('gyms').delete().eq('id', id);
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    router.replace('/admin' as any);
  }

  return (
    <GymFrame id={id} gym={gym} role={role} active="settings">
      <Header title="ตั้งค่ายิม" sub={gym?.name} back={() => router.replace(`/gym/${id}` as any)} />
      {!isManager(role) && gym ? <Notice text="เฉพาะเจ้าของและ Admin แก้ไขได้" /> : null}
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      <Card>
        <Field label="ชื่อยิม" value={f.name} onChangeText={v => setF({ ...f, name: v })} />
        <Field label="สาขา" value={f.branch} onChangeText={v => setF({ ...f, branch: v })} />
        <Field label="เบอร์โทรยิม" value={f.phone} onChangeText={v => setF({ ...f, phone: v })} keyboardType="phone-pad" />
        <Field label="ที่อยู่" value={f.address} onChangeText={v => setF({ ...f, address: v })} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
        <Field label="ราคาขาจรต่อวัน" value={f.walkin} onChangeText={v => setF({ ...f, walkin: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" />

        <View style={{ gap: 6 }}>
          <Txt bold size={13.5}>ประเทศของยิม</Txt>
          <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}
            style={{ borderWidth: 1, borderColor: open ? C.accent : C.line, borderRadius: R.field, padding: 12, backgroundColor: C.surface }}>
            <Txt>{country.flag} {country.name} (+{country.dial}) ▾</Txt>
          </Pressable>
          {open ? (
            <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.field, maxHeight: 240 }}>
              <ScrollView nestedScrollEnabled>
                {COUNTRIES.map(c => (
                  <Pressable key={c.code} onPress={() => { setF({ ...f, cc: c.dial }); setOpen(false); }}
                    style={{ flexDirection: 'row', gap: 10, padding: 10, backgroundColor: c.dial === f.cc ? C.accentSoft : 'transparent' }}>
                    <Txt>{c.flag}</Txt><Txt style={{ flex: 1 }}>{c.name}</Txt><Txt muted>+{c.dial}</Txt>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <Txt muted size={12}>ใช้เติมรหัสประเทศให้เบอร์ที่พิมพ์ที่เคาน์เตอร์ เช่น 081… เป็น +66 81…</Txt>
        </View>

        <View style={{ gap: 8 }}>
          <Txt bold size={13.5}>วันปิดประจำ</Txt>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {DAYS_SHORT.map((d, i) => {
              const on = f.closed.includes(i);
              return (
                <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(i)}
                  style={{ minWidth: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt bold style={{ color: on ? '#fff' : C.fg }}>{d}</Txt>
                </Pressable>
              );
            })}
          </View>
          <Txt muted size={12}>มีผลกับแพ็กเกจที่ขายหลังจากนี้ (วันปิดไม่นับอายุ)</Txt>
        </View>
        {isManager(role) ? <Btn label="บันทึก" onPress={save} loading={busy} /> : null}
      </Card>
      {profile?.is_super_admin ? (
        <Card>
          <Txt bold>ลบยิมนี้ (Super Admin)</Txt>
          <Txt muted size={13}>ลบยิม สมาชิก แพ็กเกจ เช็กอิน ขาจร และทีมงานของยิมนี้ทั้งหมด กู้คืนไม่ได้ · บัญชีผู้ใช้ของทุกคนยังอยู่</Txt>
          <ConfirmBtn label="ลบยิมนี้" confirmLabel={`กดอีกครั้ง: ลบ ${gym?.name ?? 'ยิมนี้'} ถาวร`} onConfirm={delGym} loading={busy} />
        </Card>
      ) : null}
    </GymFrame>
  );
}
