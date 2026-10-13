import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { daysBetween, isManager, thDate, thDateTs, todayISO, useGym } from '../../../../src/lib/gym';
import { Btn, Card, ConfirmBtn, DateField, Field, H, Header, Notice, Pill, Txt } from '../../../../src/ui';
import { GymFrame } from '../../../../src/ui/GymFrame';
import { C } from '../../../../src/lib/theme';

type Holiday = { id: string; name: string; start_date: string; end_date: string; applied_at: string | null };

export default function Holidays() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role } = useGym(id);
  const [list, setList] = useState<Holiday[]>([]);
  const [name, setName] = useState('');
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const can = isManager(role);

  const load = useCallback(async () => {
    const { data } = await supabase.from('gym_holidays').select('id,name,start_date,end_date,applied_at').eq('gym_id', id).order('start_date', { ascending: false });
    setList((data as Holiday[]) ?? []);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    if (!name.trim()) { setMsg({ t: 'ใส่ชื่อวันหยุด เช่น สงกรานต์ / ปิดปรับปรุง', ok: false }); return; }
    if (to < from) { setMsg({ t: 'วันสุดท้ายต้องไม่ก่อนวันแรก', ok: false }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.from('gym_holidays').insert({ gym_id: id, name: name.trim(), start_date: from, end_date: to }).select('id').single();
    if (error) { setBusy(false); setMsg({ t: thError(error), ok: false }); return; }
    const r = await supabase.rpc('apply_holiday', { h: data!.id });
    setBusy(false);
    if (r.error) { setMsg({ t: thError(r.error), ok: false }); load(); return; }
    setMsg({ t: `บันทึกวันหยุด "${name.trim()}" แล้ว · เลื่อนวันหมดสมาชิก ${r.data ?? 0} รายการ และแพ็ก PT ที่ยังใช้อยู่`, ok: true });
    setName(''); load();
  }

  async function apply(h: Holiday) {
    const r = await supabase.rpc('apply_holiday', { h: h.id });
    if (r.error) setMsg({ t: thError(r.error), ok: false });
    else setMsg({ t: `เลื่อนวันหมดสมาชิก ${r.data ?? 0} รายการแล้ว`, ok: true });
    load();
  }

  async function del(h: Holiday) {
    const { error } = await supabase.from('gym_holidays').delete().eq('id', h.id);
    if (error) setMsg({ t: thError(error), ok: false }); else load();
  }

  const days = daysBetween(from, to) + 1;
  const closed = gym?.closed_weekdays ?? [];

  return (
    <GymFrame id={id} gym={gym} role={role} active="holidays">
      <Header title="วันหยุดยิม" sub="ปิดพิเศษ เช่น สงกรานต์ ปีใหม่ ปิดปรับปรุง" back={() => router.replace(`/gym/${id}/more` as any)} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      {can ? (
        <Card>
          <H size={17}>เพิ่มวันหยุด</H>
          <Field label="ชื่อ" value={name} onChangeText={setName} placeholder="เช่น สงกรานต์" />
          <DateField label="ตั้งแต่" value={from} onChange={v => { setFrom(v); if (to < v) setTo(v); }} />
          <DateField label="ถึง" value={to} onChange={setTo} min={from} />
          <Txt muted size={13}>
            ปิด {days} วัน · สมาชิกและแพ็ก PT ที่ยังใช้อยู่ช่วงนั้นจะได้วันคืนอัตโนมัติ
            {closed.length ? ' (ไม่นับวันปิดประจำที่ปิดอยู่แล้ว)' : ''} · แพ็กเกจที่ขายหลังจากนี้ก็ไม่นับวันนี้
          </Txt>
          <Btn label="บันทึกและเลื่อนวันหมด" onPress={add} loading={busy} />
        </Card>
      ) : <Notice kind="info" text="เฉพาะเจ้าของและผู้จัดการ เพิ่มวันหยุดได้" />}

      <Card style={{ gap: 6 }}>
        <H size={17}>วันหยุดที่บันทึกไว้</H>
        {!list.length ? <Txt muted>ยังไม่มี</Txt> : null}
        {list.map(h => (
          <View key={h.id} style={{ gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt bold>{h.name}</Txt>
                <Txt muted size={13}>{thDate(h.start_date)}{h.end_date !== h.start_date ? ` – ${thDate(h.end_date)}` : ''} ({daysBetween(h.start_date, h.end_date) + 1} วัน)</Txt>
              </View>
              {h.applied_at ? <Pill text={`เลื่อนวันหมดแล้ว ${thDateTs(h.applied_at)}`} kind="ok" /> : <Pill text="ยังไม่ได้เลื่อนวันหมด" kind="warn" />}
            </View>
            {can && !h.applied_at ? <>
              <Btn kind="ghost" label="เลื่อนวันหมดตอนนี้" onPress={() => apply(h)} />
              <ConfirmBtn label="ลบวันหยุดนี้" onConfirm={() => del(h)} />
            </> : null}
          </View>
        ))}
        <Txt muted size={12}>วันหยุดที่เลื่อนวันหมดไปแล้วลบไม่ได้ เพื่อไม่ให้วันหมดของสมาชิกเพี้ยน</Txt>
      </Card>
    </GymFrame>
  );
}
