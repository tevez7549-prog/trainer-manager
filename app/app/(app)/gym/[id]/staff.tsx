import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/lib/auth';
import { ROLE_TH, type Role, useGym } from '../../../../src/lib/gym';
import { Btn, Card, Chips, ConfirmBtn, Field, H, Header, Notice, Pill, Row, Screen, Txt } from '../../../../src/ui';

type Staff = { role: Role; user_id: string; active: boolean; profile: { display_name: string; uid: number } | null };
const ADDABLE: { v: Role; t: string }[] = [{ v: 'admin', t: 'Admin' }, { v: 'operator', t: 'Operator' }, { v: 'trainer', t: 'เทรนเนอร์' }];
const ROLE_HINT: Record<string, string> = {
  admin: 'ทำได้ทุกอย่างที่เคาน์เตอร์ + ตั้งแพ็กเกจ นำเข้า Excel แก้/ลบรายการ',
  operator: 'เช็กอิน เพิ่มสมาชิก ขายแพ็กเกจ ขาจร (แก้หรือลบรายการเก่าไม่ได้)',
  trainer: 'เทรนเนอร์ของยิม · ดูได้เฉพาะลูกเทรนของตัวเอง',
};

export default function StaffPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { gym, role } = useGym(id);
  const [list, setList] = useState<Staff[]>([]);
  const [uid, setUid] = useState('');
  const [newRole, setNewRole] = useState<Role>('operator');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const owner = role === 'owner';

  const load = useCallback(async () => {
    const { data } = await supabase.from('gym_staff').select('role,user_id,active,profile:profiles(display_name,uid)').eq('gym_id', id).eq('active', true).order('created_at');
    setList(((data as any) ?? []) as Staff[]);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    const n = Number(uid.replace(/\D/g, ''));
    if (!n) { setMsg({ t: 'ใส่ UID (ตัวเลข 6 หลัก)', ok: false }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('gym_add_staff', { g: id, staff_uid: n, staff_role: newRole });
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    setMsg({ t: `เพิ่ม ${(data as any)?.display_name || 'UID ' + n} เป็น ${ROLE_TH[newRole]} แล้ว`, ok: true });
    setUid(''); load();
  }

  async function setRole(s: Staff, r: Role) {
    const { error } = await supabase.from('gym_staff').update({ role: r }).eq('gym_id', id).eq('user_id', s.user_id);
    if (error) setMsg({ t: thError(error), ok: false }); else { setEdit(null); load(); }
  }
  async function remove(s: Staff) {
    const { error } = await supabase.from('gym_staff').update({ active: false }).eq('gym_id', id).eq('user_id', s.user_id);
    if (error) setMsg({ t: thError(error), ok: false }); else { setEdit(null); setMsg({ t: `นำ ${s.profile?.display_name ?? ''} ออกจากทีมแล้ว`, ok: true }); load(); }
  }

  return (
    <Screen>
      <Header title="ทีมงาน" sub={gym?.name} back={() => router.replace(`/gym/${id}` as any)} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {owner ? (
        <Card>
          <H size={17}>เพิ่มคนเข้าทีม</H>
          <Txt muted size={13.5}>ให้อีกฝ่ายสมัครแอปก่อน แล้วเปิดหน้า "ฉัน" จะเห็น UID 6 หลัก</Txt>
          <Field label="UID" value={uid} onChangeText={setUid} keyboardType="number-pad" placeholder="เช่น 100002" />
          <Chips label="ตำแหน่ง" options={ADDABLE} value={newRole} onChange={setNewRole} />
          <Txt muted size={12.5}>{ROLE_HINT[newRole]}</Txt>
          <Btn label="เพิ่มเข้าทีม" onPress={add} loading={busy} />
        </Card>
      ) : null}

      <Card style={{ gap: 4 }}>
        <H size={17}>ทีมตอนนี้ ({list.length})</H>
        {list.map(s => (
          <View key={s.user_id}>
            <Row icon={(s.profile?.display_name || '?').slice(0, 2)} title={s.profile?.display_name || '(ไม่มีชื่อ)'}
              sub={s.profile ? `UID ${s.profile.uid}${s.user_id === profile?.id ? ' · คุณ' : ''}` : undefined}
              right={<Pill text={ROLE_TH[s.role] || s.role} kind={s.role === 'owner' ? 'ok' : 'info'} />}
              onPress={owner && s.role !== 'owner' ? () => setEdit(edit === s.user_id ? null : s.user_id) : undefined} />
            {edit === s.user_id ? (
              <View style={{ gap: 10, paddingBottom: 12 }}>
                <Chips label="เปลี่ยนตำแหน่ง" options={ADDABLE} value={s.role} onChange={r => setRole(s, r)} />
                <ConfirmBtn label="นำออกจากทีม" onConfirm={() => remove(s)} />
              </View>
            ) : null}
          </View>
        ))}
      </Card>
      {!owner ? <Txt muted size={12.5}>เฉพาะเจ้าของยิมเพิ่มหรือนำคนออกจากทีมได้</Txt> : null}
    </Screen>
  );
}
