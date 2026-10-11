import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../src/lib/supabase';
import { baht, isDesk, isManager, ROLE_TH, todayRange, useGym } from '../../../../src/lib/gym';
import { Btn, Card, Header, Notice, Pill, Row, Screen, Stat, Txt } from '../../../../src/ui';
import { GymFrame } from '../../../../src/ui/GymFrame';

type Today = { checkins: number; walkins: number; walkinSum: number; expiring: number; expired: number; active: number };

export default function GymHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role, err } = useGym(id);
  const [t, setT] = useState<Today | null>(null);

  useFocusEffect(useCallback(() => {
    if (!isDesk(role)) return;
    let alive = true;
    const { from, to } = todayRange();
    const count = (status: string) => supabase.from('member_status').select('id', { count: 'exact', head: true }).eq('gym_id', id).eq('status', status);
    Promise.all([
      supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('gym_id', id).gte('checked_at', from).lt('checked_at', to),
      supabase.from('walkins').select('price').eq('gym_id', id).gte('at', from).lt('at', to),
      count('expiring'), count('expired'), count('active'),
    ]).then(([c, w, ex, ed, ac]) => {
      if (!alive) return;
      const ws = (w.data as { price: number }[]) ?? [];
      setT({ checkins: c.count ?? 0, walkins: ws.length, walkinSum: ws.reduce((a, x) => a + Number(x.price), 0), expiring: ex.count ?? 0, expired: ed.count ?? 0, active: ac.count ?? 0 });
    });
    return () => { alive = false; };
  }, [id, role]));

  const go = (p: string) => router.push(`/gym/${id}/${p}` as any);

  return (
    <GymFrame id={id} gym={gym} role={role} active="home">
      <Header title={gym?.name ?? 'ยิม'} sub={gym?.branch ? `สาขา${gym.branch}` : undefined} back={() => router.replace('/')}
        right={role ? <Pill text={ROLE_TH[role]} kind={role === 'owner' ? 'ok' : 'info'} /> : null} />
      {err ? <Notice text={err} /> : null}

      {gym && isDesk(role) ? <>
        <Btn icon="circle-check" label="เปิดเคาน์เตอร์ · เช็กอิน" onPress={() => go('counter')} style={{ minHeight: 56 }} />
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Stat n={t?.checkins ?? '–'} t="เช็กอินวันนี้" />
          <Stat n={t?.walkins ?? '–'} t={`ขาจรวันนี้${t?.walkins ? ' · ' + baht(t.walkinSum) : ''}`} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Stat n={t?.active ?? '–'} t="สมาชิกใช้งาน" />
          <Stat n={t?.expiring ?? '–'} t="ใกล้หมด (7 วัน)" kind={t?.expiring ? 'warn' : undefined} />
          <Stat n={t?.expired ?? '–'} t="หมดอายุ" kind={t?.expired ? 'bad' : undefined} />
        </View>
      </> : null}

      {gym && role === 'trainer' ? (
        <Card>
          <Txt muted size={13.5}>คุณอยู่ในทีมยิมนี้ในฐานะเทรนเนอร์ · ลูกเทรน นัด และแพ็กเกจ PT อยู่ที่หน้าเทรนเนอร์</Txt>
          <Btn icon="dumbbell" label="เปิดหน้าเทรนเนอร์" onPress={() => router.push('/trainer' as any)} />
        </Card>
      ) : null}

      {gym ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {isDesk(role) ? <Row ic="users" title="สมาชิก" sub="ค้นหา เพิ่ม ต่ออายุ ดูประวัติ" onPress={() => go('members')} /> : null}
          {isDesk(role) ? <Row ic="dumbbell" title="เทรนเนอร์ & PT" sub="ลูกเทรนของเทรนเนอร์แต่ละคน นัด และครั้งที่เหลือ" onPress={() => go('pt')} /> : null}
          {isDesk(role) ? <Row ic="tag" title="แพ็กเกจสมาชิก" sub={isManager(role) ? 'ตั้งราคาและระยะเวลา' : 'ดูราคา'} onPress={() => go('plans')} /> : null}
          <Row ic="id-card" title="ทีมงาน" sub={role === 'owner' ? 'เพิ่ม Admin / Operator / เทรนเนอร์ ด้วย UID' : 'ดูรายชื่อทีม'} onPress={() => go('staff')} />
          {isManager(role) ? <Row ic="calendar-off" title="วันหยุดยิม" sub="ปิดพิเศษ · เลื่อนวันหมดสมาชิกให้อัตโนมัติ" onPress={() => go('holidays')} /> : null}
          {isManager(role) ? <Row ic="file-up" title="นำเข้าสมาชิกจาก Excel" sub="ใช้ไฟล์ตัวอย่างของเรา" onPress={() => go('import')} /> : null}
          {isManager(role) ? <Row ic="settings" title="ตั้งค่ายิม" sub="ชื่อ ราคาขาจร วันปิด ประเทศ" onPress={() => go('settings')} /> : null}
        </Card>
      ) : !err ? <Txt muted>กำลังโหลด…</Txt> : null}
    </GymFrame>
  );
}
