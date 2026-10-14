import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/auth';
import { thDate, todayISO } from '../../../src/lib/gym';
import { MEMBER_TABS } from '../../../src/lib/nav';
import { uuid } from '../../../src/lib/store';
import { ANGLE_TH, fmt1, type Body, type Photo } from '../../../src/lib/me';
import { Btn, Card, Chips, ConfirmBtn, DateField, Field, H, Header, Label, Notice, Screen, Toggle, Txt } from '../../../src/ui';
import { MiniChart } from '../../../src/ui/Macro';
import { TabBar } from '../../../src/ui/TabBar';
import { InBodyCard } from '../../../src/ui/InBodyCard';
import { C, R } from '../../../src/lib/theme';

type Key = 'weight_kg' | 'waist_cm' | 'hip_cm' | 'arm_cm' | 'thigh_cm';
const KEYS: { k: Key; t: string; unit: string }[] = [
  { k: 'weight_kg', t: 'น้ำหนัก', unit: 'kg' }, { k: 'waist_cm', t: 'เอว', unit: 'cm' }, { k: 'hip_cm', t: 'สะโพก', unit: 'cm' },
  { k: 'arm_cm', t: 'ต้นแขน', unit: 'cm' }, { k: 'thigh_cm', t: 'ต้นขา', unit: 'cm' },
];

export default function BodyPage() {
  const { profile } = useAuth();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const [rows, setRows] = useState<Body[] | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [key, setKey] = useState<Key>('weight_kg');
  const [adding, setAdding] = useState(!!add);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [b, p] = await Promise.all([
      supabase.from('body_measurements').select('*').eq('user_id', profile.id).order('measured_on', { ascending: false }).limit(120),
      supabase.from('progress_photos').select('*').eq('user_id', profile.id).order('taken_on', { ascending: false }).limit(30),
    ]);
    setRows((b.data as Body[]) ?? []);
    const ps = (p.data as Photo[]) ?? [];
    if (ps.length) {
      const { data } = await supabase.storage.from('private').createSignedUrls(ps.map(x => x.storage_path), 3600);
      ps.forEach((x, i) => { x.url = data?.[i]?.signedUrl ?? undefined; });
    }
    setPhotos(ps);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const meta = KEYS.find(k => k.k === key)!;
  const series = (rows ?? []).filter(r => r[key] != null).slice(0, 12).reverse();
  const latest = (k: Key) => (rows ?? []).find(r => r[k] != null)?.[k] ?? null;
  const first = (k: Key) => { const r = (rows ?? []).filter(x => x[k] != null); return r.length > 1 ? r[r.length - 1][k] : null; };
  const done = (t: string, ok = true) => { setMsg({ t, ok }); load(); };

  async function del(r: Body) {
    const { error } = await supabase.from('body_measurements').delete().eq('id', r.id);
    if (error) done(thError(error), false); else done('ลบแล้ว');
  }

  return (
    <Screen footer={<TabBar tabs={MEMBER_TABS} active="me" />}>
      <Header title="ร่างกาย" back={() => router.replace('/me?from=member' as any)} />
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {adding ? <AddBody last={rows?.[0] ?? null} onDone={(t) => { setAdding(false); if (t) done(t); }} />
        : <Btn icon="plus" label="บันทึกวันนี้" onPress={() => setAdding(true)} />}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {KEYS.map(k => {
          const v = latest(k.k), f = first(k.k);
          const diff = v != null && f != null ? Number(v) - Number(f) : null;
          return (
            <Pressable key={k.k} accessibilityRole="button" accessibilityState={{ selected: key === k.k }} onPress={() => setKey(k.k)}
              style={{ flexGrow: 1, flexBasis: '30%', minWidth: 100, padding: 12, borderRadius: R.card, backgroundColor: C.surface, borderWidth: 1.5, borderColor: key === k.k ? C.accent : 'transparent', gap: 2 }}>
              <Txt muted size={13}>{k.t}</Txt>
              <H size={20}>{v != null ? `${fmt1(v)}` : '–'}<Txt muted size={12}> {k.unit}</Txt></H>
              {diff !== null ? <Txt size={12} bold style={{ color: diff <= 0 ? C.accent : C.warnFg }}>{diff > 0 ? '+' : ''}{fmt1(diff)} จากครั้งแรก</Txt> : null}
            </Pressable>
          );
        })}
      </View>

      <Card>
        <H size={17}>{meta.t} ({meta.unit})</H>
        {rows === null ? <Txt muted>กำลังโหลด…</Txt> : <MiniChart points={series.map(r => ({ label: thDate(r.measured_on), v: Number(r[key]) }))} unit={meta.unit} />}
      </Card>

      <InBodyCard onSaved={load} />

      <Label>รูปความคืบหน้า</Label>
      <PhotoBox photos={photos} onDone={(t, ok) => done(t, ok)} />

      <Label>ประวัติ</Label>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {rows && !rows.length ? <Txt muted style={{ paddingVertical: 14 }}>ยังไม่มีบันทึก</Txt> : null}
        {(rows ?? []).slice(0, 30).map(r => <HistRow key={r.id} r={r} mine={r.created_by === profile?.id || !r.created_by} onDelete={() => del(r)} />)}
      </Card>
    </Screen>
  );
}

function HistRow({ r, mine, onDelete }: { r: Body; mine: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const parts = KEYS.filter(k => r[k.k] != null).map(k => `${k.t} ${fmt1(r[k.k])}`);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 10, gap: 6 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}>
        <Txt bold>{thDate(r.measured_on)}{!mine ? ' · เทรนเนอร์บันทึก' : ''}</Txt>
        <Txt muted size={14}>{parts.join(' · ')}</Txt>
      </Pressable>
      {open ? <ConfirmBtn label="ลบรายการนี้" onConfirm={onDelete} /> : null}
    </View>
  );
}

