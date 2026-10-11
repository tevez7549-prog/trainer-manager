import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase, thError } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/auth';
import { thDate } from '../../src/lib/gym';
import { apptRange, dayLabel, sessionsLeft, type Pkg } from '../../src/lib/trainer';
import { Btn, Card, H, Notice, Pill, Row, Screen, Txt } from '../../src/ui';
import { C } from '../../src/lib/theme';

type MyGym = { role: string; gym: { id: string; name: string; branch: string | null } };
type Invite = { id: string; kind: string; from_name: string; from_uid: number };
type MyTrainer = { id: string; trainer: { display_name: string } | null; gym: { name: string } | null };
type NextAppt = { trainer_client_id: string; starts_at: string; duration_min: number };
const ROLE_TH: Record<string, string> = { owner: 'เจ้าของ', admin: 'Admin', operator: 'Operator', trainer: 'เทรนเนอร์' };

export default function Home() {
  const { profile } = useAuth();
  const [gyms, setGyms] = useState<MyGym[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [mine, setMine] = useState<MyTrainer[]>([]);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [pkgEnd, setPkgEnd] = useState<Record<string, string | null>>({});
  const [next, setNext] = useState<Record<string, NextAppt>>({});
  const [todayCount, setTodayCount] = useState(0);
  const [traineeCount, setTraineeCount] = useState(0);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    const s = new Date(); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    const [g, inv, my, today, tcount] = await Promise.all([
      supabase.from('gym_staff').select('role, gym:gyms(id,name,branch)').eq('user_id', profile.id).eq('active', true),
      supabase.rpc('my_invites'),
      supabase.from('trainer_clients').select('id, trainer:profiles!trainer_clients_trainer_id_fkey(display_name), gym:gyms(name)').eq('client_id', profile.id).eq('status', 'active'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('trainer_id', profile.id).eq('status', 'scheduled').gte('starts_at', s.toISOString()).lt('starts_at', e.toISOString()),
      supabase.from('trainer_clients').select('id', { count: 'exact', head: true }).eq('trainer_id', profile.id).eq('status', 'active'),
    ]);
    if (g.error) setErr('โหลดข้อมูลยิมไม่สำเร็จ'); else setGyms((g.data as any) ?? []);
    setInvites((inv.data as Invite[]) ?? []);
    const m = ((my.data as any) ?? []) as MyTrainer[];
    setMine(m);
    setTodayCount(today.count ?? 0);
    setTraineeCount(tcount.count ?? 0);
    if (m.length) {
      const ids = m.map(x => x.id);
      const [l, p, a] = await Promise.all([
        sessionsLeft(ids),
        supabase.from('pt_package_status').select('trainer_client_id,end_date,sessions_left').in('trainer_client_id', ids).gt('sessions_left', 0).order('end_date'),
        supabase.from('appointments').select('trainer_client_id,starts_at,duration_min').in('trainer_client_id', ids).eq('status', 'scheduled').gte('starts_at', new Date().toISOString()).order('starts_at').limit(20),
      ]);
      setLeft(l);
      const ends: Record<string, string | null> = {};
      ((p.data as Pick<Pkg, 'trainer_client_id' | 'end_date'>[]) ?? []).forEach(x => { if (!(x.trainer_client_id in ends)) ends[x.trainer_client_id] = x.end_date; });
      setPkgEnd(ends);
      const nx: Record<string, NextAppt> = {};
      ((a.data as NextAppt[]) ?? []).forEach(x => { if (!nx[x.trainer_client_id]) nx[x.trainer_client_id] = x; });
      setNext(nx);
    }
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function answer(i: Invite, accept: boolean) {
    const { error } = await supabase.rpc('answer_invite', { i: i.id, accept });
    if (error) { setMsg({ t: thError(error), ok: false }); return; }
    setMsg({ t: accept ? `รับ ${i.from_name} เป็นเทรนเนอร์แล้ว` : 'ปฏิเสธคำเชิญแล้ว', ok: true });
    load();
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt muted size={13}>สวัสดี</Txt>
          <H size={24}>{profile?.display_name || 'ผู้ใช้ใหม่'}</H>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="หน้าของฉัน" onPress={() => router.push('/me')}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt bold style={{ color: C.accent }}>{(profile?.display_name || '?').slice(0, 1)}</Txt>
        </Pressable>
      </View>

      {err ? <Notice text={err} /> : null}
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {invites.map(i => (
        <Card key={i.id} style={{ borderWidth: 1.5, borderColor: C.accent }}>
          <H size={17}>คำเชิญจากเทรนเนอร์</H>
          <Txt><Txt bold>{i.from_name}</Txt> (UID {i.from_uid}) เชิญคุณเป็นลูกเทรน</Txt>
          <Txt muted size={12.5}>ถ้ารับ เทรนเนอร์จะเห็นชื่อ เบอร์ นัดเทรน รูปร่างกาย และอาหารของคุณ · ยกเลิกทีหลังได้</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="รับ" onPress={() => answer(i, true)} style={{ flex: 1 }} />
            <Btn kind="ghost" label="ไม่รับ" onPress={() => answer(i, false)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}

      {mine.length ? (
        <Card style={{ gap: 6 }}>
          <H size={17}>เทรนเนอร์ของฉัน</H>
          {mine.map(t => {
            const n = left[t.id] ?? 0, nx = next[t.id];
            return (
              <View key={t.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt bold style={{ flex: 1 }}>{t.trainer?.display_name ?? 'เทรนเนอร์'}{t.gym ? ` · ${t.gym.name}` : ''}</Txt>
                  <Pill text={`เหลือ ${n} ครั้ง`} kind={n === 0 ? 'bad' : n <= 2 ? 'warn' : 'ok'} />
                </View>
                <Txt muted size={13}>{nx ? `นัดถัดไป ${dayLabel(nx.starts_at)} ${apptRange(nx)}` : 'ยังไม่มีนัด'}{pkgEnd[t.id] ? ` · แพ็กเกจหมด ${thDate(pkgEnd[t.id])}` : ''}</Txt>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card>
        <H size={17}>ยิมของฉัน</H>
        {gyms === null ? <Txt muted>กำลังโหลด…</Txt> :
          gyms.length === 0 ? <Txt muted>ยังไม่มียิม ถ้าคุณเป็นเจ้าของยิม สร้างยิมได้เลย · ถ้าเป็นทีมงาน ให้เจ้าของยิมเพิ่มคุณด้วย UID {profile?.uid}</Txt> :
            gyms.map(g => (
              <Row key={g.gym.id} icon={g.gym.name.slice(0, 2)} title={g.gym.name} sub={g.gym.branch || undefined}
                right={<Pill text={ROLE_TH[g.role] || g.role} kind={g.role === 'owner' ? 'ok' : 'info'} />}
                onPress={() => router.push(`/gym/${g.gym.id}`)} />
            ))}
        <Btn kind="ghost" icon="plus" label="สร้างยิมใหม่" onPress={() => router.push('/gym/new')} />
      </Card>

      <Card>
        <H size={17}>เทรนเนอร์</H>
        <Txt muted size={13.5}>{traineeCount ? `ลูกเทรน ${traineeCount} คน · นัดวันนี้ ${todayCount} นัด` : 'เป็นเทรนเนอร์ฟรีแลนซ์หรือเทรนเนอร์ของยิม จัดการลูกเทรน นัด และแพ็กเกจ PT ได้ที่นี่'}</Txt>
        <Btn kind={traineeCount ? 'primary' : 'ghost'} label="เปิดหน้าเทรนเนอร์" onPress={() => router.push('/trainer' as any)} />
      </Card>

      {profile?.is_super_admin ? (
        <Card>
          <H size={17}>Super Admin</H>
          <Txt muted size={13.5}>หลังบ้าน: ผู้ใช้ แผน ระงับ/ลบบัญชี ยิมทั้งหมด และบันทึกการแก้ไข</Txt>
          <Btn label="เปิดหลังบ้าน" onPress={() => router.push('/admin' as any)} />
        </Card>
      ) : null}
    </Screen>
  );
}
