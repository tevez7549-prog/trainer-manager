import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../src/lib/auth';
import { isManager, ROLE_TH, useGym } from '../../../../src/lib/gym';
import { rememberGym, usePlaces } from '../../../../src/lib/nav';
import { Card, Header, Label, Pill, Row } from '../../../../src/ui';
import { GymFrame } from '../../../../src/ui/GymFrame';

/** Things used now and then: settings, team, other gyms, my account */
export default function More() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role } = useGym(id);
  const { profile, signOut } = useAuth();
  const places = usePlaces();
  const go = (p: string) => router.push(`/gym/${id}/${p}` as any);
  const others = (places ?? []).filter(p => p.gym.id !== id);

  return (
    <GymFrame id={id} gym={gym} role={role} active="more">
      <Header title="เพิ่มเติม" sub={gym?.name} />

      {isManager(role) ? <>
        <Label>ตั้งค่ายิม</Label>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <Row ic="tag" title="แพ็กเกจและราคา" sub="สมาชิกรายเดือน และ PT" onPress={() => go('plans')} />
          <Row ic="dumbbell" title="เทรนเนอร์" sub="รายชื่อ (มีแอปหรือไม่มีก็ได้) และตารางว่าง" onPress={() => go('coaches')} />
          <Row ic="id-card" title="ทีมงาน" sub="ผู้จัดการ · พนักงานเคาน์เตอร์ (คนที่ใช้แอปทำงานที่ยิม)" onPress={() => go('staff')} />
          <Row ic="calendar-off" title="วันหยุดยิม" sub="ปิดพิเศษ เลื่อนวันหมดสมาชิกให้เอง" onPress={() => go('holidays')} />
          <Row ic="file-up" title="นำเข้าสมาชิกจาก Excel" sub="ย้ายจากระบบเดิม" onPress={() => go('import')} />
          <Row ic="settings" title="ข้อมูลยิม" sub="ชื่อ ราคาขาจร วันปิดประจำ" onPress={() => go('settings')} />
        </Card>
      </> : null}

      <Label>ยิมของฉัน</Label>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {others.map(p => (
          <Row key={p.gym.id} icon={p.gym.name.slice(0, 2)} title={`ไปที่ ${p.gym.name}`} sub={p.gym.branch || undefined}
            right={<Pill text={ROLE_TH[p.role]} kind={p.role === 'owner' ? 'ok' : 'info'} />}
            onPress={() => { rememberGym(p.gym.id); router.replace((p.role === 'trainer' ? '/trainer' : p.role === 'operator' ? `/gym/${p.gym.id}/counter` : `/gym/${p.gym.id}`) as any); }} />
        ))}
        <Row ic="plus" title="สร้างยิมใหม่" onPress={() => router.push('/gym/new' as any)} />
      </Card>

      <Label>บัญชีของฉัน</Label>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <Row ic="activity" title="ของฉัน" sub="อาหาร น้ำหนัก การเล่น บัตรสมาชิกของตัวเอง" onPress={() => router.replace('/?me=1' as any)} />
        <Row ic="user" title="ฉัน" sub={`UID ${profile?.uid ?? ''} · ชื่อ เบอร์ โหมดสี`} onPress={() => router.push('/me' as any)} />
        {profile?.is_super_admin ? <Row ic="shield" title="หลังบ้าน (Super Admin)" onPress={() => router.push('/admin' as any)} /> : null}
        <Row ic="log-out" title="ออกจากระบบ" danger onPress={signOut} />
      </Card>
    </GymFrame>
  );
}
