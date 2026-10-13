import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/lib/auth';
import { addDays, DAYS_SHORT, isDesk, thDate, todayISO, useGym } from '../../../../src/lib/gym';
import { loadCoaches, type Coach } from '../../../../src/lib/coaches';
import {
  addGuest, addMember, bookingName, cancelClass, cancelSeriesFrom, createClass, isFull, loadClasses, removeBooking, seats, setBooking,
  type ClassBooking, type ClassSession,
} from '../../../../src/lib/classes';
import { Btn, Card, Chips, ConfirmBtn, DateField, Field, Header, Notice, Pill, Select, TimeField, Txt } from '../../../../src/ui';
import { GymFrame } from '../../../../src/ui/GymFrame';
import { Icon } from '../../../../src/ui/Icon';
import { C, R } from '../../../../src/lib/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const endOf = (s: ClassSession) => hhmm(new Date(new Date(s.starts_at).getTime() + s.duration_min * 60000).toISOString());

/** Group classes: pick a day, see the classes, add people, mark who came */
export default function GymClasses() {
  const { id, desk, day: day0 } = useLocalSearchParams<{ id: string; desk?: string; day?: string }>();
  const { gym, role } = useGym(id);
  const [day, setDay] = useState(day0 || todayISO());
  const [list, setList] = useState<ClassSession[] | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const from = new Date(day + 'T00:00:00'), to = new Date(addDays(day, 1) + 'T00:00:00');
    const [l, c] = await Promise.all([loadClasses(id, from.toISOString(), to.toISOString()), loadCoaches(id)]);
    setList(l); setCoaches(c);
  }, [id, day]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const done = (t: string, ok = true) => { setMsg({ t, ok }); load(); };

  const days = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i));
  const canEdit = isDesk(role);

  return (
    <GymFrame id={id} gym={gym} role={role} active="classes" desk={desk === '1'}>
      <Header title="คลาส" sub={gym?.name} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {days.map(d => {
          const on = d === day, dt = new Date(d + 'T00:00:00');
          return (
            <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { setDay(d); setOpen(null); }}
              style={{ flex: 1, minWidth: 0, paddingVertical: 8, borderRadius: R.field, alignItems: 'center', gap: 2, borderWidth: 1,
                borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface }}>
              <Txt size={12} style={{ color: on ? C.accent : C.muted }}>{d === todayISO() ? 'วันนี้' : DAYS_SHORT[dt.getDay()]}</Txt>
              <Txt bold size={16} style={{ color: on ? C.accent : C.fg }}>{String(dt.getDate())}</Txt>
            </Pressable>
          );
        })}
      </View>

      {canEdit ? (adding ? <AddClass gymId={id} day={day} coaches={coaches} onDone={(t) => { setAdding(false); if (t) done(t); }} />
        : <Btn icon="plus" label="เพิ่มคลาส" onPress={() => setAdding(true)} />) : null}

      {list === null ? <Txt muted>กำลังโหลด…</Txt> : !list.length ? (
        <Card><Txt muted>{`ไม่มีคลาสวันที่ ${thDate(day)}`}</Txt></Card>
      ) : list.map(s => (
        <Card key={s.id} style={{ gap: 10 }}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(open === s.id ? null : s.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 64 }}>
              <Txt bold size={17} style={{ color: C.accent }}>{hhmm(s.starts_at)}</Txt>
              <Txt muted size={12}>{`ถึง ${endOf(s)}`}</Txt>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt bold size={16} numberOfLines={1}>{s.name}</Txt>
              <Txt muted size={13} numberOfLines={1}>{s.coach?.name ? `ครู ${s.coach.name}` : 'ยังไม่ระบุผู้สอน'}</Txt>
            </View>
            <Pill text={seats(s)} kind={isFull(s) ? 'warn' : 'mute'} />
            <Icon name={open === s.id ? 'chevron-down' : 'chevron-right'} size={18} color={C.muted} />
          </Pressable>
          {open === s.id ? <ClassDetail s={s} canEdit={canEdit} onDone={done} /> : null}
        </Card>
      ))}
    </GymFrame>
  );
}

