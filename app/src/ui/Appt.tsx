import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { thError } from '../lib/supabase';
import { APPT_TH, apptRange, dayLabel, markAppt, markMsg, tcName, type Appt } from '../lib/trainer';
import { C } from '../lib/theme';
import { Btn, Pill, Toggle, Txt } from './index';

/** One appointment. Tap to open the actions (came / no-show / cancel / undo). */
export function ApptCard({ a, showName = true, showDay, canManage, onLeave, onDone }: {
  a: Appt; showName?: boolean; showDay?: boolean; canManage: boolean; onLeave?: boolean; onDone: (msg: string, ok: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deduct, setDeduct] = useState(false);
  const [busy, setBusy] = useState('');
  const st = APPT_TH[a.status];

  async function go(s: 'scheduled' | 'done' | 'noshow' | 'cancelled') {
    setBusy(s);
    const { data, error } = await markAppt(a.id, s, s === 'noshow' ? deduct : false);
    setBusy('');
    if (error) { onDone(thError(error), false); return; }
    setOpen(false);
    onDone(markMsg(data as any), true);
  }

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 10, gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 92 }}>
          {showDay ? <Txt muted size={12}>{dayLabel(a.starts_at)}</Txt> : null}
          <Txt bold size={14.5}>{apptRange(a)}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {showName ? <Txt bold numberOfLines={1}>{tcName(a.tc)}</Txt> : <Txt muted size={13}>{a.duration_min} นาที</Txt>}
          {a.note ? <Txt muted size={12.5} numberOfLines={1}>{a.note}</Txt> : null}
          {onLeave && a.status === 'scheduled' ? <Txt size={12} style={{ color: C.warnFg }}>ตรงกับวันลา</Txt> : null}
        </View>
        <Pill text={st.t} kind={st.k} />
      </Pressable>
      {open ? (
        <View style={{ gap: 8 }}>
          {canManage && a.status === 'scheduled' ? <>
            <Btn label="มาแล้ว (หัก 1 ครั้ง)" onPress={() => go('done')} loading={busy === 'done'} />
            <View style={{ backgroundColor: C.surface2, borderRadius: 12, padding: 10, gap: 6 }}>
              <Toggle label="หักครั้งด้วย" value={deduct} onChange={setDeduct} hint="เช่น ไม่มาโดยไม่บอกล่วงหน้า" />
              <Btn kind="ghost" label={deduct ? 'ไม่มา (หัก 1 ครั้ง)' : 'ไม่มา (ไม่หักครั้ง)'} onPress={() => go('noshow')} loading={busy === 'noshow'} />
            </View>
            <Btn kind="ghost" label="ยกเลิกนัด" onPress={() => go('cancelled')} loading={busy === 'cancelled'} />
          </> : null}
          {canManage && a.status !== 'scheduled' ? (
            <Btn kind="ghost" label="แก้กลับเป็น 'นัดไว้' (คืนครั้งถ้าหักไปแล้ว)" onPress={() => go('scheduled')} loading={busy === 'scheduled'} />
          ) : null}
          {showName ? <Btn kind="ghost" label="ดูหน้าลูกเทรน" onPress={() => router.push(`/trainer/client/${a.trainer_client_id}` as any)} /> : null}
        </View>
      ) : null}
    </View>
  );
}
