import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { MEMBER_TABS } from '../../../src/lib/nav';
import { addDays, thDateTs, thTime, todayISO } from '../../../src/lib/gym';
import {
  ago, daysSince, foodState, groupDays, groupFood, groupStreak, inviteUrl, KIND, MAX_MEMBERS, weekBoard,
  type Day, type FeedItem, type FoodDay, type Group, type Person,
} from '../../../src/lib/groups';
import { shareCard } from '../../../src/lib/shareCard';
import { Btn, Card, ConfirmBtn, Empty, H, Header, Label, Notice, Pill, Row, Screen, Txt } from '../../../src/ui';
import { Icon } from '../../../src/ui/Icon';
import { TabBar } from '../../../src/ui/TabBar';
import { GroupInvite } from '../../../src/ui/GroupInvite';
import { GroupFood } from '../../../src/ui/GroupFood';
import { C, R } from '../../../src/lib/theme';

type Tab = 'feed' | 'food' | 'board' | 'people';
const mins = (a: string, b: string | null) => (b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)) : 0);

export default function GroupPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [g, setG] = useState<Group | null | undefined>(undefined);
  const [people, setPeople] = useState<Person[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [tab, setTab] = useState<Tab>('feed');
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [food, setFood] = useState<FoodDay[]>([]);
  const [sharing, setSharing] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    const [gr, p, f, d, fd, sh] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).maybeSingle(),
      supabase.rpc('group_people', { g: id }),
      supabase.rpc('group_feed', { g: id, lim: 40 }),
      groupDays(id),
      groupFood(id, addDays(todayISO(), -6), todayISO()),
      supabase.from('group_members').select('user_id').eq('group_id', id).eq('share_food', true),
    ]);
    setFood(fd);
    setSharing(new Set(((sh.data as { user_id: string }[]) ?? []).map(x => x.user_id)));
    setG((gr.data as Group) ?? null);
    setPeople((p.data as Person[]) ?? []);
    setFeed((f.data as FeedItem[]) ?? []);
    setDays(d);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/groups' as any));
  if (g === undefined) return <Screen><Header title="กลุ่ม" back={back} /><Txt muted>กำลังโหลด…</Txt></Screen>;
  if (!g) return <Screen><Header title="กลุ่ม" back={back} /><Notice text="ไม่พบกลุ่มนี้ หรือคุณออกจากกลุ่มแล้ว" /></Screen>;

  const me = profile?.id;
  const streak = groupStreak(days, people.length);
  const board = weekBoard(days);
  const goal = Math.max(3, people.length * 3);
  const done = Object.values(board.count).reduce((s, n) => s + n, 0);
  const ranked = [...people].sort((a, b) => (board.count[b.user_id] ?? 0) - (board.count[a.user_id] ?? 0));
  const nameOf = (u: string) => (u === me ? 'คุณ' : people.find(p => p.user_id === u)?.display_name ?? '–');

  async function cheer(f: FeedItem) {
    setFeed(feed.map(x => (x.workout_id === f.workout_id ? { ...x, cheered: !x.cheered, cheers: x.cheers + (x.cheered ? -1 : 1) } : x)));
    const r = f.cheered
      ? await supabase.from('group_cheers').delete().eq('workout_id', f.workout_id).eq('user_id', me!)
      : await supabase.from('group_cheers').insert({ workout_id: f.workout_id, user_id: me });
    if (r.error) { setMsg({ t: thError(r.error), ok: false }); load(); }
  }
  async function nudge(p: Person) {
    const { data, error } = await supabase.rpc('nudge', { g: g!.id, person: p.user_id });
    setMsg(error ? { t: thError(error), ok: false } : { t: (data as any)?.sent ? `สะกิด ${p.display_name} แล้ว · เขาจะเห็นที่หน้าแรก` : `เพิ่งสะกิด ${p.display_name} ไปแล้ว ลองใหม่พรุ่งนี้`, ok: true });
  }
  async function care(p: Person) {
    const { error } = await supabase.rpc('invite_client', { client_uid: p.uid });
    setMsg(error ? { t: thError(error), ok: false } : { t: `ส่งคำขอดูแลถึง ${p.display_name} แล้ว · พอเขากดรับ คุณส่งโปรแกรม ตั้งเป้า และดูการกินให้ได้`, ok: true });
  }
  async function leave() {
    const { error } = await supabase.from('group_members').delete().eq('group_id', g!.id).eq('user_id', me!);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    router.replace('/groups' as any);
  }
  async function setShare(on: boolean) {
    const next = new Set(sharing); if (on) next.add(me!); else next.delete(me!);
    setSharing(next);
    const { error } = await supabase.rpc('set_group_food_share', { g: g!.id, share: on });
    if (error) { setMsg({ t: thError(error), ok: false }); load(); return; }
    setMsg({ t: on ? 'แชร์อาหารให้กลุ่มนี้แล้ว' : 'เลิกแชร์อาหารกับกลุ่มนี้แล้ว', ok: true });
    load();
  }
  // this week (Monday on): days trained, kg lifted, food days on target
  const weekFeed = feed.filter(f => f.started_at.slice(0, 10) >= board.monday);
  const volume = weekFeed.reduce((s, f) => s + Number(f.volume || 0), 0);
  const foodHits = food.filter(x => x.day >= board.monday && foodState(x.kcal, x.t_kcal, x.day === todayISO()) === 'on').length;
  async function shareWeek() {
    const top = ranked[0] && board.count[ranked[0].user_id] ? ranked[0] : null;
    const r = await shareCard({
      who: g!.name, big: String(done), bigLabel: 'วันที่เล่น สัปดาห์นี้', week: streak.last7,
      stats: [
        ...(volume ? [['ยกรวมทั้งกลุ่ม', `${Math.round(volume).toLocaleString('en-US')} kg`] as [string, string]] : []),
        ...(sharing.size ? [['กินตามเป้า', `${foodHits} วัน`] as [string, string]] : []),
        ...(top ? [['ขยันสุด', `${top.display_name} ${board.count[top.user_id]} วัน`] as [string, string]] : []),
        ...(streak.n ? [['เล่นด้วยกันติดกัน', `${streak.n} วัน`] as [string, string]] : []),
      ].slice(0, 3),
      footer: `เล่นด้วยกันไหม? ${inviteUrl(g!.code).replace(/^https?:\/\//, '')}`,
    }, 'dogfits-week.png');
    if (r === 'saved') setMsg({ t: 'บันทึกรูปแล้ว เอาไปลงสตอรี่หรือส่งใน LINE ได้เลย', ok: true });
  }

  async function share(f: FeedItem) {
    const r = await shareCard({
      who: f.display_name, big: String(mins(f.started_at, f.ended_at) || f.sets), bigLabel: mins(f.started_at, f.ended_at) ? 'นาที วันนี้' : 'เซต วันนี้',
      week: streak.last7,
      stats: [['เล่น', f.title || 'ออกกำลังกาย'], ['ท่า · เซต', `${f.moves} ท่า · ${f.sets} เซต`], ...(f.volume ? [['ยกรวม', `${Math.round(f.volume).toLocaleString('en-US')} kg`] as [string, string]] : [])],
      footer: `เล่นด้วยกันไหม? ${inviteUrl(g!.code).replace(/^https?:\/\//, '')}`,
    });
    if (r === 'saved') setMsg({ t: 'บันทึกรูปแล้ว เอาไปลงสตอรี่ได้เลย', ok: true });
  }

  return (
    <Screen footer={<TabBar tabs={MEMBER_TABS} active="group" />}>
      <Header title={g.name} sub={`${KIND[g.kind]?.t ?? ''} · ${people.length}/${MAX_MEMBERS} คน`} back={back}
        right={<Pressable accessibilityRole="button" accessibilityLabel="ชวนเข้ากลุ่ม" onPress={() => setInviting(!inviting)}
          style={{ width: 44, height: 44, borderRadius: R.field, borderWidth: 1, borderColor: C.line, backgroundColor: inviting ? C.accentSoft : C.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="user-plus" size={20} color={C.accent} /></Pressable>} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}
      {inviting || people.length <= 1 ? <Card><Txt bold>ชวนเข้ากลุ่ม</Txt><GroupInvite name={g.name} code={g.code} /></Card> : null}

      <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: C.surface, borderRadius: R.field, padding: 4, gap: 4 }}>
        {([['feed', 'ฟีด'], ['food', 'อาหาร'], ['board', 'อันดับ'], ['people', 'สมาชิก']] as [Tab, string][]).map(([k, t]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)}
            style={{ flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === k ? C.accentSoft : 'transparent' }}>
            <Txt bold={tab === k} size={14} style={{ color: tab === k ? C.accent : C.muted }}>{t}</Txt>
          </Pressable>
        ))}
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Txt bold style={{ flex: 1 }}>เป้ากลุ่มสัปดาห์นี้</Txt>
          <H size={22} style={{ fontVariant: ['tabular-nums'] }}>{done}</H>
          <Txt muted size={14}>/ {goal} ครั้ง</Txt>
        </View>
        <View style={{ height: 8, borderRadius: R.pill, backgroundColor: C.surface2, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, (done / goal) * 100)}%`, height: 8, borderRadius: R.pill, backgroundColor: C.accent }} />
        </View>
        <Txt muted size={13}>{streak.n ? `เล่นด้วยกัน ${streak.n} วันติด · ` : ''}เหลือ {board.daysLeft} วัน{ranked[0] && board.count[ranked[0].user_id] ? ` · นำอยู่: ${nameOf(ranked[0].user_id)} ${board.count[ranked[0].user_id]} ครั้ง` : ''}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {volume ? <Pill kind="mute" text={`ยกรวม ${Math.round(volume).toLocaleString('en-US')} kg`} /> : null}
          {sharing.size ? <Pill kind="mute" text={`กินตามเป้า ${foodHits} วัน`} /> : null}
        </View>
        <Btn kind="ghost" icon="share" label="แชร์สรุปสัปดาห์" onPress={shareWeek} />
      </Card>

      {tab === 'feed' ? (
        !feed.length ? <Card><Empty ic="dumbbell" title="ยังไม่มีใครบันทึกการเล่น" text="บันทึกการเล่นที่แท็บ ออกกำลัง แล้วจะขึ้นที่นี่ให้ทุกคนในกลุ่มเห็น" action="ไปบันทึกการเล่น" onAction={() => router.push('/my/train' as any)} /></Card>
          : feed.map(f => {
            const m = mins(f.started_at, f.ended_at), mine = f.user_id === me;
            return (
              <Card key={f.workout_id} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: R.pill, backgroundColor: mine ? C.accentSoft : C.infoBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt bold size={14} style={{ color: mine ? C.accent : C.infoFg }}>{(mine ? 'ฉ' : f.display_name).slice(0, 1)}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt bold>{mine ? 'คุณ' : f.display_name} เล่นเสร็จแล้ว</Txt>
                    <Txt muted size={13}>{f.started_at.slice(0, 10) === todayISO() ? `วันนี้ ${thTime(f.started_at)}` : thDateTs(f.started_at)}</Txt>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, backgroundColor: C.surface2, borderRadius: R.field, padding: 12 }}>
                  <View style={{ flex: 1.3, minWidth: 0 }}><Txt bold numberOfLines={1}>{f.title || 'ออกกำลังกาย'}</Txt><Txt muted size={12.5}>{f.moves} ท่า · {f.sets} เซต</Txt></View>
                  {m ? <View style={{ flex: 1 }}><Txt bold style={{ fontVariant: ['tabular-nums'] }}>{m} นาที</Txt><Txt muted size={12.5}>เวลา</Txt></View> : null}
                  {f.volume ? <View style={{ flex: 1 }}><Txt bold style={{ fontVariant: ['tabular-nums'] }}>{Math.round(f.volume).toLocaleString('en-US')}</Txt><Txt muted size={12.5}>kg รวม</Txt></View> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {!mine ? (
                    <Pressable accessibilityRole="button" accessibilityState={{ selected: f.cheered }} accessibilityLabel={f.cheered ? 'เลิกเชียร์' : 'เชียร์'} onPress={() => cheer(f)}
                      style={{ height: 38, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, borderColor: f.cheered ? C.accent : C.line, backgroundColor: f.cheered ? C.accentSoft : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="flame" size={18} color={f.cheered ? C.accent : C.fg} />
                      <Txt bold size={14} style={{ color: f.cheered ? C.accent : C.fg }}>เชียร์{f.cheers ? ` ${f.cheers}` : ''}</Txt>
                    </Pressable>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38 }}>
                      <Icon name="flame" size={18} color={f.cheers ? C.accent : C.muted} />
                      <Txt muted size={14}>{f.cheers ? `${f.cheers} คนเชียร์คุณ` : 'ยังไม่มีคนเชียร์'}</Txt>
                    </View>
                  )}
                  {mine ? <Pressable accessibilityRole="button" onPress={() => share(f)}
                    style={{ height: 38, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    <Icon name="share" size={18} color={C.fg} /><Txt size={14}>แชร์ลงสตอรี่</Txt>
                  </Pressable> : null}
                </View>
              </Card>
            );
          })
      ) : null}

      {tab === 'food' ? (
        <GroupFood groupId={g.id} me={me} people={people} sharing={sharing} myShare={!!me && sharing.has(me)} rows={food} onShare={setShare} />
      ) : null}

      {tab === 'board' ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {ranked.map((p, i) => {
            const n = board.count[p.user_id] ?? 0;
            return (
              <Row key={p.user_id} icon={String(i + 1)} title={p.user_id === me ? `${p.display_name} (คุณ)` : p.display_name}
                sub={`ล่าสุด ${ago(p.last_workout)}`} right={<Txt bold style={{ fontVariant: ['tabular-nums'] }}>{n} ครั้ง</Txt>} />
            );
          })}
          <Txt muted size={12.5} style={{ paddingVertical: 10 }}>นับวันที่บันทึกการเล่น ตั้งแต่วันจันทร์ · 1 วันนับ 1 ครั้ง</Txt>
        </Card>
      ) : null}

      {tab === 'people' ? <>
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {people.map(p => {
            const self = p.user_id === me, idle = daysSince(p.last_workout);
            return (
              <View key={p.user_id} style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8, gap: 6 }}>
                <Row icon={p.display_name.slice(0, 1)} title={self ? `${p.display_name} (คุณ)` : p.display_name}
                  sub={`${p.is_owner ? 'ผู้สร้างกลุ่ม · ' : ''}เล่นล่าสุด ${ago(p.last_workout)}`}
                  right={!self && idle >= 3 ? <Pill kind="warn" text={idle >= 999 ? 'ยังไม่เริ่ม' : `${idle} วันไม่เล่น`} /> : p.i_care ? <Pill text="คุณดูแล" /> : null} />
                {!self ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Btn kind="ghost" icon="send" label="สะกิดชวน" onPress={() => nudge(p)} style={{ flex: 1, minHeight: 40 }} />
                    {!p.i_care ? <Btn kind="ghost" icon="heart" label="ขอดูแล" onPress={() => care(p)} style={{ flex: 1, minHeight: 40 }} /> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
        <Txt muted size={12.5}>"ขอดูแล" = ส่งโปรแกรม ตั้งเป้า และดูการกินให้คนนั้น เขาต้องกดรับก่อน · คนที่ไม่มีแอป เพิ่มได้ที่หน้า กลุ่ม › คนที่ฉันดูแล</Txt>
        <Label>ออกจากกลุ่ม</Label>
        <ConfirmBtn label="ออกจากกลุ่มนี้" confirmLabel="ยืนยัน ออกจากกลุ่ม" onConfirm={leave} />
      </> : null}
    </Screen>
  );
}
