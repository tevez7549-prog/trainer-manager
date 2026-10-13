import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { addDays, thDate, todayISO } from '../../../src/lib/gym';
import { APPT_COLS, leaveText, markAppt, type Appt, type Leave } from '../../../src/lib/trainer';
import { Btn, Card, ConfirmBtn, DateField, Field, H, Header, Notice, Screen, Txt } from '../../../src/ui';
import { ApptCard } from '../../../src/ui/Appt';
import { C } from '../../../src/lib/theme';

const dayStart = (iso: string) => new Date(iso + 'T00:00:00').toISOString();

export default function LeavePage() {
  const { profile } = useAuth();
  const [list, setList] = useState<Leave[]>([]);
  const [affected, setAffected] = useState<Appt[]>([]);
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('trainer_leave').select('id,start_at,end_at,reason').eq('trainer_id', profile.id).gte('end_at', new Date().toISOString()).order('start_at');
    const ls = (data as Leave[]) ?? [];
    setList(ls);
    // scheduled sessions that fall inside any leave
    const hits: Appt[] = [];
    for (const l of ls) {
      const { data: a } = await supabase.from('appointments').select(APPT_COLS).eq('trainer_id', profile.id).eq('status', 'scheduled').gte('starts_at', l.start_at).lt('starts_at', l.end_at).order('starts_at');
      hits.push(...(((a as any) ?? []) as Appt[]));
    }
    setAffected(hits);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    if (to < from) { setMsg({ t: 'วันสุดท้ายต้องไม่ก่อนวันแรก', ok: false }); return; }
    setBusy(true);
    const { error } = await supabase.from('trainer_leave').insert({ trainer_id: profile!.id, start_at: dayStart(from), end_at: dayStart(addDays(to, 1)), reason: reason.trim() || null });
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    setMsg({ t: `บันทึกวันลา ${thDate(from)}${to !== from ? ' – ' + thDate(to) : ''} แล้ว`, ok: true });
    setReason(''); load();
  }

  async function del(id: string) {
    const { error } = await supabase.from('trainer_leave').delete().eq('id', id);
    if (error) setMsg({ t: thError(error), ok: false }); else load();
  }

  async function cancelAll() {
    setBusy(true);
    let n = 0;
    for (const a of affected) { const { error } = await markAppt(a.id, 'cancelled'); if (!error) n++; }
    setBusy(false);
    setMsg({ t: `ยกเลิกนัด ${n} รายการแล้ว · อย่าลืมแจ้งลูกเทรน`, ok: true });
    load();
  }

  return (
    <Screen>
      <Header title="วันลา" sub="แอปช่วยจำ และเตือนนัดที่ชนกับวันลา" back={() => router.replace('/trainer' as any)} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      <Card>
        <H size={17}>ลาเพิ่ม</H>
        <DateField label="ตั้งแต่" value={from} onChange={v => { setFrom(v); if (to < v) setTo(v); }} />
        <DateField label="ถึง" value={to} onChange={setTo} min={from} />
        <Field label="เหตุผล (ไม่บังคับ)" value={reason} onChangeText={setReason} placeholder="เช่น ป่วย / ธุระ" />
        <Btn label="บันทึกวันลา" onPress={add} loading={busy} />
      </Card>

      {affected.length ? (
        <Card style={{ gap: 2 }}>
          <H size={17} style={{ color: C.warnFg }}>นัดที่ตรงกับวันลา ({affected.length})</H>
          {affected.map(a => <ApptCard key={a.id} a={a} showDay canManage onLeave onDone={(t, ok) => { setMsg({ t, ok }); load(); }} />)}
          <View style={{ marginTop: 8 }}><ConfirmBtn label="ยกเลิกนัดทั้งหมดนี้" onConfirm={cancelAll} loading={busy} /></View>
        </Card>
      ) : null}

      <Card style={{ gap: 6 }}>
        <H size={17}>วันลาที่จะถึง</H>
        {!list.length ? <Txt muted>ไม่มี</Txt> : null}
        {list.map(l => (
          <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 6 }}>
            <Txt style={{ flex: 1 }}>{leaveText(l)}</Txt>
            <Txt muted accessibilityRole="button" accessibilityLabel="ลบวันลานี้" onPress={() => del(l.id)} style={{ padding: 6 }}>ลบ</Txt>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
