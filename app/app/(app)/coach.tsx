import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { addDays, DAYS_SHORT, thDate, thTime, todayISO } from '../../src/lib/gym';
import { Card, Header, Notice, Pill, Screen, Txt } from '../../src/ui';
import { C, R } from '../../src/lib/theme';

type Row_ = { appointment_id: string; starts_at: string; duration_min: number; status: string; gym_name: string; client: string; used: number; total: number };

/** A gym trainer's own PT schedule (read only: the counter books and marks sessions) */
export default function CoachSchedule() {
  const [day, setDay] = useState(todayISO());
  const [rows, setRows] = useState<Row_[] | null>(null);
  const monday = addDays(todayISO(), -((new Date(todayISO() + 'T00:00:00').getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_coach_schedule', { d_from: monday, d_to: addDays(monday, 13) });
    setRows((data as Row_[]) ?? []);
  }, [monday]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const iso = (ts: string) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const list = (rows ?? []).filter(r => iso(r.starts_at) === day);
  const gyms = [...new Set((rows ?? []).map(r => r.gym_name))];

  return (
    <Screen>
      <Header title="ตารางเทรนของฉัน" sub={gyms.length ? `เทรนเนอร์ที่ ${gyms.join(', ')}` : undefined}
        back={() => (router.canGoBack() ? router.back() : router.replace('/?me=1' as any))} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map(d => {
          const on = d === day, n = (rows ?? []).filter(r => iso(r.starts_at) === d).length, dt = new Date(d + 'T00:00:00');
          return (
            <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setDay(d)}
              style={{ flex: 1, height: 64, borderRadius: R.field, borderWidth: on ? 1.5 : 0, borderColor: C.accent, backgroundColor: on ? C.accentSoft : C.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={12} style={{ color: on ? C.accent : C.muted }}>{DAYS_SHORT[dt.getDay()]}</Txt>
              <Txt bold style={on ? { color: C.accent } : undefined}>{dt.getDate()}</Txt>
              {n ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 2 }} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Txt muted bold size={14}>{day === todayISO() ? 'วันนี้' : thDate(day)} · {list.length} นัด</Txt>
      {rows === null ? <Txt muted>กำลังโหลด…</Txt> : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {!list.length ? <Txt muted style={{ paddingVertical: 14 }}>ไม่มีนัดวันนี้</Txt> : list.map(r => {
            const left = Math.max(0, r.total - r.used), past = r.status === 'done';
            return (
              <View key={r.appointment_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, opacity: past ? 0.6 : 1 }}>
                <Txt bold style={{ width: 56, color: past ? C.fg : C.accent, fontVariant: ['tabular-nums'] }}>{thTime(r.starts_at)}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt bold numberOfLines={1}>{r.client}</Txt>
                  <Txt muted size={13}>{r.total ? `ใช้แล้ว ${r.used}/${r.total}` : 'ยังไม่มีแพ็กเกจ'} · {r.duration_min} นาที{gyms.length > 1 ? ` · ${r.gym_name}` : ''}</Txt>
                </View>
                {past ? <Pill text="ตัดแล้ว" /> : r.total && left <= 1 ? <Pill kind="warn" text={`เหลือ ${left}`} /> : null}
              </View>
            );
          })}
        </Card>
      )}
      <Notice kind="info" text="หน้านี้ดูได้อย่างเดียว · ตัดครั้งและนัดใหม่ทำที่เคาน์เตอร์ · เห็นเฉพาะลูกค้า PT ของคุณ" />
    </Screen>
  );
}
