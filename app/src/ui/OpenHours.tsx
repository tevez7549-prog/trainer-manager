import { Pressable, View } from 'react-native';
import { C } from '../lib/theme';
import { DAYS_SHORT } from '../lib/gym';
import { Chips, TimeField, Txt } from './index';

/**
 * When the gym is open: which weekdays, and from what time to what time.
 * The database keeps the days the gym is closed (closed_weekdays), because membership end dates skip those;
 * open_hours = { open: 'HH:MM', close: 'HH:MM' }.
 */
export type Hours = { days: number[]; open: string; close: string };
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const DEFAULT_HOURS: Hours = { days: ALL_DAYS, open: '06:00', close: '22:00' };

export const hoursFromGym = (g: { closed_weekdays?: number[] | null; open_hours?: any }): Hours => ({
  days: ALL_DAYS.filter(d => !(g.closed_weekdays ?? []).includes(d)),
  open: g.open_hours?.open || DEFAULT_HOURS.open,
  close: g.open_hours?.close || DEFAULT_HOURS.close,
});
export const hoursToGym = (h: Hours) => ({
  closed_weekdays: ALL_DAYS.filter(d => !h.days.includes(d)),
  open_hours: { open: h.open, close: h.close },
});
/** Thai error, or '' when fine */
export function hoursError(h: Hours) {
  if (!h.days.length) return 'เลือกวันที่ยิมเปิดอย่างน้อย 1 วัน';
  if (!/^\d\d:\d\d$/.test(h.open) || !/^\d\d:\d\d$/.test(h.close)) return 'ใส่เวลาเปิดและปิดให้ครบ';
  if (h.close <= h.open) return 'เวลาปิดต้องหลังเวลาเปิด';
  return '';
}

const PRESETS: { v: string; t: string; days: number[] }[] = [
  { v: 'all', t: 'ทุกวัน', days: ALL_DAYS },
  { v: 'mon-sat', t: 'จ–ส', days: [1, 2, 3, 4, 5, 6] },
  { v: 'mon-fri', t: 'จ–ศ', days: [1, 2, 3, 4, 5] },
];

export function OpenHours({ value, onChange, hint }: { value: Hours; onChange: (h: Hours) => void; hint?: string }) {
  const toggle = (d: number) => onChange({ ...value, days: value.days.includes(d) ? value.days.filter(x => x !== d) : [...value.days, d].sort() });
  const preset = PRESETS.find(p => p.days.length === value.days.length && p.days.every(d => value.days.includes(d)))?.v ?? '';
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <Txt bold size={13.5}>วันที่ยิมเปิด</Txt>
        <Chips options={PRESETS.map(p => ({ v: p.v, t: p.t }))} value={preset || null} onChange={v => onChange({ ...value, days: PRESETS.find(p => p.v === v)!.days })} />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {DAYS_SHORT.map((d, i) => {
            const on = value.days.includes(i);
            return (
              <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`เปิดวัน${d}`} onPress={() => toggle(i)}
                style={{ minWidth: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Txt bold style={{ color: on ? C.accent : C.muted }}>{d}</Txt>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}><TimeField label="เปิดกี่โมง" value={value.open} onChange={v => onChange({ ...value, open: v })} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><TimeField label="ปิดกี่โมง" value={value.close} onChange={v => onChange({ ...value, close: v })} /></View>
      </View>
      <Txt muted size={12}>{hint ?? 'วันที่ไม่เปิดไม่นับอายุสมาชิกและแพ็ก PT · เวลาเปิดใช้กับตารางเทรนเนอร์ · แก้ทีหลังได้'}</Txt>
    </View>
  );
}
