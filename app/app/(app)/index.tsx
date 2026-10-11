import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { thDate } from '../../src/lib/gym';
import { landing, MEMBER_TABS } from '../../src/lib/nav';
import { STATUS_TH, type Member } from '../../src/lib/counter';
import { apptRange, dayLabel, sessionsLeft } from '../../src/lib/trainer';
import { Btn, Card, H, Loading, Notice, Pill, Screen, Txt } from '../../src/ui';
import { TabBar } from '../../src/ui/TabBar';
import { C, R } from '../../src/lib/theme';

type Mode = 'loading' | 'member' | 'start';

/** Opening the app: staff go straight to their job; members see their card; new people get one clear next step */
export default function Home() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>('loading');

  useFocusEffect(useCallback(() => {
    if (!profile) return;
    let alive = true;
    landing(profile.id).then(r => {
      if (!alive) return;
      if ('to' in r) router.replace(r.to as any);
      else setMode('member' in r ? 'member' : 'start');
    });
    return () => { alive = false; };
  }, [profile]));

  if (mode === 'loading') return <Loading />;
  if (mode === 'start') return <Start />;
  return <MemberHome />;
}

function Start() {
  const { profile } = useAuth();
  return (
    <Screen>
      <View style={{ gap: 2, paddingTop: 8 }}>
        <Txt muted size={14}>สวัสดี</Txt>
        <H size={24}>{profile?.display_name || 'ผู้ใช้ใหม่'}</H>
      </View>
      <View style={{ backgroundColor: C.brand, borderRadius: R.card, padding: 20, gap: 4, alignItems: 'center' }}>
        <Txt size={14} style={{ color: C.brandInk }}>UID ของคุณ</Txt>
        <H size={40} style={{ color: C.brandInk, letterSpacing: 2 }}>{profile?.uid}</H>
        <Txt size={14} style={{ color: C.brandInk, textAlign: 'center' }}>ทีมงานหรือสมาชิกยิม: บอกเลขนี้ให้ยิม แล้วแอปจะพาไปหน้างานของคุณเอง</Txt>
      </View>
      <Card>
        <H size={17}>เป็นเจ้าของยิม?</H>
        <Txt muted size={14}>สร้างยิมแล้วเริ่มเช็กอิน ขายแพ็กเกจ และดู PT ได้ทันที</Txt>
        <Btn icon="plus" label="สร้างยิม" onPress={() => router.push('/gym/new' as any)} />
      </Card>
      {profile?.is_super_admin ? <Btn kind="ghost" icon="shield" label="หลังบ้าน (Super Admin)" onPress={() => router.push('/admin' as any)} /> : null}
      <Btn kind="ghost" icon="user" label="ข้อมูลของฉัน" onPress={() => router.push('/me' as any)} />
    </Screen>
  );
}

type Tc = { id: string; member_id: string | null; trainer: { display_name: string } | null };
type Next = { trainer_client_id: string; starts_at: string; duration_min: number };
type Invite = { id: string; from_name: string; from_uid: number };

