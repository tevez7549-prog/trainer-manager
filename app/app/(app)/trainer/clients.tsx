import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { TRAINER_TABS } from '../../../src/lib/nav';
import { apptRange, dayLabel, sessionsLeft, TC_COLS, tcName, tcPhone, type TC } from '../../../src/lib/trainer';
import { Card, Field, Header, Notice, Pill, Row, Screen, Txt } from '../../../src/ui';
import { TabBar } from '../../../src/ui/TabBar';

type Next = { trainer_client_id: string; starts_at: string; duration_min: number };

/** My trainees. New ones arrive by themselves when the counter sells PT with me as the trainer. */
export default function TrainerClients() {
  const { profile } = useAuth();
  const [tcs, setTcs] = useState<TC[] | null>(null);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [next, setNext] = useState<Record<string, Next>>({});
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('trainer_clients').select(TC_COLS).eq('trainer_id', profile.id).eq('status', 'active').order('created_at', { ascending: false });
    const list = ((data as any) ?? []) as TC[];
    setTcs(list);
    const ids = list.map(x => x.id);
    if (!ids.length) return;
    const [l, a] = await Promise.all([
      sessionsLeft(ids),
      supabase.from('appointments').select('trainer_client_id,starts_at,duration_min').in('trainer_client_id', ids).eq('status', 'scheduled')
        .gte('starts_at', new Date().toISOString()).order('starts_at').limit(200),
    ]);
    setLeft(l);
    const nx: Record<string, Next> = {};
    ((a.data as Next[]) ?? []).forEach(x => { if (!nx[x.trainer_client_id]) nx[x.trainer_client_id] = x; });
    setNext(nx);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tcs ?? []).filter(t => !s || tcName(t).toLowerCase().includes(s) || tcPhone(t).replace(/\D/g, '').includes(s.replace(/\D/g, '') || '§'));
  }, [tcs, q]);

  return (
    <Screen footer={<TabBar tabs={TRAINER_TABS} active="clients" />}>
      <Header title={`ลูกเทรน${tcs ? ` (${tcs.length})` : ''}`} sub={profile?.display_name} />
      {(tcs?.length ?? 0) > 5 ? <Field label="ค้นหา" value={q} onChangeText={setQ} placeholder="ชื่อหรือเบอร์" icon="search" /> : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {tcs === null ? <Txt muted style={{ paddingVertical: 14 }}>กำลังโหลด…</Txt> : !tcs.length ? <Txt muted style={{ paddingVertical: 14 }}>ยังไม่มีลูกเทรน</Txt> : null}
        {shown.map(t => {
          const n = left[t.id] ?? 0, nx = next[t.id];
          return (
            <Row key={t.id} icon={tcName(t).slice(0, 2)} title={tcName(t)}
              sub={nx ? `นัดถัดไป ${dayLabel(nx.starts_at)} ${apptRange(nx).split('–')[0]}` : 'ยังไม่มีนัด'}
              right={<Pill text={`เหลือ ${n} ครั้ง`} kind={n === 0 ? 'bad' : n <= 2 ? 'warn' : 'ok'} />}
              onPress={() => router.push(`/trainer/client/${t.id}` as any)} />
          );
        })}
      </Card>
      <Notice kind="info" text="ลูกเทรนใหม่จะขึ้นที่นี่เองเมื่อเคาน์เตอร์ขาย PT ให้คุณ ไม่ต้องเพิ่มเอง" />
    </Screen>
  );
}
