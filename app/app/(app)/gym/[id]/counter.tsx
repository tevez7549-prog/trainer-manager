import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/lib/auth';
import { baht, isDesk, PAY_TH, thTime, todayRange, useGym } from '../../../../src/lib/gym';
import { enqueue, flush, loadMembers, searchMembers, takeFailed, useQueue, type Member, type QueuedCheckin, type QueuedWalkin } from '../../../../src/lib/counter';
import { Btn, Card, Chips, Cols, ConfirmBtn, Field, H, Header, Notice, Pill, Screen, Stat, Txt } from '../../../../src/ui';
import { expiryText, MemberRow } from '../../../../src/ui/MemberRow';
import { C, F, R } from '../../../../src/lib/theme';
import { Icon } from '../../../../src/ui/Icon';
import { GymFrame } from '../../../../src/ui/GymFrame';

type LogCheckin = { id: string; member_id: string; kind: string; checked_at: string; member: { name: string; code: string } | null };
type LogWalkin = { id: string; at: string; price: number; pay_method: string; note: string | null };
type Pay = 'cash' | 'transfer' | 'qr';
const PAYS: { v: Pay; t: string }[] = [{ v: 'cash', t: 'เงินสด' }, { v: 'transfer', t: 'โอน' }, { v: 'qr', t: 'QR' }];