function AddBody({ last, onDone }: { last: Body | null; onDone: (msg?: string) => void }) {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [v, setV] = useState<Record<Key, string>>({ weight_kg: '', waist_cm: '', hip_cm: '', arm_cm: '', thigh_cm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const row: Record<string, unknown> = { user_id: profile!.id, measured_on: date, created_by: profile!.id };
    let any = false;
    for (const k of KEYS) { const n = Number(v[k.k]); if (v[k.k] !== '') { if (!(n > 0)) { setErr(`${k.t} ต้องเป็นตัวเลข`); return; } row[k.k] = n; any = true; } }
    if (!any) { setErr('ใส่อย่างน้อย 1 ช่อง'); return; }
    setBusy(true);
    const { error } = await supabase.from('body_measurements').insert(row);
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    onDone(v.weight_kg ? `บันทึกน้ำหนัก ${v.weight_kg} kg แล้ว` : 'บันทึกแล้ว');
  }
  return (
    <Card>
      <H size={17}>บันทึกร่างกาย</H>
      {err ? <Notice text={err} /> : null}
      <DateField label="วันที่" value={date} onChange={setDate} max={todayISO()} />
      <Field label="น้ำหนัก (kg)" value={v.weight_kg} onChangeText={t => setV({ ...v, weight_kg: t.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad"
        placeholder={last?.weight_kg ? `ครั้งก่อน ${fmt1(last.weight_kg)}` : 'เช่น 68.5'} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KEYS.slice(1).map(k => (
          <View key={k.k} style={{ flexGrow: 1, flexBasis: '45%' }}>
            <Field label={`${k.t} (cm)`} value={v[k.k]} onChangeText={t => setV({ ...v, [k.k]: t.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad"
              placeholder={last?.[k.k] ? `${fmt1(last[k.k])}` : 'ไม่บังคับ'} />
          </View>
        ))}
      </View>
      <Btn label="บันทึก" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={() => onDone()} />
    </Card>
  );
}

/** Progress photos: private to you (and your trainer). Front / side / back, then compare first vs latest. */
function PhotoBox({ photos, onDone }: { photos: Photo[]; onDone: (msg: string, ok: boolean) => void }) {
  const { profile } = useAuth();
  const [angle, setAngle] = useState<Photo['angle']>('front');
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<boolean | null>(null);
  useEffect(() => {
    if (profile) supabase.from('profiles').select('share_photos').eq('id', profile.id).single().then(({ data }) => setShare((data as any)?.share_photos ?? true));
  }, [profile]);
  async function toggleShare(v: boolean) {
    setShare(v);
    const { error } = await supabase.from('profiles').update({ share_photos: v }).eq('id', profile!.id);
    if (error) { setShare(!v); onDone(thError(error), false); }
  }

  function pick() {
    if (Platform.OS !== 'web') { onDone('อัปโหลดรูปได้บนเว็บก่อน แอปมือถือกำลังทำ', false); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { onDone('รูปใหญ่เกิน 8 MB', false); return; }
      setBusy(true);
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${profile!.id}/${uuid()}.${ext}`;
      const up = await supabase.storage.from('private').upload(path, f, { contentType: f.type || 'image/jpeg' });
      if (up.error) { setBusy(false); onDone(thError(up.error), false); return; }
      const { error } = await supabase.from('progress_photos').insert({ user_id: profile!.id, angle, storage_path: path });
      setBusy(false);
      onDone(error ? thError(error) : `เพิ่มรูป${ANGLE_TH[angle]}แล้ว`, !error);
    };
    input.click();
  }

  const same = photos.filter(p => p.angle === angle);
  const pair = same.length > 1 ? [same[same.length - 1], same[0]] : same.slice(0, 1);
  return (
    <Card>
      <Chips options={(['front', 'side', 'back'] as const).map(a => ({ v: a, t: ANGLE_TH[a] }))} value={angle} onChange={setAngle} />
      {pair.length ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {pair.map((p, i) => (
            <View key={p.id} style={{ flex: 1, gap: 4 }}>
              {p.url ? <Image source={{ uri: p.url }} accessibilityLabel={`รูป${ANGLE_TH[p.angle]} ${thDate(p.taken_on)}`} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: R.field, backgroundColor: C.surface2 }} resizeMode="cover" />
                : <View style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: R.field, backgroundColor: C.surface2 }} />}
              <Txt muted size={12.5} style={{ textAlign: 'center' }}>{pair.length > 1 ? (i === 0 ? 'ครั้งแรก · ' : 'ล่าสุด · ') : ''}{thDate(p.taken_on)}</Txt>
            </View>
          ))}
        </View>
      ) : <Txt muted size={14}>ยังไม่มีรูป{ANGLE_TH[angle]} · ถ่ายมุมเดิม แสงเดิม ทุก 2–4 สัปดาห์ จะเห็นความต่างชัด</Txt>}
      <Btn kind="ghost" icon="camera" label={`เพิ่มรูป${ANGLE_TH[angle]}`} onPress={pick} loading={busy} />
      {share === null ? null : <Toggle label="ให้เทรนเนอร์ดูรูปได้" value={share} onChange={toggleShare}
        hint={share ? 'เทรนเนอร์ที่ดูแลคุณเห็นรูปเหล่านี้ · ปิดได้ทุกเมื่อ' : 'รูปเห็นเฉพาะคุณคนเดียว · เทรนเนอร์ยังเห็นน้ำหนักและสัดส่วนตามปกติ'} />}
    </Card>
  );
}
