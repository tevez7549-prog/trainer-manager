import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { MEMBER_TABS } from '../../../src/lib/nav';
import { TC_COLS, tcName, type TC } from '../../../src/lib/trainer';
import { groupDays, groupStreak, KIND, myGroups, takePendingJoin, type Group } from '../../../src/lib/groups';
import { Btn, Card, Empty, Field, H, Label, Notice, Pill, Row, Screen, Txt } from '../../../src/ui';
import { Icon } from '../../../src/ui/Icon';
import { TabBar } from '../../../src/ui/TabBar';
import { C, R } from '../../../src/lib/theme';

type G = Group & { members: string[]; streak: ReturnType<typeof groupStreak> };
type Sent = { id: string; to_name: string };

/** Groups tab: train with your partner, family or friends, and the people you look after */
export default function Groups() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<G[] | null>(null);
  const [care, setCare] = useState<TC[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const join = useCallback(async (c: string) => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('join_group', { gcode: c });
    setBusy(false);
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    setCode('');
    router.push(`/groups/${(data as any).id}` as any);
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;
    const pending = await takePendingJoin();
    if (pending) { join(pending); }
    const [gs, tc, inv] = await Promise.all([
      myGroups(profile.id),
      supabase.from('trainer_clients').select(TC_COLS).eq('trainer_id', profile.id).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.rpc('my_sent_invites'),
    ]);
    const withStreak = await Promise.all(gs.map(async g => ({ ...g, streak: groupStreak(await groupDays(g.id), g.members.length) })));
    setGroups(withStreak);
    setCare(((tc.data as any) ?? []) as TC[]);
    setSent(((inv.data as any[]) ?? []).filter(x => x.kind === 'client'));
  }, [profile, join]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // the hero shows the group with the longest "together" streak (or the first one)
  const hero = groups?.length ? [...groups].sort((a, b) => b.streak.n - a.streak.n)[0] : null;
  const meToday = hero && profile ? hero.streak.trainedToday.has(profile.id) : false;

  return (
    <Screen footer={<TabBar tabs={MEMBER_TABS} active="group" />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8 }}>
        <H size={24} style={{ flex: 1 }}>กลุ่ม</H>
        <Btn kind="ghost" icon="plus" label="สร้างกลุ่ม" onPress={() => router.push('/groups/new' as any)} />
      </View>
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {hero ? (
        <View style={{ backgroundColor: C.brand, borderRadius: R.card, padding: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="flame" size={18} color={C.brandInk} />
            <Txt bold size={14} style={{ color: C.brandInk }}>{hero.name}</Txt>
          </View>
          <H size={28} style={{ color: C.brandInk }}>{hero.streak.n ? `เล่นด้วยกัน ${hero.streak.n} วันติด` : 'เริ่มสถิติเล่นด้วยกันวันนี้'}</H>
          <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`7 วันล่าสุด เล่นครบ ${hero.streak.last7.filter(Boolean).length} วัน`}>
            {hero.streak.last7.map((on, i) => <View key={i} style={{ flex: 1, height: 8, borderRadius: R.pill, backgroundColor: on ? C.brandInk : 'rgba(20,26,0,0.22)' }} />)}
          </View>
          <Txt size={14} style={{ color: C.brandInk }}>
            {hero.members.length <= 1 ? 'ชวนคนอื่นเข้ากลุ่มก่อน แล้วเล่นด้วยกันให้ครบทุกวัน'
              : hero.streak.todayDone ? 'วันนี้ครบแล้ว เก่งมาก' : meToday ? `วันนี้คุณเล่นแล้ว รออีก ${Math.max(0, hero.streak.need - hero.streak.trainedToday.size)} คน`
              : `วันนี้ยังไม่ครบ เล่นวันนี้เพื่อต่อสถิติ`}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push((meToday ? `/groups/${hero.id}` : '/my/train') as any)}
              style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: R.field, backgroundColor: C.brandInk, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Txt bold style={{ color: C.brand }}>{meToday ? 'ดูฟีดกลุ่ม' : 'เริ่มเล่นวันนี้'}</Txt>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Label>กลุ่มของฉัน</Label>
      {groups === null ? <Txt muted>กำลังโหลด…</Txt> : !groups.length ? (
        <Card><Empty ic="users" title="ยังไม่มีกลุ่ม" text="สร้างกลุ่มกับแฟน ครอบครัว หรือเพื่อน แล้วส่งลิงก์ชวน · ใครเล่นเสร็จ ทุกคนในกลุ่มเห็นและเชียร์กันได้"
          action="สร้างกลุ่ม" onAction={() => router.push('/groups/new' as any)} /></Card>
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {groups.map(g => {
            const today = g.streak.trainedToday.size;
            return (
              <Row key={g.id} ic={KIND[g.kind]?.icon ?? 'users'} title={g.name}
                sub={`${g.members.length} คน${g.streak.n ? ` · ด้วยกัน ${g.streak.n} วันติด` : ''}`}
                right={today ? <Pill text={`วันนี้เล่น ${today}`} /> : <Pill kind="mute" text="วันนี้ยังไม่มีใครเล่น" />}
                onPress={() => router.push(`/groups/${g.id}` as any)} />
            );
          })}
        </Card>
      )}

      <Card>
        <Txt bold>มีโค้ดชวน?</Txt>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label="โค้ด 6 ตัว" value={code} onChangeText={t => setCode(t.toUpperCase())} placeholder="เช่น K7M-2QX" autoCapitalize="characters" autoCorrect={false} /></View>
          <Btn label="เข้ากลุ่ม" onPress={() => join(code)} loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6} style={{ minHeight: 48 }} />
        </View>
      </Card>

      <Label>คนที่ฉันดูแล</Label>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {care.map(t => (
          <Row key={t.id} icon={tcName(t).replace(/^คุณ/, '').slice(0, 1)} title={tcName(t)}
            sub={t.client_id ? 'มีแอป · ส่งโปรแกรม ตั้งเป้า ดูการกินได้' : 'ไม่มีแอป · คุณบันทึกแทน'}
            onPress={() => router.push(`/trainer/client/${t.id}?from=groups` as any)} />
        ))}
        {sent.map(s => <Row key={s.id} icon={s.to_name.slice(0, 1)} title={s.to_name} sub="ส่งคำขอดูแลแล้ว" right={<Pill kind="caution" text="รอกดรับ" />} />)}
        <Row ic="user-plus" title="เพิ่มคนที่ฉันดูแล" sub="เขามีแอปหรือไม่มีก็ได้ · เช่น พ่อแม่ แฟน ลูกค้าเทรนส่วนตัว"
          onPress={() => router.push('/trainer/add?from=groups' as any)} />
      </Card>
    </Screen>
  );
}
