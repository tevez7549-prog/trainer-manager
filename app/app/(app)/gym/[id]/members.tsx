import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useGym } from '../../../../src/lib/gym';
import { loadMembers, searchMembers, type Member, type MemberStatus } from '../../../../src/lib/counter';
import { Btn, Card, Chips, Field, Header, Notice, Screen, Txt } from '../../../../src/ui';
import { MemberRow } from '../../../../src/ui/MemberRow';
import { GymFrame } from '../../../../src/ui/GymFrame';

type Filter = 'all' | MemberStatus;
const PAGE = 50;

export default function Members() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role } = useGym(id);
  const [rows, setRows] = useState<Member[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const [n, setN] = useState(PAGE);

  useFocusEffect(useCallback(() => {
    loadMembers(id).then(r => { setRows(r.rows); setOffline(r.offline); });
  }, [id]));

  const count = (s: Filter) => (rows ?? []).filter(m => s === 'all' || m.status === s).length;
  const list = useMemo(() => {
    const base = q.trim() ? searchMembers(rows ?? [], q, 500) : rows ?? [];
    const out = base.filter(m => f === 'all' || m.status === f);
    // most urgent first when looking at expiring / expired
    if (f === 'expiring') out.sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0));
    if (f === 'expired') out.sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''));
    return out;
  }, [rows, q, f]);

  const opts: { v: Filter; t: string }[] = [
    { v: 'all', t: `ทั้งหมด ${count('all')}` }, { v: 'active', t: `ใช้งาน ${count('active')}` },
    { v: 'expiring', t: `ใกล้หมด ${count('expiring')}` }, { v: 'expired', t: `หมดอายุ ${count('expired')}` },
    { v: 'pt_only', t: `PT อย่างเดียว ${count('pt_only')}` }, { v: 'none', t: `ไม่มีแพ็กเกจ ${count('none')}` },
  ];

  return (
    <GymFrame id={id} gym={gym} role={role} active="members">
      <Header title="สมาชิก" sub={gym?.name} back={() => router.replace(`/gym/${id}` as any)} />
      {offline ? <Notice kind="info" text="ออฟไลน์ · แสดงรายชื่อที่บันทึกไว้ในเครื่อง" /> : null}
      <Btn label="+ เพิ่มสมาชิก" onPress={() => router.push(`/gym/${id}/member/new` as any)} />
      <Field label="ค้นหา" value={q} onChangeText={t => { setQ(t); setN(PAGE); }} placeholder="ชื่อ / เบอร์ / รหัสสมาชิก" />
      <Chips options={opts} value={f} onChange={v => { setF(v); setN(PAGE); }} />
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {rows === null ? <Txt muted style={{ paddingVertical: 12 }}>กำลังโหลด…</Txt> : null}
        {rows && !list.length ? <Txt muted style={{ paddingVertical: 12 }}>ไม่มีสมาชิกในกลุ่มนี้</Txt> : null}
        {list.slice(0, n).map(m => <MemberRow key={m.id} m={m} onPress={() => router.push(`/gym/${id}/member/${m.id}` as any)} />)}
      </Card>
      {list.length > n ? <View><Btn kind="ghost" label={`แสดงเพิ่ม (${list.length - n})`} onPress={() => setN(n + PAGE)} /></View> : null}
    </GymFrame>
  );
}
