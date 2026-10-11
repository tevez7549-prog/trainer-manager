import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../src/lib/supabase';
import { baht, thDate, todayISO, todayRange, useGym } from '../../../../src/lib/gym';
import { APPT_COLS, APPT_TH, apptRange, sessionsLeft, tcName, type Appt } from '../../../../src/lib/trainer';
import { Btn, Card, Header, Label, Notice, Pill, Row, Stat, Txt } from '../../../../src/ui';
import { GymFrame } from '../../../../src/ui/GymFrame';
import { C } from '../../../../src/lib/theme';

type Today = { checkins: number; income: number; expiring: number; ptLow: number };
type A = Appt & { trainer?: { display_name: string } | null };

/** Owner / manager home: what needs doing today, nothing else */
export default function GymToday() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role, err } = useGym(id);
  const [t, setT] = useState<Today | null>(null);
  const [appts, setAppts] = useState<A[]>([]);

  useFocusEffect(useCallback(() => {
    if (role !== 'owner' && role !== 'admin') return;
    let alive = true;
    (async () => {
      const { from, to } = todayRange();
      const [c, w, ms, pk, ex, tcs] = await Promise.all([
        supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('gym_id', id).gte('checked_at', from).lt('checked_at', to),
        supabase.from('walkins').select('price').eq('gym_id', id).gte('at', from).lt('at', to),
        supabase.from('memberships').select('price').eq('gym_id', id).gte('created_at', from).lt('created_at', to),
        supabase.from('pt_packages').select('price').eq('gym_id', id).gte('created_at', from).lt('created_at', to),
        supabase.from('member_status').select('id', { count: 'exact', head: true }).eq('gym_id', id).eq('status', 'expiring'),
        supabase.from('trainer_clients').select('id').eq('gym_id', id).eq('status', 'active'),
      ]);
      const sum = (r: any) => ((r.data as { price: number }[]) ?? []).reduce((a, x) => a + Number(x.price), 0);
      const ids = ((tcs.data as { id: string }[]) ?? []).map(x => x.id);
      const left = await sessionsLeft(ids);
      const a = ids.length ? await supabase.from('appointments')
        .select(APPT_COLS + ',trainer:profiles!appointments_trainer_id_fkey(display_name)')
        .in('trainer_client_id', ids).gte('starts_at', from).lt('starts_at', to).neq('status', 'cancelled').order('starts_at') : { data: [] };
      if (!alive) return;
      setT({ checkins: c.count ?? 0, income: sum(w) + sum(ms) + sum(pk), expiring: ex.count ?? 0, ptLow: ids.filter(x => (left[x] ?? 0) <= 2).length });
      setAppts(((a.data as any) ?? []) as A[]);
    })();
    return () => { alive = false; };
  }, [id, role]));

  if (role === 'operator') return <Redirect href={`/gym/${id}/counter` as any} />;
  const go = (p: string) => router.push(`/gym/${id}/${p}` as any);
  const todo = t ? [
    t.expiring ? { k: 'exp', t: 'สมาชิกใกล้หมดใน 7 วัน', n: t.expiring, go: () => go('members?f=expiring') } : null,
    t.ptLow ? { k: 'pt', t: 'PT เหลือไม่เกิน 2 ครั้ง', n: t.ptLow, go: () => router.replace(`/gym/${id}/pt?low=1` as any) } : null,
  ].filter(Boolean) as { k: string; t: string; n: number; go: () => void }[] : [];

  return (
    <GymFrame id={id} gym={gym} role={role} active="home">
      <Header title="วันนี้" sub={gym?.name} right={<Txt muted size={14}>{thDate(todayISO())}</Txt>} />
      {err ? <Notice text={err} /> : null}

      <Btn icon="circle-check" label="เช็กอินสมาชิก" onPress={() => router.replace(`/gym/${id}/counter` as any)} style={{ minHeight: 60 }} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat n={t?.checkins ?? '–'} t="เช็กอินวันนี้" />
        <Stat n={t ? baht(t.income) : '–'} t="รายรับวันนี้" />
      </View>

      <View style={{ gap: 8 }}>
        <Label>ต้องดูแล</Label>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {t && !todo.length ? <Txt muted style={{ paddingVertical: 14 }}>เรียบร้อยดี ไม่มีอะไรค้าง</Txt> : null}
          {todo.map(x => (
            <Row key={x.k} ic="triangle-alert" title={x.t} right={<Pill text={`${x.n} คน`} kind="warn" />} onPress={x.go} />
          ))}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Label style={{ flex: 1 }}>นัด PT วันนี้ · ทุกเทรนเนอร์</Label>
          <Txt size={14} style={{ color: C.accent }} onPress={() => router.replace(`/gym/${id}/pt` as any)}>ดูทั้งหมด</Txt>
        </View>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {!appts.length ? <Txt muted style={{ paddingVertical: 14 }}>วันนี้ไม่มีนัด PT</Txt> : null}
          {appts.map(a => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Txt bold style={{ width: 52, color: C.accent }}>{apptRange(a).split('–')[0]}</Txt>
              <View style={{ flex: 1 }}>
                <Txt bold>{tcName(a.tc)}</Txt>
                <Txt muted size={14}>กับ {a.trainer?.display_name ?? 'เทรนเนอร์'}</Txt>
              </View>
              <Pill text={APPT_TH[a.status].t} kind={APPT_TH[a.status].k} />
            </View>
          ))}
        </Card>
      </View>
    </GymFrame>
  );
}