function AddClass({ gymId, day, coaches, onDone }: { gymId: string; day: string; coaches: Coach[]; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [coach, setCoach] = useState('');
  const [date, setDate] = useState(day);
  const [time, setTime] = useState('18:00');
  const [dur, setDur] = useState(60);
  const [cap, setCap] = useState('');
  const [weeks, setWeeks] = useState(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setDate(day), [day]);

  async function save() {
    if (!name.trim()) { setErr('ใส่ชื่อคลาส'); return; }
    if (!/^\d\d:\d\d$/.test(time)) { setErr('ใส่เวลาเริ่ม'); return; }
    const c = cap.trim() ? Number(cap) : null;
    if (c !== null && !(c >= 1 && c <= 500)) { setErr('จำนวนที่รับต้องเป็นตัวเลข 1–500'); return; }
    setBusy(true); setErr('');
    const { error } = await createClass({ gymId, by: profile!.id, name: name.trim(), coachId: coach || null, date, time, duration: dur, capacity: c, note: null, weeks });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(weeks > 1 ? `เพิ่มคลาส "${name.trim()}" ${weeks} สัปดาห์แล้ว` : `เพิ่มคลาส "${name.trim()}" แล้ว`);
  }

  return (
    <Card>
      {err ? <Notice text={err} /> : null}
      <Field label="ชื่อคลาส" value={name} onChangeText={setName} placeholder="เช่น โยคะ, HIIT, บอดี้คอมแบท" />
      <Select label="ผู้สอน" value={coach} onChange={setCoach} options={[{ v: '', t: 'ไม่ระบุ' }, ...coaches.map(c => ({ v: c.id, t: c.name }))]} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}><DateField label="วันที่" value={date} onChange={setDate} min={todayISO()} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><TimeField label="เวลาเริ่ม" value={time} onChange={setTime} /></View>
      </View>
      <Chips label="ความยาว" options={[30, 45, 60, 90].map(v => ({ v, t: `${v} นาที` }))} value={dur} onChange={setDur} />
      <Field label="รับได้กี่คน (ไม่บังคับ)" value={cap} onChangeText={v => setCap(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="เว้นว่าง = ไม่จำกัด" />
      <Chips label="ทำซ้ำทุกสัปดาห์" options={[{ v: 1, t: 'ครั้งเดียว' }, { v: 4, t: '4 สัปดาห์' }, { v: 8, t: '8 สัปดาห์' }, { v: 12, t: '12 สัปดาห์' }]} value={weeks} onChange={setWeeks} />
      <Btn label="บันทึกคลาส" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}

type Found = { id: string; name: string; code: string | null; status: string };

function ClassDetail({ s, canEdit, onDone }: { s: ClassSession; canEdit: boolean; onDone: (msg: string, ok?: boolean) => void }) {
  const { profile } = useAuth();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setFound([]); return; }
    const h = setTimeout(async () => {
      const esc = t.replace(/[%,()]/g, '');
      const { data } = await supabase.from('member_status').select('id,name,code,status').eq('gym_id', s.gym_id)
        .or(`name.ilike.%${esc}%,code.ilike.%${esc}%,phone_norm.ilike.%${esc.replace(/\D/g, '') || esc}%`).limit(6);
      setFound((data as Found[]) ?? []);
    }, 250);
    return () => clearTimeout(h);
  }, [q, s.gym_id]);

  const has = new Set(s.bookings.map(b => b.member_id));
  async function add(m: Found) {
    setBusy(true);
    const { error } = await addMember(s.id, m.id, profile!.id);
    setBusy(false); setQ('');
    onDone(error ? thError(error) : `เพิ่ม ${m.name} เข้าคลาสแล้ว`, !error);
  }
  async function guest() {
    if (!q.trim()) return;
    setBusy(true);
    const { error } = await addGuest(s.id, q, profile!.id);
    setBusy(false); setQ('');
    onDone(error ? thError(error) : `เพิ่ม ${q.trim()} (คนนอก) เข้าคลาสแล้ว`, !error);
  }
  async function mark(b: ClassBooking, st: ClassBooking['status']) {
    const { error } = await setBooking(b.id, b.status === st ? 'booked' : st);
    onDone(error ? thError(error) : 'บันทึกแล้ว', !error);
  }

  return (
    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      {s.note ? <Txt muted size={13}>{s.note}</Txt> : null}
      {!s.bookings.length ? <Txt muted size={14}>ยังไม่มีคนในคลาสนี้</Txt> : null}
      {s.bookings.map(b => (
        <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt bold size={15} numberOfLines={1}>{bookingName(b)}</Txt>
            <Txt muted size={12}>{b.member ? (b.member.code ?? 'สมาชิก') : 'คนนอก'}</Txt>
          </View>
          {canEdit ? <>
            <Pressable accessibilityRole="button" onPress={() => mark(b, 'attended')}
              style={{ paddingHorizontal: 10, minHeight: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: b.status === 'attended' ? C.accentSoft : C.surface2 }}>
              <Txt size={13} bold={b.status === 'attended'} style={{ color: b.status === 'attended' ? C.accent : C.fg }}>มาแล้ว</Txt>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => mark(b, 'noshow')}
              style={{ paddingHorizontal: 10, minHeight: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: b.status === 'noshow' ? C.warnBg : C.surface2 }}>
              <Txt size={13} bold={b.status === 'noshow'} style={{ color: b.status === 'noshow' ? C.warnFg : C.fg }}>ไม่มา</Txt>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`เอา ${bookingName(b)} ออก`} hitSlop={6}
              onPress={async () => { const { error } = await removeBooking(b.id); onDone(error ? thError(error) : `เอา ${bookingName(b)} ออกแล้ว`, !error); }}
              style={{ width: 32, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={16} color={C.muted} />
            </Pressable>
          </> : <Pill text={b.status === 'attended' ? 'มาแล้ว' : b.status === 'noshow' ? 'ไม่มา' : 'จองไว้'} kind={b.status === 'attended' ? 'ok' : b.status === 'noshow' ? 'warn' : 'mute'} />}
        </View>
      ))}
      {canEdit ? <>
        {isFull(s) ? <Notice kind="warn" text="คลาสเต็มแล้ว · ยังเพิ่มได้ ถ้าต้องการรับเกิน" /> : null}
        <Field label="เพิ่มคนเข้าคลาส" icon="search" value={q} onChangeText={setQ} placeholder="ชื่อ เบอร์ หรือรหัสสมาชิก" />
        {found.map(m => (
          <Pressable key={m.id} accessibilityRole="button" disabled={has.has(m.id) || busy} onPress={() => add(m)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, opacity: has.has(m.id) ? 0.5 : 1 }}>
            <Icon name="user-plus" size={18} color={C.accent} />
            <Txt style={{ flex: 1 }} numberOfLines={1}>{`${m.name}${m.code ? ` · ${m.code}` : ''}`}</Txt>
            {has.has(m.id) ? <Txt muted size={12}>อยู่ในคลาสแล้ว</Txt> : m.status === 'expired' ? <Pill text="หมดอายุ" kind="bad" /> : null}
          </Pressable>
        ))}
        {q.trim().length >= 2 ? <Btn kind="ghost" icon="plus" label={`เพิ่ม "${q.trim()}" เป็นคนนอก`} onPress={guest} loading={busy} /> : null}
        <ConfirmBtn label="ยกเลิกคลาสนี้" onConfirm={async () => { const { error } = await cancelClass(s.id); onDone(error ? thError(error) : `ยกเลิกคลาส ${s.name} แล้ว`, !error); }} />
        {s.series_id ? <ConfirmBtn label="ยกเลิกคลาสนี้และครั้งต่อ ๆ ไปทั้งหมด"
          onConfirm={async () => { const { error } = await cancelSeriesFrom(s); onDone(error ? thError(error) : `ยกเลิก ${s.name} ตั้งแต่ครั้งนี้แล้ว`, !error); }} /> : null}
      </> : null}
    </View>
  );
}
