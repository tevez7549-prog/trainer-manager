import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { ROLE_TH, thDateTs, thTime } from '../../../src/lib/gym';
import { prettyPhone } from '../../../src/lib/phone';
import { ACT_TH, daysTo, KINDS, liveSubs, USER_COLS, type AdminUser } from '../../../src/lib/admin';
import { Btn, Card, Chips, Field, H, Header, Notice, Pill, Row, Screen, Stat, Txt, useWide } from '../../../src/ui';
import { C } from '../../../src/lib/theme';

type Tab = 'users' | 'gyms' | 'log';
type Filter = 'all' | 'trial' | 'trainer' | 'gym' | 'susp' | 'admin';
type GymRow = { id: string; name: string; branch: string | null; created_at: string; members: { count: number }[]; gym_staff: { role: string; active: boolean; profile: { display_name: string; uid: number } | null }[] };
type Log = { id: number; at: string; action: string; target_id: string | null; detail: any; actor: { display_name: string } | null; gym: { name: string } | null };

const FILTERS: { v: Filter; t: string; f: (u: AdminUser) => boolean }[] = [
  { v: 'all', t: 'ทั้งหมด', f: () => true },
  { v: 'trial', t: 'ทดลองอยู่', f: u => u.subscriptions.some(s => s.status === 'trial') },
  { v: 'trainer', t: 'เทรนเนอร์', f: u => liveSubs(u).some(s => s.kind === 'trainer') || u.gym_staff.some(s => s.active && s.role === 'trainer') },
  { v: 'gym', t: 'ยิม', f: u => liveSubs(u).some(s => s.kind === 'gym') || u.gym_staff.some(s => s.active && s.role !== 'trainer') },
  { v: 'susp', t: 'ระงับ', f: u => u.status === 'suspended' },
  { v: 'admin', t: 'Super Admin', f: u => u.is_super_admin },
];

function planText(u: AdminUser): { t: string; k: 'ok' | 'warn' | 'bad' | 'info' | 'mute' }[] {
  const subs = liveSubs(u);
  if (!subs.length) return [{ t: 'ฟรี', k: 'mute' }];
  return subs.map(s => {
    const lb = KINDS.find(k => k.k === s.kind)!.t.replace(/ \(.+\)/, '');
    if (s.status === 'active') return { t: `${lb} · จ่ายแล้ว`, k: 'ok' };
    const d = s.trial_ends_at ? daysTo(s.trial_ends_at) : null;
    return { t: `${lb} · ${d == null ? 'ทดลอง' : d < 0 ? 'ทดลองหมด' : `ทดลอง ${d} วัน`}`, k: d != null && d < 0 ? 'bad' : d != null && d <= 2 ? 'warn' : 'info' };
  });
}
const staffText = (u: AdminUser) => u.gym_staff.filter(s => s.active).map(s => `${s.gyms?.name ?? '?'} · ${ROLE_TH[s.role] ?? s.role}`).join(', ');