function MemberHome() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<(Member & { gym: { name: string } | null })[] | null>(null);
  const [tcs, setTcs] = useState<Tc[]>([]);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [next, setNext] = useState<Next[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [m, inv] = await Promise.all([
      supabase.from('member_status').select('*, gym:gyms(name)').eq('profile_id', profile.id),
      supabase.rpc('my_invites'),
    ]);
    const rows = ((m.data as any) ?? []) as (Member & { gym: { name: string } | null })[];
    setCards(rows);
    setInvites((inv.data as Invite[]) ?? []);
    const ids = rows.map(r => r.id);
    const t = await supabase.from('trainer_clients').select('id,member_id,trainer:profiles!trainer_clients_trainer_id_fkey(display_name)')
      .eq('status', 'active').or(ids.length ? `client_id.eq.${profile.id},member_id.in.(${ids.join(',')})` : `client_id.eq.${profile.id}`);
    const list = ((t.data as any) ?? []) as Tc[];
    setTcs(list);
    if (list.length) {
      const [l, a] = await Promise.all([
        sessionsLeft(list.map(x => x.id)),
        supabase.from('appointments').select('trainer_client_id,starts_at,duration_min').in('trainer_client_id', list.map(x => x.id))
          .eq('status', 'scheduled').gte('starts_at', new Date(Date.now() - 3600000).toISOString()).order('starts_at').limit(5),
      ]);
      setLeft(l); setNext((a.data as Next[]) ?? []);
    }
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function answer(i: Invite, accept: boolean) {
    const { error } = await supabase.rpc('answer_invite', { i: i.id, accept });
    setMsg(error ? { t: thError(error), ok: false } : { t: accept ? `รับ ${i.from_name} เป็นเทรนเนอร์แล้ว` : 'ปฏิเสธคำเชิญแล้ว', ok: true });
    load();
  }

  const trainerOf = (tcId: string) => tcs.find(t => t.id === tcId)?.trainer?.display_name ?? 'เทรนเนอร์';
  const ptLeft = (memberId?: string) => tcs.filter(t => !memberId || t.member_id === memberId).reduce((s, t) => s + (left[t.id] ?? 0), 0);
  const first = next[0];

  return (
    <Screen footer={<TabBar tabs={MEMBER_TABS} active="card" />}>
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

      {first ? (
        <View style={{ backgroundColor: C.brand, borderRadius: R.card, padding: 20, gap: 4 }}>
          <Txt bold size={14} style={{ color: C.brandInk }}>นัด PT ถัดไป</Txt>
          <H size={28} style={{ color: C.brandInk }}>{dayLabel(first.starts_at)} {apptRange(first).split('–')[0]}</H>
          <Txt size={14} style={{ color: C.brandInk }}>กับ {trainerOf(first.trainer_client_id)} · เหลือ {left[first.trainer_client_id] ?? 0} ครั้ง</Txt>
        </View>
      ) : null}

      {cards === null ? <Txt muted>กำลังโหลด…</Txt> : null}
      {(cards ?? []).map(m => {
        const st = STATUS_TH[m.status];
        const pt = ptLeft(m.id);
        return (
          <Card key={m.id} style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <H size={18} style={{ flex: 1 }}>{m.gym?.name ?? 'ยิม'}</H>
              <Pill text={st.t} kind={st.k} />
            </View>
            <View style={{ alignItems: 'center', paddingVertical: 14, borderRadius: R.field, backgroundColor: C.surface2, gap: 2 }}>
              <Txt muted size={14}>แสดงรหัสนี้ที่เคาน์เตอร์</Txt>
              <H size={40} style={{ letterSpacing: 2 }}>{m.code}</H>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Txt muted size={14}>หมดอายุ</Txt><Txt bold>{m.status === 'frozen' ? `พักถึง ${thDate(m.frozen_until)}` : thDate(m.end_date)}</Txt></View>
              <View style={{ flex: 1 }}><Txt muted size={14}>PT เหลือ</Txt><Txt bold>{pt} ครั้ง</Txt></View>
            </View>
          </Card>
        );
      })}

      {next.length > 1 ? (
        <Card style={{ gap: 6 }}>
          <H size={17}>นัดที่จะถึง</H>
          {next.slice(1).map(a => <Txt key={a.starts_at + a.trainer_client_id}>{dayLabel(a.starts_at)} {apptRange(a)} · {trainerOf(a.trainer_client_id)}</Txt>)}
        </Card>
      ) : null}
      {cards && !cards.length && !tcs.length ? <Txt muted>ยังไม่มีบัตรสมาชิก</Txt> : null}
      {!cards?.length && tcs.length ? <Txt muted>PT เหลือทั้งหมด {ptLeft()} ครั้ง</Txt> : null}
    </Screen>
  );
}
