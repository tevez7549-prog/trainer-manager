import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { Btn, Card, H, Notice, Pill, Row, Screen, Txt } from '../../../src/ui';

type Gym = { id: string; name: string; branch: string | null; phone: string | null; walkin_price: number; closed_weekdays: number[] };
type Staff = { role: string; user_id: string; profile: { display_name: string; uid: number } | null };
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', admin: 'Admin', operator: 'Operator', trainer: 'เทรนเนอร์' };

export default function GymHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [gym, setGym] = useState<Gym | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [err, setErr] = useState('');

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const [g, s] = await Promise.all([
        supabase.from('gyms').select('id,name,branch,phone,walkin_price,closed_weekdays').eq('id', id).single(),
        supabase.from('gym_staff').select('role,user_id,profile:profiles(display_name,uid)').eq('gym_id', id).eq('active', true),
      ]);
      if (!alive) return;
      if (g.error) { setErr('เปิดยิมนี้ไม่ได้ หรือคุณไม่ได้อยู่ในทีม'); return; }
      setGym(g.data as Gym); setStaff((s.data as any) ?? []);
    })();
    return () => { alive = false; };
  }, [id]));

  const myRole = staff.find(s => s.user_id === profile?.id)?.role;

  return (
    <Screen>
      <Btn kind="ghost" label="‹ หน้าแรก" onPress={() => router.replace('/')} style={{ alignSelf: 'flex-start', minHeight: 40 }} />
      {err ? <Notice text={err} /> : null}
      {gym ? <>
        <View style={{ gap: 4 }}>
          <H size={26}>{gym.name}</H>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {gym.branch ? <Txt muted>สาขา{gym.branch}</Txt> : null}
            {myRole ? <Pill text={ROLE_TH[myRole]} /> : null}
          </View>
        </View>

        <Card>
          <H size={17}>เคาน์เตอร์</H>
          <Txt muted>เช็กอิน เพิ่มสมาชิก ขาจร และนำเข้า Excel กำลังทำเป็นขั้นถัดไป</Txt>
        </Card>

        <Card>
          <H size={17}>ข้อมูลยิม</H>
          <Txt>ราคาขาจร ฿{Number(gym.walkin_price).toLocaleString('en-US')} / วัน</Txt>
          <Txt>วันปิดประจำ: {gym.closed_weekdays?.length ? gym.closed_weekdays.map(d => DAYS[d]).join(', ') : 'ไม่มี'}</Txt>
          {gym.phone ? <Txt>โทร {gym.phone}</Txt> : null}
        </Card>

        <Card>
          <H size={17}>ทีมงาน ({staff.length})</H>
          {staff.map(s => (
            <Row key={s.user_id} icon={(s.profile?.display_name || '?').slice(0, 2)} title={s.profile?.display_name || '(ไม่มีชื่อ)'}
              sub={s.profile ? `UID ${s.profile.uid}` : undefined} right={<Pill text={ROLE_TH[s.role] || s.role} kind={s.role === 'owner' ? 'ok' : 'info'} />} />
          ))}
          <Txt muted size={12.5}>เพิ่ม Admin / Operator / เทรนเนอร์ ด้วย UID จะทำในขั้นถัดไป</Txt>
        </Card>
      </> : !err ? <Txt muted>กำลังโหลด…</Txt> : null}
    </Screen>
  );
}