export default function Admin() {
  const { profile } = useAuth();
  const wide = useWide();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [gyms, setGyms] = useState<GymRow[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [u, g, l] = await Promise.all([
      supabase.from('profiles').select(USER_COLS).order('uid', { ascending: false }),
      supabase.from('gyms').select('id,name,branch,created_at,members(count),gym_staff(role,active,profile:profiles(display_name,uid))').order('created_at', { ascending: false }),
      supabase.from('audit_log').select('id,at,action,target_id,detail,actor:profiles(display_name),gym:gyms(name)').order('at', { ascending: false }).limit(60),
    ]);
    if (u.error) { setErr('โหลดรายชื่อไม่สำเร็จ: ' + u.error.message); return; }
    setUsers((u.data as any) ?? []); setGyms((g.data as any) ?? []); setLog((l.data as any) ?? []);
  }, []);
  useFocusEffect(useCallback(() => { if (profile?.is_super_admin) load(); }, [load, profile]));

  const rows = useMemo(() => {
    const fl = FILTERS.find(f => f.v === filter)!;
    const k = q.trim().toLowerCase(), d = k.replace(/\D/g, '');
    return (users ?? []).filter(u => fl.f(u) && (!k || (u.display_name || '').toLowerCase().includes(k) || String(u.uid).includes(k)
      || (u.email || '').toLowerCase().includes(k) || (d.length >= 3 && (u.phone || '').replace(/\D/g, '').includes(d.replace(/^0/, '')))
      || u.gym_staff.some(s => (s.gyms?.name || '').toLowerCase().includes(k))));
  }, [users, q, filter]);

  if (!profile?.is_super_admin) return (
    <Screen><Header title="Super Admin" back={() => router.replace('/')} /><Notice text="หน้านี้สำหรับ Super Admin เท่านั้น" /></Screen>
  );

  const all = users ?? [];
  const soon = all.filter(u => u.subscriptions.some(s => s.status === 'trial' && s.trial_ends_at && daysTo(s.trial_ends_at) <= 2)).length;
  const nameOf = (id: string | null) => { const u = all.find(x => x.id === id); return u ? u.display_name || u.email || '' : ''; };

  return (
    <Screen wide>
      <Header title="Super Admin" sub="หลังบ้าน · จัดการผู้ใช้และยิมทั้งระบบ" back={() => router.replace('/')}
        right={<Btn icon="user-plus" label="เพิ่มผู้ใช้" onPress={() => router.push('/admin/user/new' as any)} style={{ minHeight: 40 }} />} />
      {err ? <Notice text={err} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat n={all.length} t="ผู้ใช้ทั้งหมด" />
        <Stat n={all.filter(FILTERS[1].f).length} t={`กำลังทดลอง${soon ? ` · ใกล้หมด ${soon}` : ''}`} kind={soon ? 'warn' : undefined} />
        <Stat n={gyms.length} t="ยิม" />
        <Stat n={all.filter(u => u.status === 'suspended').length} t="ถูกระงับ" />
      </View>

      <Chips options={[{ v: 'users', t: 'ผู้ใช้' }, { v: 'gyms', t: 'ยิม' }, { v: 'log', t: 'บันทึกการแก้ไข' }]} value={tab} onChange={setTab} />

      {tab === 'users' ? <>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, alignItems: wide ? 'flex-end' : 'stretch' }}>
          <View style={{ flex: wide ? 1 : undefined }}><Field label="ค้นหา" value={q} onChangeText={setQ} placeholder="ชื่อ UID เบอร์ อีเมล ยิม" /></View>
          <Btn kind="ghost" label="รีเฟรช" onPress={load} />
        </View>
        <Chips options={FILTERS.map(f => ({ v: f.v, t: `${f.t} ${all.filter(f.f).length}` }))} value={filter} onChange={setFilter} />
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {users === null ? <Txt muted style={{ padding: 12 }}>กำลังโหลด…</Txt> : null}
          {wide ? (
            <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
              {['UID', 'ชื่อ', 'เบอร์โทร', 'อีเมล', 'ยิม · บทบาท', 'แผน', 'สมัคร'].map((h, i) => <Txt key={h} bold size={12.5} muted style={{ flex: COLW[i] }}>{h}</Txt>)}
            </View>
          ) : null}
          {rows.map(u => wide ? (
            <Pressable key={u.id} accessibilityRole="button" onPress={() => router.push(`/admin/user/${u.id}` as any)}
              style={({ hovered, pressed }: any) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line,
                backgroundColor: hovered || pressed ? C.surface2 : u.status === 'suspended' ? C.badBg : 'transparent' })}>
              <Txt size={13.5} style={{ flex: COLW[0] }}>{u.uid}</Txt>
              <View style={{ flex: COLW[1], flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Txt bold size={14}>{u.display_name || '(ไม่มีชื่อ)'}</Txt>
                {u.id === profile.id ? <Pill text="คุณ" kind="mute" /> : null}
                {u.is_super_admin ? <Pill text="Super Admin" kind="info" /> : null}
                {u.status === 'suspended' ? <Pill text="ระงับ" kind="bad" /> : null}
              </View>
              <Txt size={13.5} style={{ flex: COLW[2] }}>{prettyPhone(u.phone) || '–'}</Txt>
              <Txt size={13} muted style={{ flex: COLW[3] }} numberOfLines={1}>{u.email || '–'}</Txt>
              <Txt size={13} style={{ flex: COLW[4] }} numberOfLines={2}>{staffText(u) || '–'}</Txt>
              <View style={{ flex: COLW[5], gap: 3, alignItems: 'flex-start' }}>{planText(u).map((p, i) => <Pill key={i} text={p.t} kind={p.k} />)}</View>
              <Txt size={13} muted style={{ flex: COLW[6] }}>{thDateTs(u.created_at)}</Txt>
            </Pressable>
          ) : (
            <Row key={u.id} icon={(u.display_name || '?').slice(0, 2)} title={`${u.display_name || '(ไม่มีชื่อ)'}${u.status === 'suspended' ? ' · ระงับ' : ''}`}
              sub={[`UID ${u.uid}`, prettyPhone(u.phone), u.email].filter(Boolean).join(' · ')}
              right={<Pill text={planText(u)[0].t} kind={planText(u)[0].k} />} onPress={() => router.push(`/admin/user/${u.id}` as any)} />
          ))}
          {users && !rows.length ? <Txt muted style={{ padding: 12 }}>ไม่พบผู้ใช้</Txt> : null}
        </Card>
      </> : null}

      {tab === 'gyms' ? (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <Txt muted size={12.5} style={{ paddingVertical: 6 }}>กดยิมเพื่อเข้าไปดู · ลบยิมได้ที่เมนู ตั้งค่ายิม</Txt>
          {!gyms.length ? <Txt muted style={{ padding: 12 }}>ยังไม่มียิม</Txt> : null}
          {gyms.map(g => {
            const owner = g.gym_staff.find(s => s.role === 'owner')?.profile;
            const staff = g.gym_staff.filter(s => s.active).length;
            return (
              <Row key={g.id} icon={g.name.slice(0, 2)} title={`${g.name}${g.branch ? ' · ' + g.branch : ''}`}
                sub={`เจ้าของ ${owner ? `${owner.display_name} (UID ${owner.uid})` : '–'} · ทีม ${staff} คน · สร้าง ${thDateTs(g.created_at)}`}
                right={<Pill text={`สมาชิก ${g.members?.[0]?.count ?? 0}`} kind="info" />} />
            );
          })}
        </Card>
      ) : null}

      {tab === 'log' ? (
        <Card style={{ gap: 6 }}>
          {!log.length ? <Txt muted>ยังไม่มีบันทึก</Txt> : null}
          {log.map(l => (
            <View key={l.id} style={{ flexDirection: 'row', gap: 10, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 6 }}>
              <Txt muted size={12.5} style={{ width: 110 }}>{thDateTs(l.at)} {thTime(l.at)}</Txt>
              <Txt size={13.5} style={{ flex: 1 }}>
                {l.actor?.display_name ?? 'ระบบ'} · {ACT_TH[l.action] ?? l.action}
                {nameOf(l.target_id) ? ` · ${nameOf(l.target_id)}` : l.detail?.display_name || l.detail?.email ? ` · ${l.detail.display_name || l.detail.email}` : ''}
                {l.gym ? ` · ${l.gym.name}` : ''}
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const COLW = [0.7, 2, 1.3, 1.8, 2, 1.6, 1];
