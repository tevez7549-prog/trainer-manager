import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/lib/auth';
import { addDays, ROLE_TH, thDate, thDateTs, todayISO } from '../../../../src/lib/gym';
import { DEFAULT_COUNTRY, phoneError, splitE164, toE164, type Country } from '../../../../src/lib/phone';
import { adminFn, audit, daysTo, genPassword, KINDS, planState, savePlans, USER_COLS, type AdminUser, type Kind, type PlanState } from '../../../../src/lib/admin';
import { Btn, Card, Chips, ConfirmBtn, DateField, Field, H, Header, Notice, Screen, Txt } from '../../../../src/ui';
import { PhoneField } from '../../../../src/ui/PhoneField';
import { C } from '../../../../src/lib/theme';

export default function AdminUserPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const isNew = id === 'new';
  const [u, setU] = useState<AdminUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [note, setNote] = useState('');
  const [pw, setPw] = useState(isNew ? genPassword() : '');
  const [status, setStatus] = useState<'active' | 'suspended'>('active');
  const [plans, setPlans] = useState<PlanState>(planState(null));
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const self = !isNew && id === profile?.id;

  const load = useCallback(async () => {
    if (isNew) return;
    const { data, error } = await supabase.from('profiles').select(USER_COLS).eq('id', id).single();
    if (error || !data) { setMsg({ t: 'ไม่พบผู้ใช้นี้', ok: false }); return; }
    const x = data as any as AdminUser;
    setU(x); setName(x.display_name); setEmail(x.email ?? ''); setNote(x.dev_note ?? ''); setStatus(x.status); setPlans(planState(x)); setPw('');
    const sp = splitE164(x.phone); setCountry(sp.country); setPhone(sp.local);
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  const setPlan = (k: Kind, v: Partial<PlanState[Kind]>) => setPlans(p => ({ ...p, [k]: { ...p[k], ...v } }));

  async function save() {
    const e164 = phone.trim() ? toE164(phone, country) : null;
    if (!name.trim()) { setMsg({ t: 'ใส่ชื่อ', ok: false }); return; }
    if (phone.trim()) { const pe = phoneError(phone, country); if (pe) { setMsg({ t: pe, ok: false }); return; } }
    const em = email.trim().toLowerCase();
    if ((isNew || em) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setMsg({ t: 'รูปแบบอีเมลไม่ถูก', ok: false }); return; }
    if (isNew && pw.length < 8) { setMsg({ t: 'รหัสผ่านอย่างน้อย 8 ตัว', ok: false }); return; }
    if (!isNew && pw && pw.length < 8) { setMsg({ t: 'รหัสผ่านใหม่อย่างน้อย 8 ตัว', ok: false }); return; }
    const pl = { ...plans };
    (Object.keys(pl) as Kind[]).forEach(k => { if (pl[k].st === 'trial' && !pl[k].until) pl[k] = { ...pl[k], until: addDays(todayISO(), 7) }; });
    setBusy(true); setMsg(null);
    try {
      if (isNew) {
        const r = await adminFn({ action: 'create', email: em, password: pw, display_name: name.trim(), phone: e164 });
        const x = await supabase.from('profiles').update({ display_name: name.trim(), phone: e164, dev_note: note.trim() || null }).eq('id', r.id);
        if (x.error) throw x.error;
        await savePlans(r.id, null, pl);
        setBusy(false);
        router.replace(`/admin/user/${r.id}?created=1` as any);
        return;
      }
      const ch: string[] = [];
      const upd: Record<string, unknown> = {};
      if (u!.display_name !== name.trim()) upd.display_name = name.trim();
      if ((u!.phone ?? null) !== e164) upd.phone = e164;
      if ((u!.dev_note ?? '') !== note.trim()) upd.dev_note = note.trim() || null;
      if (Object.keys(upd).length) {
        const x = await supabase.from('profiles').update(upd).eq('id', u!.id); if (x.error) throw x.error;
        ch.push('ข้อมูล'); await audit(profile!.id, 'edit_profile', u!.id, upd);
      }
      if (em && (u!.email ?? '') !== em) { await adminFn({ action: 'set_email', id: u!.id, email: em }); ch.push('อีเมล'); }
      if (pw) { await adminFn({ action: 'set_password', id: u!.id, password: pw }); ch.push('รหัสผ่าน'); }
      if (!self && u!.status !== status) { await adminFn({ action: 'set_status', id: u!.id, status }); ch.push(status === 'suspended' ? 'ระงับ' : 'ปลดระงับ'); }
      const pc = await savePlans(u!.id, u, pl);
      if (pc.length) { ch.push('แผน'); await audit(profile!.id, 'edit_plan', u!.id, { kinds: pc }); }
      setBusy(false); setPw('');
      setMsg({ t: ch.length ? `บันทึกแล้ว · ${ch.join(', ')}` : 'ไม่มีอะไรเปลี่ยน', ok: true });
      load();
    } catch (e: any) {
      setBusy(false); setMsg({ t: thError(e?.message ?? e), ok: false }); load();
    }
  }

  async function del() {
    setBusy(true);
    try { await adminFn({ action: 'delete', id: u!.id }); router.replace('/admin' as any); }
    catch (e: any) { setBusy(false); setMsg({ t: thError(e?.message ?? e), ok: false }); }
  }

  if (!profile?.is_super_admin) return <Screen><Header title="Super Admin" back={() => router.replace('/')} /><Notice text="หน้านี้สำหรับ Super Admin เท่านั้น" /></Screen>;
  const created = typeof window !== 'undefined' && /created=1/.test(window.location?.search ?? '');

  return (
    <Screen>
      <Header title={isNew ? 'เพิ่มผู้ใช้' : (u?.display_name || 'ผู้ใช้')} sub={u ? `UID ${u.uid} · สมัคร ${thDateTs(u.created_at)}${self ? ' · คุณ' : ''}` : undefined}
        back={() => router.replace('/admin' as any)} />
      {created && !msg ? <Notice kind="ok" text="เพิ่มผู้ใช้แล้ว · ส่งอีเมลกับรหัสผ่านเริ่มต้นให้ผู้ใช้ได้เลย" /> : null}
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {u && u.gym_staff.some(s => s.active) ? (
        <Card style={{ gap: 2 }}>
          <Txt bold size={13.5}>ยิม · บทบาท</Txt>
          {u.gym_staff.filter(s => s.active).map((s, i) => <Txt key={i}>{s.gyms?.name ?? '?'}{s.gyms?.branch ? ` (${s.gyms.branch})` : ''} · {ROLE_TH[s.role] ?? s.role}</Txt>)}
        </Card>
      ) : null}

      <Card>
        <Field label="ชื่อที่แสดง" value={name} onChangeText={setName} />
        <Field label={isNew ? 'อีเมล (ใช้ล็อกอิน)' : 'อีเมล'} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
          hint={!isNew && !u?.email ? 'บัญชีนี้ล็อกอินด้วย LINE ไม่มีอีเมล · ใส่ได้ถ้าต้องการให้ล็อกอินด้วยอีเมลด้วย' : undefined} />
        <PhoneField label="เบอร์โทร" country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} />
        <Field label={isNew ? 'รหัสผ่านเริ่มต้น' : 'ตั้งรหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)'} value={pw} onChangeText={setPw} autoCapitalize="none"
          hint={isNew ? 'จดแล้วส่งให้ผู้ใช้ · อย่างน้อย 8 ตัว' : undefined} />
        <Btn kind="ghost" label="สุ่มรหัสผ่าน" onPress={() => setPw(genPassword())} style={{ alignSelf: 'flex-start', minHeight: 38 }} />
        <Field label="โน้ตนักพัฒนา" value={note} onChangeText={setNote} placeholder="เช่น บัญชีทดสอบ, ยิมนำร่อง" />
      </Card>

      <Card>
        <H size={17}>แผน</H>
        {KINDS.map(({ k, t }) => (
          <View key={k} style={{ gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Chips label={t} options={[{ v: 'none', t: 'ไม่มี' }, { v: 'trial', t: 'ทดลอง' }, { v: 'active', t: 'จ่ายแล้ว' }]} value={plans[k].st}
              onChange={v => setPlan(k, { st: v as any, until: v === 'none' ? '' : plans[k].until || addDays(todayISO(), v === 'trial' ? 7 : 30) })} />
            {plans[k].st !== 'none' ? <>
              <DateField label={plans[k].st === 'trial' ? 'ทดลองถึง' : 'จ่ายถึง'} value={plans[k].until} onChange={v => setPlan(k, { until: v })}
                hint={plans[k].until ? (daysTo(plans[k].until) < 0 ? 'หมดแล้ว' : `เหลือ ${daysTo(plans[k].until)} วัน · ถึง ${thDate(plans[k].until, true)}`) : undefined} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[7, 30].map(n => <Btn key={n} kind="ghost" label={`+${n} วัน`} style={{ minHeight: 36 }}
                  onPress={() => setPlan(k, { until: addDays(plans[k].until && plans[k].until > todayISO() ? plans[k].until : todayISO(), n) })} />)}
              </View>
            </> : null}
          </View>
        ))}
      </Card>

      {!isNew && !self ? (
        <Card>
          <Chips label="สถานะบัญชี" options={[{ v: 'active', t: 'ใช้งาน' }, { v: 'suspended', t: 'ระงับ' }]} value={status} onChange={setStatus} />
          <Txt muted size={12.5}>ระงับ = ล็อกอินไม่ได้ แต่ข้อมูลยังอยู่ · ปลดได้ทุกเมื่อ</Txt>
        </Card>
      ) : null}

      <Btn label={isNew ? 'เพิ่มผู้ใช้' : 'บันทึก'} onPress={save} loading={busy} />
      {!isNew && !self && u ? (
        <ConfirmBtn label="ลบผู้ใช้นี้ถาวร" confirmLabel={`กดอีกครั้ง: ลบ ${u.display_name || u.email} ถาวร (กู้คืนไม่ได้)`} onConfirm={del} loading={busy} />
      ) : null}
    </Screen>
  );
}
