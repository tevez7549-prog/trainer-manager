import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { supabase, thError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { apptRange, dayLabel, tcName } from '../lib/trainer';
import { C } from '../lib/theme';
import { Btn, Card, H, Txt } from './index';

type Req = {
  id: string; proposed_start: string; message: string | null; created_at: string;
  appt: { id: string; starts_at: string; duration_min: number; trainer_id: string;
    tc: { client_name: string | null; client: { display_name: string } | null; member: { name: string } | null } | null } | null;
};

/** Trainees asking to move a session: approve moves the appointment, decline keeps it */
export function MoveRequests({ onChange }: { onChange: (msg: string, ok: boolean) => void }) {
  const { profile } = useAuth();
  const [list, setList] = useState<Req[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('reschedule_requests')
      .select('id,proposed_start,message,created_at,appt:appointments!inner(id,starts_at,duration_min,trainer_id,tc:trainer_clients(client_name,client:profiles!trainer_clients_client_id_fkey(display_name),member:members(name)))')
      .eq('status', 'pending').eq('appt.trainer_id', profile.id).order('created_at');
    setList(((data as any) ?? []) as Req[]);
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  async function answer(r: Req, ok: boolean) {
    setBusy(r.id + ok);
    if (ok) {
      const a = await supabase.from('appointments').update({ starts_at: r.proposed_start }).eq('id', r.appt!.id);
      if (a.error) { setBusy(''); onChange(thError(a.error), false); return; }
    }
    const { error } = await supabase.from('reschedule_requests').update({ status: ok ? 'approved' : 'declined', decided_by: profile!.id, decided_at: new Date().toISOString() }).eq('id', r.id);
    setBusy('');
    if (error) { onChange(thError(error), false); return; }
    onChange(ok ? `เลื่อนนัดเป็น ${dayLabel(r.proposed_start)} ${apptRange({ starts_at: r.proposed_start, duration_min: r.appt!.duration_min }).split('–')[0]} แล้ว` : 'ปฏิเสธคำขอเลื่อนแล้ว · นัดเดิมยังอยู่', true);
    load();
  }

  if (!list.length) return null;
  return (
    <Card style={{ gap: 10, borderWidth: 1.5, borderColor: C.cautionFg }}>
      <H size={17}>ขอเลื่อนนัด ({list.length})</H>
      {list.map(r => (
        <View key={r.id} style={{ gap: 6, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Txt bold>{tcName(r.appt?.tc as any)}</Txt>
          <Txt size={14}>จาก {r.appt ? `${dayLabel(r.appt.starts_at)} ${apptRange(r.appt).split('–')[0]}` : '–'} → <Txt bold size={14}>{dayLabel(r.proposed_start)} {apptRange({ starts_at: r.proposed_start, duration_min: r.appt?.duration_min ?? 60 }).split('–')[0]}</Txt></Txt>
          {r.message ? <Txt muted size={14}>"{r.message}"</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="ตกลง" onPress={() => answer(r, true)} loading={busy === r.id + true} style={{ flex: 1 }} />
            <Btn kind="ghost" label="ไม่สะดวก" onPress={() => answer(r, false)} loading={busy === r.id + false} style={{ flex: 1 }} />
          </View>
        </View>
      ))}
    </Card>
  );
}
