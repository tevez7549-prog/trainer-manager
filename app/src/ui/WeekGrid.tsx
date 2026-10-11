import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { addDays, todayISO } from '../lib/gym';
import { tcName, type Leave } from '../lib/trainer';
import { C } from '../lib/theme';
import { Txt } from './index';
import { Icon } from './Icon';

const WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const FIRST = 6, LAST = 22;            // rows 06:00 … 21:00
const ROW = 30;

type Busy = { starts_at: string; duration_min: number; tc: { client_name: string | null; client: { display_name: string } | null; member: { name: string } | null } | null };

const monday = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return addDays(iso, -((d.getDay() + 6) % 7)); };
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A trainer's week at a glance: one column per day, one row per hour.
 * Filled = has a session, grey = leave or gym closed, empty = free. Tap a free hour to book it (when onPick is given).
 */
export function WeekGrid({ trainerId, closedDays = [], onPick, reloadKey }: {
  trainerId: string; closedDays?: number[]; onPick?: (date: string, time: string) => void; reloadKey?: number;
}) {
  const [week, setWeek] = useState(monday(todayISO()));
  const [busy, setBusy] = useState<Busy[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const from = new Date(week + 'T00:00:00'), to = new Date(addDays(week, 7) + 'T00:00:00');
    Promise.all([
      supabase.from('appointments').select('starts_at,duration_min,tc:trainer_clients(client_name,client:profiles!trainer_clients_client_id_fkey(display_name),member:members(name))')
        .eq('trainer_id', trainerId).neq('status', 'cancelled').gte('starts_at', new Date(from.getTime() - 3 * 3600000).toISOString()).lt('starts_at', to.toISOString()),
      supabase.from('trainer_leave').select('id,start_at,end_at,reason').eq('trainer_id', trainerId).lt('start_at', to.toISOString()).gt('end_at', from.toISOString()),
    ]).then(([a, l]) => { setBusy(((a.data as any) ?? []) as Busy[]); setLeaves((l.data as Leave[]) ?? []); });
  }, [trainerId, week, reloadKey]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const today = todayISO();
  const now = Date.now();
  const hours = Array.from({ length: LAST - FIRST }, (_, i) => FIRST + i);

  function cell(day: string, h: number) {
    const s = new Date(`${day}T${pad(h)}:00:00`).getTime(), e = s + 3600000;
    const wd = new Date(day + 'T00:00:00').getDay();
    const b = busy.find(x => { const a = new Date(x.starts_at).getTime(); return a < e && a + x.duration_min * 60000 > s; });
    if (b) {
      const startsHere = new Date(b.starts_at).getTime() >= s;
      return { kind: 'busy' as const, label: startsHere ? tcName(b.tc as any).replace(/^คุณ/, '').slice(0, 3) : '' };
    }
    if (leaves.some(l => new Date(l.start_at).getTime() < e && new Date(l.end_at).getTime() > s)) return { kind: 'leave' as const, label: 'ลา' };
    if (closedDays.includes(wd)) return { kind: 'closed' as const, label: '' };
    if (e <= now) return { kind: 'past' as const, label: '' };
    return { kind: 'free' as const, label: '' };
  }

  const end = addDays(week, 6);
  const [, m1, d1] = week.split('-').map(Number), [, m2, d2] = end.split('-').map(Number);
  const title = m1 === m2 ? `${d1}–${d2} ${MON[m1 - 1]}` : `${d1} ${MON[m1 - 1]} – ${d2} ${MON[m2 - 1]}`;
  const freeCount = days.reduce((n, d) => n + hours.filter(h => cell(d, h).kind === 'free').length, 0);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="สัปดาห์ก่อน" onPress={() => setWeek(addDays(week, -7))} hitSlop={8}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevron-left" size={22} /></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt bold>{title}</Txt>
          <Txt muted size={12.5}>ว่าง {freeCount} ชั่วโมง{week !== monday(today) ? '' : ' · สัปดาห์นี้'}</Txt>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="สัปดาห์ถัดไป" onPress={() => setWeek(addDays(week, 7))} hitSlop={8}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevron-right" size={22} /></Pressable>
      </View>

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 38 }} />
        {days.map(d => {
          const dt = new Date(d + 'T00:00:00'), on = d === today;
          return (
            <View key={d} style={{ flex: 1, alignItems: 'center', paddingBottom: 4 }}>
              <Txt size={12} muted={!on} bold={on} style={on ? { color: C.accent } : undefined}>{WD[dt.getDay()]}</Txt>
              <Txt size={13} bold style={on ? { color: C.accent } : undefined}>{dt.getDate()}</Txt>
            </View>
          );
        })}
      </View>

      <View>
        {hours.map(h => (
          <View key={h} style={{ flexDirection: 'row', height: ROW }}>
            <Txt muted size={11.5} style={{ width: 38, marginTop: -7, fontVariant: ['tabular-nums'] }}>{pad(h)}:00</Txt>
            {days.map(d => {
              const c = cell(d, h), key = `${d} ${h}`;
              const bg = c.kind === 'busy' ? C.accentSoft : c.kind === 'leave' ? C.surface2 : c.kind === 'closed' || c.kind === 'past' ? C.bg : C.surface;
              const sel = picked === key;
              const box = (
                <View style={{ flex: 1, margin: 1, borderRadius: 6, backgroundColor: sel ? C.brand : bg, alignItems: 'center', justifyContent: 'center',
                  borderWidth: c.kind === 'free' && !sel ? 1 : 0, borderColor: C.line, opacity: c.kind === 'past' || c.kind === 'closed' ? 0.5 : 1 }}>
                  {c.label ? <Txt size={10.5} bold numberOfLines={1} style={{ color: c.kind === 'busy' ? C.accent : C.muted }}>{c.label}</Txt> : null}
                </View>
              );
              return onPick && c.kind === 'free' ? (
                <Pressable key={key} accessibilityRole="button" accessibilityLabel={`ว่าง ${d} ${pad(h)}:00 กดเพื่อเลือก`} style={{ flex: 1 }}
                  onPress={() => { setPicked(key); onPick(d, `${pad(h)}:00`); }}>{box}</Pressable>
              ) : <View key={key} style={{ flex: 1 }} accessibilityLabel={`${d} ${pad(h)}:00 ${c.kind === 'busy' ? 'มีนัด' : c.kind === 'leave' ? 'ลา' : c.kind === 'free' ? 'ว่าง' : ''}`}>{box}</View>;
            })}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingLeft: 38 }}>
        {[['ว่าง', C.surface, true], ['มีนัด', C.accentSoft, false], ['ลา / ปิด', C.surface2, false]].map(([t, bg, line]) => (
          <View key={t as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: bg as string, borderWidth: line ? 1 : 0, borderColor: C.line }} />
            <Txt muted size={12.5}>{t as string}</Txt>
          </View>
        ))}
      </View>
      {onPick ? <Txt muted size={12.5} style={{ paddingLeft: 38 }}>แตะช่องว่างเพื่อเลือกวันและเวลานัด</Txt> : null}
    </View>
  );
}

