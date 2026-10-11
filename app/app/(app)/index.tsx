import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { Btn, Card, H, Notice, Pill, Row, Screen, Txt } from '../../src/ui';
import { C } from '../../src/lib/theme';

type MyGym = { role: string; gym: { id: string; name: string; branch: string | null } };
const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', admin: 'Admin', operator: 'Operator', trainer: 'เทรนเนอร์' };

export default function Home() {
  const { profile } = useAuth();
  const [gyms, setGyms] = useState<MyGym[] | null>(null);
  const [err, setErr] = useState('');

  useFocusEffect(useCallback(() => {
    let alive = true;
    supabase.from('gym_staff').select('role, gym:gyms(id,name,branch)').eq('user_id', profile!.id).eq('active', true)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setErr('โหลดข้อมูลยิมไม่สำเร็จ'); else setGyms((data as any) ?? []);
      });
    return () => { alive = false; };
  }, [profile]));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt muted size={13}>สวัสดี</Txt>
          <H size={24}>{profile?.display_name || 'ผู้ใช้ใหม่'}</H>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="หน้าของฉัน" onPress={() => router.push('/me')}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt bold style={{ color: C.accentInk }}>{(profile?.display_name || '?').slice(0, 1)}</Txt>
        </Pressable>
      </View>

      {err ? <Notice text={err} /> : null}

      <Card>
        <H size={17}>ยิมของฉัน</H>
        {gyms === null ? <Txt muted>กำลังโหลด…</Txt> :
          gyms.length === 0 ? <Txt muted>ยังไม่มียิม ถ้าคุณเป็นเจ้าของยิม สร้างยิมได้เลย · ถ้าเป็นทีมงาน ให้เจ้าของยิมเพิ่มคุณด้วย UID {profile?.uid}</Txt> :
            gyms.map(g => (
              <Row key={g.gym.id} icon={g.gym.name.slice(0, 2)} title={g.gym.name} sub={g.gym.branch || undefined}
                right={<Pill text={ROLE_TH[g.role] || g.role} kind={g.role === 'owner' ? 'ok' : 'info'} />}
                onPress={() => router.push(`/gym/${g.gym.id}`)} />
            ))}
        <Btn kind="ghost" label="+ สร้างยิมใหม่" onPress={() => router.push('/gym/new')} />
      </Card>

      <Card>
        <H size={17}>เทรนเนอร์ · ลูกเทรน</H>
        <Txt muted>ส่วนเทรนเนอร์ ลูกเทรน อาหาร และการเทรน กำลังทำ จะเปิดให้ใช้ในเวอร์ชันถัดไป</Txt>
      </Card>

      {profile?.is_super_admin ? (
        <Notice kind="info" text="คุณเป็น Super Admin · จัดการผู้ใช้ได้ที่หน้า Super Admin" />
      ) : null}
    </Screen>
  );
}