export default function Counter() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { gym, role } = useGym(id);
  const { pending, online } = useQueue(id);

  const [members, setMembers] = useState<Member[]>([]);
  const [cacheInfo, setCacheInfo] = useState<{ at: string; offline: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<LogCheckin[]>([]);
  const [walkins, setWalkins] = useState<LogWalkin[]>([]);
  const [toast, setToast] = useState<{ t: string; ok: boolean } | null>(null);
  const [again, setAgain] = useState<string | null>(null);   // member waiting for a second tap (already checked in today)
  const [walk, setWalk] = useState<{ price: string; pay: Pay; note: string } | null>(null);
  const searchRef = useRef<TextInput>(null);

  const loadLog = useCallback(async () => {
    const { from, to } = todayRange();
    const [c, w] = await Promise.all([
      supabase.from('checkins').select('id,member_id,kind,checked_at,member:members(name,code)').eq('gym_id', id).gte('checked_at', from).lt('checked_at', to).order('checked_at', { ascending: false }),
      supabase.from('walkins').select('id,at,price,pay_method,note').eq('gym_id', id).gte('at', from).lt('at', to).order('at', { ascending: false }),
    ]);
    if (!c.error) setCheckins(((c.data as any) ?? []) as LogCheckin[]);
    if (!w.error) setWalkins((w.data as LogWalkin[]) ?? []);
  }, [id]);

  const loadAll = useCallback(async () => {
    const r = await loadMembers(id);
    setMembers(r.rows); setCacheInfo({ at: r.at, offline: r.offline });
    loadLog();
  }, [id, loadLog]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // when queued items have gone through, refresh today's list
  const pendingCount = pending.length;
  const prev = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount < prev.current) loadLog();
    prev.current = pendingCount;
    const f = takeFailed();
    if (f.length) setToast({ t: `ส่งไม่สำเร็จ ${f.length} รายการ: ${thError(f[0].msg)}`, ok: false });
  }, [pendingCount, loadLog]);

  useEffect(() => { if (!toast?.ok) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const results = useMemo(() => searchMembers(members, q), [members, q]);
  const selected = members.find(m => m.id === sel) ?? null;

  const pendingCheckins = pending.filter((p): p is QueuedCheckin => p.type === 'checkin');
  const pendingWalkins = pending.filter((p): p is QueuedWalkin => p.type === 'walkin');
  const lastToday = (mid: string) => {
    const p = pendingCheckins.find(x => x.member_id === mid);
    if (p) return p.at;
    return checkins.find(x => x.member_id === mid)?.checked_at ?? null;
  };

  async function checkIn(m: Member) {
    const last = lastToday(m.id);
    if (last && again !== m.id) { setAgain(m.id); return; }
    setAgain(null);
    await enqueue({ type: 'checkin', gym_id: id, member_id: m.id, member_name: m.name, kind: m.status === 'pt_only' ? 'pt' : 'member', by: profile!.id });
    setToast({ t: `✓ เช็กอิน ${m.name} ${thTime(new Date().toISOString())}${online ? '' : ' · ออฟไลน์ จะส่งเมื่อมีเน็ต'}`, ok: true });
    setSel(null); setQ('');
    searchRef.current?.focus();
  }

  async function saveWalkin() {
    if (!walk) return;
    const price = Number(walk.price);
    if (walk.price === '' || Number.isNaN(price) || price < 0) { setToast({ t: 'ราคาต้องเป็นตัวเลข', ok: false }); return; }
    await enqueue({ type: 'walkin', gym_id: id, price, pay_method: walk.pay, note: walk.note.trim() || null, by: profile!.id });
    setToast({ t: `✓ บันทึกขาจร ${baht(price)} (${PAY_TH[walk.pay]})`, ok: true });
    setWalk(null);
  }

  async function undo(table: 'checkins' | 'walkins', rowId: string) {
    const { error } = await supabase.from(table).delete().eq('id', rowId);
    if (error) setToast({ t: thError(error), ok: false }); else loadLog();
  }

  const openWalk = (note = '') => setWalk({ price: String(gym?.walkin_price ?? 0), pay: 'cash', note });
  const canCheckIn = (m: Member) => m.status === 'active' || m.status === 'expiring' || m.status === 'pt_only';

  const walkSum = walkins.reduce((a, w) => a + Number(w.price), 0) + pendingWalkins.reduce((a, w) => a + w.price, 0);

  if (gym && !isDesk(role)) return (
    <GymFrame id={id} gym={gym} role={role} active="counter"><Header title="เคาน์เตอร์" /><Notice text="หน้าเคาน์เตอร์สำหรับเจ้าของ ผู้จัดการ และพนักงานเคาน์เตอร์" /></GymFrame>
  );

  return (
    <GymFrame id={id} gym={gym} role={role} active="counter">
      <Header title="เช็กอิน" sub={gym?.name}
        right={<Pill text={online ? 'ออนไลน์' : 'ออฟไลน์'} kind={online ? 'ok' : 'warn'} />} />

      {!online || cacheInfo?.offline ? (
        <Notice kind="offline" text={`ไม่มีอินเทอร์เน็ต · ยังเช็กอินและบันทึกขาจรได้ ระบบจะส่งให้เองเมื่อเน็ตกลับมา${cacheInfo?.at ? ` (รายชื่อสมาชิกล่าสุด ${thTime(cacheInfo.at)})` : ''}`} />
      ) : null}
      {pending.length > 0 && online ? <Notice kind="offline" text={`รอส่ง ${pending.length} รายการ`} /> : null}
      {toast ? <Notice text={toast.t} kind={toast.ok ? 'ok' : 'bad'} /> : null}

      <Cols
        left={<>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: R.field, borderWidth: 2, borderColor: C.accent, backgroundColor: C.surface, paddingHorizontal: 14 }}>
              <Icon name="search" size={22} color={C.accent} />
              <TextInput ref={searchRef} value={q} onChangeText={t => { setQ(t); setSel(null); setAgain(null); }} autoFocus
                placeholder="ค้นหา ชื่อ / เบอร์ / รหัสสมาชิก" placeholderTextColor={C.muted} accessibilityLabel="ค้นหาสมาชิก"
                onSubmitEditing={() => { if (results.length === 1) setSel(results[0].id); }} returnKeyType="search"
                style={{ flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 18, fontFamily: F.body, color: C.fg, outlineStyle: 'none' } as any} />
            </View>
    
            {q.trim() && !results.length ? <Txt muted>ไม่พบ "{q.trim()}" · เพิ่มเป็นสมาชิกใหม่ หรือบันทึกเป็นขาจร</Txt> : null}
    
            {selected ? (
              <View style={{ gap: 10 }}>
                <MemberRow m={selected} />
                {selected.note ? <Txt muted size={13}>หมายเหตุ: {selected.note}</Txt> : null}
                {canCheckIn(selected) ? <>
                  {again === selected.id ? <Notice kind="info" text={`${selected.name} เช็กอินแล้ววันนี้ ${thTime(lastToday(selected.id)!)} · กดอีกครั้งถ้าจะเช็กอินซ้ำ`} /> : null}
                  <Btn label={again === selected.id ? 'เช็กอินซ้ำ' : selected.status === 'pt_only' ? 'เช็กอิน (มาเทรน PT)' : 'เช็กอิน'} onPress={() => checkIn(selected)} style={{ minHeight: 56 }} />
                </> : <>
                  <Notice text={selected.status === 'frozen' ? `พักสมาชิกอยู่ · ${expiryText(selected)}` : selected.status === 'none' ? 'ยังไม่มีแพ็กเกจสมาชิก' : `สมาชิกหมดอายุแล้ว · ${expiryText(selected)}`} />
                  <Btn label="ต่ออายุ / ขายแพ็กเกจ" onPress={() => router.push(`/gym/${id}/member/${selected.id}?sell=1` as any)} />
                  <Btn kind="ghost" label="คิดเป็นขาจรวันนี้" onPress={() => openWalk(`สมาชิก ${selected.name} (${selected.code})`)} />
                </>}
                <Btn kind="ghost" label="ดูข้อมูลสมาชิก" onPress={() => router.push(`/gym/${id}/member/${selected.id}` as any)} />
              </View>
            ) : results.map(m => <MemberRow key={m.id} m={m} onPress={() => { setSel(m.id); setAgain(null); }} />)}
          </Card>
          {walk ? (
            <Card>
              <H size={17}>บันทึกขาจร</H>
              <Field label="ราคา (บาท)" value={walk.price} onChangeText={v => setWalk({ ...walk, price: v.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" />
              <Chips label="ชำระโดย" options={PAYS} value={walk.pay} onChange={v => setWalk({ ...walk, pay: v })} />
              <Field label="หมายเหตุ (ไม่บังคับ)" value={walk.note} onChangeText={v => setWalk({ ...walk, note: v })} placeholder="เช่น ลูกเทรนของเทรนเนอร์ภายนอก" />
              <Btn label="บันทึกขาจร" onPress={saveWalkin} />
              <Btn kind="ghost" label="ยกเลิก" onPress={() => setWalk(null)} />
            </Card>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn kind="ghost" icon="wallet" label="ขาจร" onPress={() => openWalk()} style={{ flex: 1 }} />
              <Btn kind="ghost" icon="user-plus" label="สมาชิกใหม่" onPress={() => router.push(`/gym/${id}/member/new` as any)} style={{ flex: 1 }} />
            </View>
          )}
        </>}
        right={<>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat n={checkins.length + pendingCheckins.length} t="เช็กอินวันนี้" />
            <Stat n={walkins.length + pendingWalkins.length} t={`ขาจร · ${baht(walkSum)}`} />
          </View>
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <H size={17} style={{ flex: 1 }}>วันนี้</H>
              <Btn kind="ghost" label="รีเฟรช" onPress={() => { flush(); loadAll(); }} style={{ minHeight: 36 }} />
            </View>
            {pendingCheckins.map(p => <LogLine key={p.ref} time={p.at} text={`เช็กอิน · ${p.member_name}`} tag="รอส่ง" />)}
            {pendingWalkins.map(p => <LogLine key={p.ref} time={p.at} text={`ขาจร ${baht(p.price)} · ${PAY_TH[p.pay_method]}${p.note ? ' · ' + p.note : ''}`} tag="รอส่ง" />)}
            {[...checkins.map(c => ({ k: 'c' as const, at: c.checked_at, c })), ...walkins.map(w => ({ k: 'w' as const, at: w.at, w }))]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map(x => x.k === 'c'
                ? <LogLine key={x.c.id} time={x.at} text={`เช็กอิน · ${x.c.member?.name ?? ''}${x.c.kind === 'pt' ? ' (PT)' : ''}`} onUndo={() => undo('checkins', x.c.id)} />
                : <LogLine key={x.w.id} time={x.at} text={`ขาจร ${baht(x.w.price)} · ${PAY_TH[x.w.pay_method]}${x.w.note ? ' · ' + x.w.note : ''}`} onUndo={() => undo('walkins', x.w.id)} />)}
            {!checkins.length && !walkins.length && !pending.length ? <Txt muted>ยังไม่มีรายการวันนี้</Txt> : null}
          </Card>
        </>}
      />
    </GymFrame>
  );
}

function LogLine({ time, text, tag, onUndo }: { time: string; text: string; tag?: string; onUndo?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Txt muted size={13} style={{ width: 44 }}>{thTime(time)}</Txt>
        <Txt size={14} style={{ flex: 1 }}>{text}</Txt>
        {tag ? <Pill text={tag} kind="caution" /> : null}
        {onUndo ? <Txt size={13} accessibilityRole="button" accessibilityLabel="ตัวเลือกรายการนี้" style={{ color: C.muted, padding: 6 }} onPress={() => setOpen(!open)}>{open ? 'ปิด' : '⋯'}</Txt> : null}
      </View>
      {open && onUndo ? <ConfirmBtn label="ยกเลิกรายการนี้" onConfirm={onUndo} /> : null}
    </View>
  );
}
