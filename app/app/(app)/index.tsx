import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { addDays, thDate, todayISO } from '../../src/lib/gym';
import { landing, MEMBER_TABS } from '../../src/lib/nav';
import { STATUS_TH, type Member } from '../../src/lib/counter';
import { apptRange, dayLabel, sessionsLeft, toTs } from '../../src/lib/trainer';
import { fmt1, latestTarget, loadDay, totals, type Target, type Totals } from '../../src/lib/me';
import { Btn, Card, DateField, Field, H, Label, Loading, Notice, Pill, Screen, TimeField, Txt } from '../../src/ui';
import { DayTotals } from '../../src/ui/Macro';
import { Icon } from '../../src/ui/Icon';
import { TabBar } from '../../src/ui/TabBar';
import { C, R } from '../../src/lib/theme';

/** Opening the app: staff go straight to their job; everyone else gets their own home */
export default function Home() {
  const { profile } = useAuth();
  const [ready, setReady] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    let alive = true;
    landing(profile.id).then(r => {
      if (!alive) return;
      if ('to' in r) router.replace(r.to as any); else setReady(true);
    });
    return () => { alive = false; };
  }, [profile]));
  return ready ? <MemberHome /> : <Loading />;
}

type Tc = { id: string; member_id: string | null; trainer: { display_name: string } | null };
type Next = { id: string; trainer_client_id: string; starts_at: string; duration_min: number };
type Invite = { id: string; from_name: string; from_uid: number };
type Card_ = Member & { gym: { name: string } | null };

