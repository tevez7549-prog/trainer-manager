import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/lib/auth';
import { baht, thDate, todayISO, todayRange, useGym } from '../../../../src/lib/gym';
import { APPT_COLS, APPT_TH, apptRange, sessionsLeft, tcName, TC_COLS, type Appt, type TC } from '../../../../src/lib/trainer';
import { loadCoaches, type Coach } from '../../../../src/lib/coaches';
import { isFull, loadClasses, seats, type ClassSession } from '../../../../src/lib/classes';
import { Card, Header, Label, Notice, Pill, Row, Txt } from '../../../../src/ui';
import { GymFrame } from '../../../../src/ui/GymFrame';
import { Icon } from '../../../../src/ui/Icon';
import { C, R } from '../../../../src/lib/theme';

type M = { id: string; name: string; plan_name: string | null; days_left: number | null };
type Counts = { active: number; expiring: number; expired30: number; checkins: number; income: number };
type Leave = { trainer_id: string; start_at: string; end_at: string };
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Gym overview for the owner and managers on their phone: who trains whom today, which trainer is free when
 * (to answer a customer on the spot), how each trainer has been doing, and which members are running out.
 * Checking people in lives in the separate counter mode.
 */
export default function GymOverview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role, err } = useGym(id);
  const { profile } = useAuth();
  const [n, setN] = useState<Counts | null>(null);
  const [expiring, setExpiring] = useState<M[]>([]);
  const [expired, setExpired] = useState<M[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [tcs, setTcs] = useState<(TC & { trainer?: { display_name: string } | null })[]>([]);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [today, setToday] = useState<Appt[]>([]);
  const [month, setMonth] = useState<Appt[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [classes, setClasses] = useState<ClassSession[]>([]);

  useFocusEffect(useCallback(() => {
    if (role !== 'owner' && role !== 'admin') return;
    let alive = true;
    (async () => {
      const { from, to } = todayRange();
      const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 30);
      const ms = (st: string) => supabase.from('member_status').select('id', { count: 'exact', head: true }).eq('gym_id', id).eq('status', st);
      const [act, exp, ex30, ci, w, mb, pk, expL, exdL, co, t] = await Promise.all([
        ms('active'), ms('expiring'),
        supabase.from('member_status').select('id', { count: 'exact', head: true }).eq('gym_id', id).eq('status', 'expired').gte('days_left', -30),
        supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('gym_id', id).gte('checked_at', from).lt('checked_at', to),
        supabase.from('walkins').select('price').eq('gym_id', id).gte('at', from).lt('at', to),
        supabase.from('memberships').select('price').eq('gym_id', id).gte('created_at', from).lt('created_at', to),
        supabase.from('pt_packages').select('price').eq('gym_id', id).gte('created_at', from).lt('created_at', to),
        supabase.from('member_status').select('id,name,plan_name,days_left').eq('gym_id', id).eq('status', 'expiring').order('days_left').limit(6),
        supabase.from('member_status').select('id,name,plan_name,days_left').eq('gym_id', id).eq('status', 'expired').gte('days_left', -30).order('days_left', { ascending: false }).limit(6),
        loadCoaches(id, true),
        supabase.from('trainer_clients').select(TC_COLS).eq('gym_id', id).eq('status', 'active'),
      ]);
      const sum = (r: any) => ((r.data as { price: number }[]) ?? []).reduce((a, x) => a + Number(x.price), 0);
      const list = ((t.data as any) ?? []) as TC[];
      const ids = list.map(x => x.id);
      const [lf, ap, lv, cl] = await Promise.all([
        sessionsLeft(ids),
        ids.length ? supabase.from('appointments').select(APPT_COLS).in('trainer_client_id', ids).gte('starts_at', since.toISOString()).lt('starts_at', to).order('starts_at')
          : Promise.resolve({ data: [] }),
        supabase.from('trainer_leave').select('trainer_id,start_at,end_at')
          .in('trainer_id', [...new Set([...co.map(c => c.profile_id).filter(Boolean), ...list.map(x => x.trainer_id)])] as string[])
          .lt('start_at', to).gt('end_at', from),
        loadClasses(id, from, to),
      ]);
      if (!alive) return;
      const all = ((ap.data as any) ?? []) as Appt[];
      setN({ active: (act.count ?? 0) + (exp.count ?? 0), expiring: exp.count ?? 0, expired30: ex30.count ?? 0, checkins: ci.count ?? 0, income: sum(w) + sum(mb) + sum(pk) });
      setExpiring((expL.data as M[]) ?? []); setExpired((exdL.data as M[]) ?? []);
      setCoaches(co); setTcs(list as any); setLeft(lf);
      setToday(all.filter(a => a.starts_at >= from && a.status !== 'cancelled'));
      setMonth(all.filter(a => a.starts_at < from));
      setLeaves((lv.data as Leave[]) ?? []);
      setClasses(cl);
    })();
    return () => { alive = false; };
  }, [id, role]));

  // one entry per trainer: gym coaches, plus trainers on PT links made before coaches existed
  const keyOf = (t: { coach_id?: string | null; trainer_id: string }) => t.coach_id ?? `u:${t.trainer_id}`;
  const trainers = useMemo(() => {
    const keys = new Set<string>(coaches.filter(c => c.active).map(c => c.id));
    tcs.forEach(t => keys.add(keyOf(t)));
    return [...keys].map(k => {
      const c = coaches.find(x => x.id === k);
      const mine = tcs.filter(t => keyOf(t) === k);
      const account = c?.profile_id ?? (k.startsWith('u:') ? k.slice(2) : null);
      return { key: k, name: c ? (c.profile_id === profile?.id ? `${c.name} (คุณ)` : c.name) : mine[0]?.trainer?.display_name || 'เทรนเนอร์',
        clients: mine.length, low: mine.filter(t => (left[t.id] ?? 0) <= 2).length, account };
    }).sort((a, b) => b.clients - a.clients);
  }, [coaches, tcs, left, profile]);

  if (role === 'operator') return <Redirect href={`/gym/${id}/counter` as any} />;
  const go = (p: string) => router.push(`/gym/${id}/${p}` as any);

  // free hours today, inside opening hours, after now
  const open = gym?.open_hours?.open ?? '06:00', close = gym?.open_hours?.close ?? '22:00';
  const closedToday = (gym?.closed_weekdays ?? []).includes(new Date().getDay());
  function freeToday(t: { key: string; account: string | null }) {
    const day = todayISO();
    const h0 = Math.max(Number(open.slice(0, 2)), new Date().getHours() + 1), h1 = Math.ceil(Number(close.slice(0, 2)) + Number(close.slice(3, 5)) / 60);
    const busy = today.filter(a => keyOf(a) === t.key);
    const lv = leaves.filter(l => t.account && l.trainer_id === t.account);
    const free: number[] = [];
    for (let h = h0; h < h1; h++) {
      const s = new Date(`${day}T${pad(h)}:00:00`).getTime(), e = s + 3600000;
      const taken = busy.some(a => { const x = new Date(a.starts_at).getTime(); return x < e && x + a.duration_min * 60000 > s; })
        || lv.some(l => new Date(l.start_at).getTime() < e && new Date(l.end_at).getTime() > s);
      if (!taken) free.push(h);
    }
    const ranges: string[] = [];
    for (let i = 0; i < free.length; i++) {
      let j = i; while (j + 1 < free.length && free[j + 1] === free[j] + 1) j++;
      ranges.push(`${pad(free[i])}:00–${pad(free[j] + 1)}:00`); i = j;
    }
    return { ranges, onLeave: lv.length > 0 };
  }

  const stats: { t: string; v: string; warn?: boolean; onPress?: () => void }[] = [
    { t: 'สมาชิกใช้งาน', v: n ? String(n.active) : '–', onPress: () => go('members') },
    { t: 'หมดใน 7 วัน', v: n ? String(n.expiring) : '–', warn: !!n?.expiring, onPress: () => go('members?f=expiring') },
    { t: 'หมดแล้ว (30 วัน)', v: n ? String(n.expired30) : '–', warn: !!n?.expired30, onPress: () => go('members?f=expired') },
    { t: 'เช็กอินวันนี้', v: n ? String(n.checkins) : '–' },
  ];

  return (
    <GymFrame id={id} gym={gym} role={role} active="home">
      <Header title="ภาพรวม" sub={gym?.name} right={<Txt muted size={14}>{thDate(todayISO())}</Txt>} />
      {err ? <Notice text={err} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {stats.map(s => (
          <Pressable key={s.t} accessibilityRole={s.onPress ? 'button' : undefined} onPress={s.onPress}
            style={{ flexGrow: 1, flexBasis: '40%', minWidth: 130, backgroundColor: s.warn ? C.warnBg : C.surface, borderRadius: R.card, padding: 14, gap: 2 }}>
            <Txt size={13} style={{ color: s.warn ? C.warnFg : C.muted }}>{s.t}</Txt>
            <Txt bold size={26} style={{ color: s.warn ? C.warnFg : C.fg }}>{s.v}</Txt>
          </Pressable>
        ))}
      </View>
      {n ? <Txt muted size={13}>{`รายรับวันนี้ ${baht(n.income)} · ขาจร ค่าสมาชิก และ PT ที่ขายวันนี้`}</Txt> : null}

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Label style={{ flex: 1 }}>วันนี้ใครเทรนใคร</Label>
          <Txt size={14} style={{ color: C.accent }} onPress={() => router.replace(`/gym/${id}/pt` as any)}>ดูทั้งหมด</Txt>
        </View>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {!today.length ? <Txt muted style={{ paddingVertical: 14 }}>วันนี้ไม่มีนัด PT</Txt> : null}
          {today.map(a => {
            const t = trainers.find(x => x.key === keyOf(a));
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Txt bold style={{ width: 52, color: C.accent }}>{apptRange(a).split('–')[0]}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt bold numberOfLines={1}>{`${t?.name ?? 'เทรนเนอร์'} → ${tcName(a.tc as any)}`}</Txt>
                  <Txt muted size={13}>{apptRange(a)}</Txt>
                </View>
                <Pill text={APPT_TH[a.status].t} kind={APPT_TH[a.status].k} />
              </View>
            );
          })}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Label style={{ flex: 1 }}>คลาสวันนี้</Label>
          <Txt size={14} style={{ color: C.accent }} onPress={() => router.replace(`/gym/${id}/classes` as any)}>+ เพิ่มคลาส / คน</Txt>
        </View>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {!classes.length ? <Txt muted style={{ paddingVertical: 14 }}>วันนี้ไม่มีคลาส</Txt> : null}
          {classes.map(c => {
            const d = new Date(c.starts_at);
            return (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => router.replace(`/gym/${id}/classes` as any)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Txt bold style={{ width: 52, color: C.accent }}>{`${pad(d.getHours())}:${pad(d.getMinutes())}`}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt bold numberOfLines={1}>{c.name}</Txt>
                  <Txt muted size={13} numberOfLines={1}>{c.coach?.name ? `ครู ${c.coach.name}` : 'ยังไม่ระบุผู้สอน'}</Txt>
                </View>
                <Pill text={seats(c)} kind={isFull(c) ? 'warn' : 'mute'} />
              </Pressable>
            );
          })}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <Label>{`เทรนเนอร์ว่างวันนี้ · เปิด ${open}–${close}`}</Label>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {closedToday ? <Txt muted style={{ paddingVertical: 14 }}>วันนี้ยิมปิด</Txt>
            : !trainers.length ? <Txt muted style={{ paddingVertical: 14 }}>ยังไม่มีเทรนเนอร์ · เพิ่มได้ที่ เพิ่มเติม → เทรนเนอร์</Txt>
            : trainers.map(t => {
              const f = freeToday(t);
              return (
                <Pressable key={t.key} accessibilityRole="button" onPress={() => router.replace(`/gym/${id}/pt?who=${encodeURIComponent(t.key)}` as any)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt bold numberOfLines={1}>{t.name}</Txt>
                    <Txt size={13} style={{ color: f.ranges.length ? C.accent : C.muted }}>
                      {f.onLeave && !f.ranges.length ? 'ลาวันนี้' : f.ranges.length ? f.ranges.slice(0, 3).join(' · ') + (f.ranges.length > 3 ? ' …' : '') : 'ไม่ว่างแล้ววันนี้'}
                    </Txt>
                  </View>
                  <Icon name="chevron-right" size={18} />
                </Pressable>
              );
            })}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <Label>เทรนเนอร์ 30 วันที่ผ่านมา</Label>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {!trainers.length ? <Txt muted style={{ paddingVertical: 14 }}>ยังไม่มีข้อมูล</Txt> : null}
          {trainers.length ? (
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Txt muted size={12.5} style={{ flex: 1.6 }}>เทรนเนอร์</Txt>
              {['เทรนแล้ว', 'ไม่มา', 'ลูกเทรน', 'ใกล้หมด'].map(h => <Txt key={h} muted size={12.5} style={{ flex: 1, textAlign: 'right' }}>{h}</Txt>)}
            </View>
          ) : null}
          {trainers.map(t => {
            const mine = month.filter(a => keyOf(a) === t.key);
            const cells = [mine.filter(a => a.status === 'done').length, mine.filter(a => a.status === 'noshow').length, t.clients, t.low];
            return (
              <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Txt bold size={14} numberOfLines={1} style={{ flex: 1.6 }}>{t.name}</Txt>
                {cells.map((v, i) => (
                  <Txt key={i} size={14} bold={i === 0} style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'], color: (i === 1 || i === 3) && v ? C.warnFg : C.fg }}>{v}</Txt>
                ))}
              </View>
            );
          })}
          {trainers.length ? <Txt muted size={12} style={{ paddingVertical: 8 }}>ไม่มา = ลูกเทรนไม่มาตามนัด · ใกล้หมด = ลูกเทรนที่ PT เหลือไม่เกิน 2 ครั้ง</Txt> : null}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <Label>สมาชิกใกล้หมดและหมดแล้ว</Label>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {n && !expiring.length && !expired.length ? <Txt muted style={{ paddingVertical: 14 }}>ไม่มีสมาชิกใกล้หมดหรือเพิ่งหมด</Txt> : null}
          {expiring.map(m => (
            <Row key={m.id} title={m.name} sub={m.plan_name ?? undefined} onPress={() => go(`member/${m.id}`)}
              right={<Pill text={m.days_left === 0 ? 'หมดวันนี้' : `อีก ${m.days_left} วัน`} kind="warn" />} />
          ))}
          {expired.map(m => (
            <Row key={m.id} title={m.name} sub={m.plan_name ?? undefined} onPress={() => go(`member/${m.id}`)}
              right={<Pill text={`หมด ${Math.abs(m.days_left ?? 0)} วันแล้ว`} kind="bad" />} />
          ))}
        </Card>
      </View>

      <Card style={{ gap: 0, paddingVertical: 4 }}>
        <Row ic="circle-check" title="เปิดโหมดเคาน์เตอร์" sub="เช็กอิน ขาจร ขาย และต่ออายุ" onPress={() => router.replace(`/gym/${id}/counter` as any)} />
      </Card>
    </GymFrame>
  );
}