function MemberHome() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<Card_[] | null>(null);
  const [tcs, setTcs] = useState<Tc[]>([]);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [next, setNext] = useState<Next | null>(null);
  const [pending, setPending] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [food, setFood] = useState<{ t: Totals; target: Target | null } | null>(null);
  const [weight, setWeight] = useState<{ now: number; diff: number | null; on: string } | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [ask, setAsk] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const today = todayISO();
    const [m, inv, meals, target, w] = await Promise.all([
      supabase.from('member_status').select('*').eq('profile_id', profile.id),
      supabase.rpc('my_invites'),
      loadDay(profile.id, today),
      latestTarget(profile.id),
      supabase.from('body_measurements').select('measured_on,weight_kg').eq('user_id', profile.id).not('weight_kg', 'is', null).order('measured_on', { ascending: false }).limit(40),
    ]);
    const rows = ((m.data as any) ?? []) as Card_[];
    if (rows.length) {
      const g = await supabase.from('gyms').select('id,name').in('id', [...new Set(rows.map(r => r.gym_id))]);
      const names = Object.fromEntries(((g.data as { id: string; name: string }[]) ?? []).map(x => [x.id, x.name]));
      rows.forEach(r => { r.gym = names[r.gym_id] ? { name: names[r.gym_id] } : null; });
    }
    setCards(rows);
    setInvites((inv.data as Invite[]) ?? []);
    setFood({ t: totals(meals.flatMap(x => x.items)), target });
    const ws = (w.data as { measured_on: string; weight_kg: number }[]) ?? [];
    if (ws.length) {
      const old = ws.find(x => x.measured_on <= addDays(today, -28)) ?? ws[ws.length - 1];
      setWeight({ now: Number(ws[0].weight_kg), diff: old !== ws[0] ? Number(ws[0].weight_kg) - Number(old.weight_kg) : null, on: ws[0].measured_on });
    } else setWeight(null);

    const ids = rows.map(r => r.id);
    const t = await supabase.from('trainer_clients').select('id,member_id,trainer:profiles!trainer_clients_trainer_id_fkey(display_name)')
      .eq('status', 'active').or(ids.length ? `client_id.eq.${profile.id},member_id.in.(${ids.join(',')})` : `client_id.eq.${profile.id}`);
    const list = ((t.data as any) ?? []) as Tc[];
    setTcs(list);
    if (list.length) {
      const [l, a] = await Promise.all([
        sessionsLeft(list.map(x => x.id)),
        supabase.from('appointments').select('id,trainer_client_id,starts_at,duration_min').in('trainer_client_id', list.map(x => x.id))
          .eq('status', 'scheduled').gte('starts_at', new Date(Date.now() - 3600000).toISOString()).order('starts_at').limit(1),
      ]);
      setLeft(l);
      const n = ((a.data as Next[]) ?? [])[0] ?? null;
      setNext(n);
      if (n) {
        const r = await supabase.from('reschedule_requests').select('id', { count: 'exact', head: true }).eq('appointment_id', n.id).eq('status', 'pending');
        setPending((r.count ?? 0) > 0);
      }
    } else setNext(null);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function answer(i: Invite, accept: boolean) {
    const { error } = await supabase.rpc('answer_invite', { i: i.id, accept });
    setMsg(error ? { t: thError(error), ok: false } : { t: accept ? `รับ ${i.from_name} เป็นเทรนเนอร์แล้ว` : 'ปฏิเสธคำเชิญแล้ว', ok: true });
    load();
  }

  const trainerOf = (tcId: string) => tcs.find(t => t.id === tcId)?.trainer?.display_name ?? 'เทรนเนอร์';
  const ptLeft = (memberId?: string) => tcs.filter(t => !memberId || t.member_id === memberId).reduce((s, t) => s + (left[t.id] ?? 0), 0);
  const go = (p: string) => router.replace(p as any);

  return (
    <Screen footer={<TabBar tabs={MEMBER_TABS} active="home" />}>
      <View style={{ gap: 2, paddingTop: 8 }}>
        <Txt muted size={14}>สวัสดี</Txt>
        <H size={24}>{profile?.display_name}</H>
      </View>
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {invites.map(i => (
        <Card key={i.id}>
          <Txt><Txt bold>{i.from_name}</Txt> เชิญคุณเป็นลูกเทรน</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="รับ" onPress={() => answer(i, true)} style={{ flex: 1 }} />
            <Btn kind="ghost" label="ไม่รับ" onPress={() => answer(i, false)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}

      {next ? (
        <View style={{ backgroundColor: C.brand, borderRadius: R.card, padding: 20, gap: 6 }}>
          <Txt bold size={14} style={{ color: C.brandInk }}>นัด PT ถัดไป</Txt>
          <H size={28} style={{ color: C.brandInk }}>{dayLabel(next.starts_at)} {apptRange(next).split('–')[0]}</H>
          <Txt size={14} style={{ color: C.brandInk }}>กับ {trainerOf(next.trainer_client_id)} · เหลือ {left[next.trainer_client_id] ?? 0} ครั้ง</Txt>
          {pending ? <Txt bold size={14} style={{ color: C.brandInk }}>ส่งคำขอเลื่อนแล้ว · รอเทรนเนอร์ตอบ</Txt>
            : !ask ? <Btn kind="ghost" label="ขอเลื่อนนัด" onPress={() => setAsk(true)} style={{ borderColor: C.brandInk, marginTop: 4 }} textColor={C.brandInk} /> : null}
        </View>
      ) : null}
      {next && ask ? <AskMove appt={next} onDone={(t) => { setAsk(false); if (t) { setMsg({ t, ok: true }); load(); } }} /> : null}

      <Pressable accessibilityRole="button" onPress={() => go('/my/food')}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <H size={18} style={{ flex: 1 }}>วันนี้กินไปแล้ว</H>
            <Icon name="chevron-right" size={20} color={C.muted} />
          </View>
          {food ? <DayTotals t={food.t} target={food.target} compact /> : <Txt muted>กำลังโหลด…</Txt>}
          {food && !food.target ? <Txt size={14} style={{ color: C.accent }}>ตั้งเป้าแคลอรีที่หน้าอาหาร</Txt> : null}
        </Card>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile icon="utensils" label="บันทึกอาหาร" onPress={() => go('/my/food?add=1')} />
        <Tile icon="scale" label="ชั่งน้ำหนัก" onPress={() => go('/my/body?add=1')} />
      </View>

      <Pressable accessibilityRole="button" onPress={() => go('/my/body')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt muted size={14}>น้ำหนักล่าสุด</Txt>
            {weight ? <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <H size={28}>{fmt1(weight.now)} kg</H>
              {weight.diff !== null ? <Txt bold size={14} style={{ color: weight.diff <= 0 ? C.accent : C.warnFg }}>{weight.diff > 0 ? '+' : ''}{fmt1(weight.diff)} ใน 4 สัปดาห์</Txt> : null}
            </View> : <Txt>ยังไม่ได้บันทึก</Txt>}
            {weight ? <Txt muted size={13}>{thDate(weight.on)}</Txt> : null}
          </View>
          <Icon name="chevron-right" size={20} color={C.muted} />
        </Card>
      </Pressable>

      {cards?.length ? <Label>บัตรสมาชิก</Label> : null}
      {(cards ?? []).map(m => {
        const st = STATUS_TH[m.status];
        return (
          <Card key={m.id} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <H size={18} style={{ flex: 1 }}>{m.gym?.name ?? 'ยิม'}</H>
              <Pill text={st.t} kind={st.k} />
            </View>
            <View style={{ alignItems: 'center', paddingVertical: 12, borderRadius: R.field, backgroundColor: C.surface2 }}>
              <Txt muted size={13}>แสดงรหัสนี้ที่เคาน์เตอร์</Txt>
              <H size={36} style={{ letterSpacing: 2 }}>{m.code}</H>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Txt muted size={13}>หมดอายุ</Txt><Txt bold>{m.status === 'frozen' ? `พักถึง ${thDate(m.frozen_until)}` : thDate(m.end_date)}</Txt></View>
              <View style={{ flex: 1 }}><Txt muted size={13}>PT เหลือ</Txt><Txt bold>{ptLeft(m.id)} ครั้ง</Txt></View>
            </View>
          </Card>
        );
      })}
      {cards && !cards.length ? (
        <Card>
          <H size={17}>ยังไม่มีบัตรสมาชิกยิม</H>
          <Txt muted size={14}>บอก UID <Txt bold>{profile?.uid}</Txt> ให้ยิมหรือเทรนเนอร์ แล้วบัตรกับนัด PT จะขึ้นที่นี่เอง</Txt>
          <Txt size={14} style={{ color: C.accent }} onPress={() => router.push('/gym/new' as any)}>เป็นเจ้าของยิม? สร้างยิม</Txt>
        </Card>
      ) : null}
    </Screen>
  );
}

function Tile({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 64, borderRadius: R.card, backgroundColor: C.surface,
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={C.accent} />
      </View>
      <Txt bold>{label}</Txt>
    </Pressable>
  );
}

/** Ask the trainer to move a session: pick a new date and time, add a note */
function AskMove({ appt, onDone }: { appt: Next; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const d = new Date(appt.starts_at);
  const [date, setDate] = useState(todayISO() > appt.starts_at.slice(0, 10) ? todayISO() : appt.starts_at.slice(0, 10));
  const [time, setTime] = useState(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!/^\d{2}:\d{2}$/.test(time)) { setErr('เวลาไม่ถูกต้อง'); return; }
    setBusy(true);
    const { error } = await supabase.from('reschedule_requests').insert({ appointment_id: appt.id, requested_by: profile!.id, proposed_start: toTs(date, time), message: note.trim() || null });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(`ส่งคำขอเลื่อนเป็น ${dayLabel(toTs(date, time))} ${time} แล้ว · รอเทรนเนอร์ตอบ`);
  }
  return (
    <Card>
      <H size={17}>ขอเลื่อนนัด</H>
      {err ? <Notice text={err} /> : null}
      <DateField label="วันใหม่" value={date} onChange={setDate} min={todayISO()} />
      <TimeField label="เวลาใหม่" value={time} onChange={setTime} />
      <Field label="ข้อความถึงเทรนเนอร์ (ไม่บังคับ)" value={note} onChangeText={setNote} placeholder="เช่น ติดงาน ขอเลื่อนเป็นเย็น" />
      <Btn label="ส่งคำขอ" onPress={send} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}
