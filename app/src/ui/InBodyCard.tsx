import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { supabase, thError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { isoDate, thDate } from '../lib/gym';
import { fmt1 } from '../lib/me';
import { parseInBody, type InBody, type Seg } from '../lib/inbody';
import { readQrFromFile } from '../lib/qr';
import { C, R } from '../lib/theme';
import { Btn, Card, ConfirmBtn, DateField, Field, H, Notice, Txt } from './index';
import { Icon } from './Icon';
import { InBodyTrend } from './InBodyTrend';

/** Saved InBody result (body_scans row) */
type Scan = Omit<InBody, 'age' | 'sex' | 'raw'> & { id: string; created_by: string | null };
const COLS = 'id,measured_at,model,height_cm,weight_kg,smm_kg,fat_kg,pbf,bmi,score,tbw_l,protein_kg,mineral_kg,ffm_kg,bmr,whr,visceral,target_weight,weight_ctrl,fat_ctrl,muscle_ctrl,seg_lean,seg_fat,created_by';

/**
 * InBody on the body page: scan the QR on the printout, check the numbers, save. Then the latest result,
 * the change from the one before, and a chart across all scans.
 */
export function InBodyCard({ onSaved }: { onSaved?: () => void }) {
  const { profile } = useAuth();
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [found, setFound] = useState<InBody | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [manual, setManual] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('body_scans').select(COLS).eq('user_id', profile.id).order('measured_at', { ascending: false }).limit(60);
    setScans(((data as any) ?? []) as Scan[]);
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  function pick() {
    if (Platform.OS !== 'web') { setMsg({ t: 'สแกน InBody ใช้ได้บนเว็บก่อน', ok: false }); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setMsg(null); setFound(null); setBusy(true);
      try {
        const text = await readQrFromFile(f);
        if (!text) { setMsg({ t: 'หา QR ในรูปไม่เจอ · ถ่ายใกล้ ๆ ให้ QR อยู่กลางภาพ ชัด ไม่เอียง ไม่มีเงาบัง', ok: false }); return; }
        const r = parseInBody(text);
        if (!r.ok) {
          setMsg({ t: r.why === 'not-inbody' ? 'QR นี้ไม่ใช่ผลจากเครื่อง InBody' : 'อ่าน QR ได้ แต่ยังไม่รู้จักรูปแบบของเครื่องรุ่นนี้ · ตอนนี้รองรับ InBody270', ok: false });
          return;
        }
        setFound(r.v);
      } catch {
        setMsg({ t: 'อ่านรูปไม่ได้ ลองถ่ายใหม่อีกครั้ง', ok: false });
      } finally { setBusy(false); }
    };
    input.click();
  }

  async function save() {
    if (!found || !profile) return;
    setBusy(true);
    const { age: _a, sex: _s, ...v } = found;
    const { error } = await supabase.from('body_scans').insert({ ...v, user_id: profile.id, created_by: profile.id });
    if (error) {
      setBusy(false);
      setMsg({ t: error.code === '23505' ? 'ผลครั้งนี้บันทึกไว้แล้ว' : thError(error), ok: error.code === '23505' });
      if (error.code === '23505') setFound(null);
      return;
    }
    // the weight also goes into the body log for that day, unless something is already there
    const day = isoDate(new Date(found.measured_at));
    const { data: ex } = await supabase.from('body_measurements').select('id,weight_kg').eq('user_id', profile.id).eq('measured_on', day).limit(1);
    if (!ex?.length) await supabase.from('body_measurements').insert({ user_id: profile.id, measured_on: day, weight_kg: found.weight_kg, created_by: profile.id });
    else if (ex[0].weight_kg == null) await supabase.from('body_measurements').update({ weight_kg: found.weight_kg }).eq('id', ex[0].id);
    setBusy(false); setFound(null);
    setMsg({ t: `บันทึกผล InBody วันที่ ${thDate(day)} แล้ว`, ok: true });
    load(); onSaved?.();
  }

  async function del(s: Scan) {
    const { error } = await supabase.from('body_scans').delete().eq('id', s.id);
    setMsg(error ? { t: thError(error), ok: false } : { t: 'ลบผลนี้แล้ว', ok: true });
    load();
  }

  const latest = scans?.[0] ?? null, prev = scans?.[1] ?? null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="activity" size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <H size={17}>InBody</H>
          <Txt muted size={13}>สแกน QR บนใบผล ให้บันทึกค่าทั้งหมดอัตโนมัติ</Txt>
        </View>
      </View>
      {msg ? <Notice text={msg.t} kind={msg.ok ? 'ok' : 'bad'} /> : null}

      {found ? <Preview v={found} prev={latest} onSave={save} onCancel={() => setFound(null)} busy={busy} />
        : <>
          <Btn icon="camera" label="สแกน QR ใบ InBody" onPress={pick} loading={busy} />
          <Txt muted size={12.5}>ถ่ายรูป QR มุมขวาล่างของใบ หรือเลือกรูปที่ถ่ายไว้ · อ่านในเครื่องคุณ ไม่ส่งรูปไปไหน · เบอร์โทรที่ยิมใส่ไว้ใน QR จะไม่ถูกเก็บ</Txt>
        </>}

      {latest && !found ? <>
        <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 10 }}>
          <Txt bold size={14}>{`ล่าสุด · ${thDate(isoDate(new Date(latest.measured_at)))}${prev ? ` · เทียบกับ ${thDate(isoDate(new Date(prev.measured_at)))}` : ''}`}</Txt>
          <Tiles s={latest} prev={prev} />
        </View>
        {scans && scans.length > 1 ? <InBodyTrend scans={scans} />
          : <Txt muted size={12.5}>สแกนครั้งต่อไปแล้วจะเห็นกราฟเทียบกัน · หรือพิมพ์ผลครั้งก่อน ๆ จากตาราง "ประวัติการวัด" บนใบลงไปเองด้านล่าง</Txt>}
        <History scans={scans ?? []} onDelete={del} />
      </> : null}
      {!found ? (manual
        ? <ManualPast onCancel={() => setManual(false)} onSaved={(t) => { setMsg({ t, ok: true }); load(); onSaved?.(); }} onError={(t) => setMsg({ t, ok: false })} />
        : <Btn kind="ghost" icon="plus" label="เพิ่มผลเก่าเอง (จากตารางประวัติบนใบ)" onPress={() => { setManual(true); setMsg(null); }} />) : null}
    </Card>
  );
}

const MAIN: { k: keyof Scan; t: string; unit: string; goodDown?: boolean; d?: number }[] = [
  { k: 'weight_kg', t: 'น้ำหนัก', unit: 'kg', goodDown: true },
  { k: 'smm_kg', t: 'กล้ามเนื้อโครงร่าง', unit: 'kg', goodDown: false },
  { k: 'fat_kg', t: 'มวลไขมัน', unit: 'kg', goodDown: true },
  { k: 'pbf', t: '%ไขมัน', unit: '%', goodDown: true },
  { k: 'bmi', t: 'BMI', unit: '', goodDown: true },
  { k: 'score', t: 'คะแนน InBody', unit: '/100', goodDown: false, d: 0 },
  { k: 'visceral', t: 'ไขมันช่องท้อง', unit: 'ระดับ', goodDown: true, d: 0 },
  { k: 'bmr', t: 'BMR', unit: 'kcal', d: 0 },
];

function Tiles({ s, prev }: { s: Scan | InBody; prev: Scan | null }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {MAIN.map(m => {
        const v = (s as any)[m.k] as number | null;
        if (v == null) return null;
        const p = prev ? ((prev as any)[m.k] as number | null) : null;
        const diff = p != null ? Math.round((v - p) * 10) / 10 : null;
        const good = diff == null || diff === 0 || m.goodDown === undefined ? null : (diff < 0) === m.goodDown;
        return (
          <View key={String(m.k)} style={{ flexGrow: 1, flexBasis: 110, backgroundColor: C.surface2, borderRadius: R.field, padding: 10, gap: 2 }}>
            <Txt muted size={12.5} numberOfLines={1}>{m.t}</Txt>
            <Txt bold size={17}>{`${m.d === 0 ? Math.round(v).toLocaleString('en-US') : fmt1(v)} ${m.unit}`}</Txt>
            {diff != null && diff !== 0 ? <Txt size={12} bold style={{ color: good === null ? C.muted : good ? C.accent : C.warnFg }}>{`${diff > 0 ? '+' : ''}${m.d === 0 ? Math.round(diff) : fmt1(diff)} จากครั้งก่อน`}</Txt> : null}
          </View>
        );
      })}
    </View>
  );
}

const SEG_NAMES: [keyof Seg, string][] = [['ra', 'แขนขวา'], ['la', 'แขนซ้าย'], ['tr', 'ลำตัว'], ['rl', 'ขาขวา'], ['ll', 'ขาซ้าย']];

function Segments({ lean, fat }: { lean: Seg | null; fat: Seg | null }) {
  if (!lean && !fat) return null;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        <Txt muted size={12} style={{ flex: 1.2 }}>แยกส่วน</Txt>
        <Txt muted size={12} style={{ flex: 1, textAlign: 'right' }}>กล้ามเนื้อ</Txt>
        <Txt muted size={12} style={{ flex: 1, textAlign: 'right' }}>ไขมัน</Txt>
      </View>
      {SEG_NAMES.map(([k, t]) => (
        <View key={k} style={{ flexDirection: 'row' }}>
          <Txt size={13} style={{ flex: 1.2 }}>{t}</Txt>
          <Txt size={13} style={{ flex: 1, textAlign: 'right' }}>{lean ? `${lean[k][0]} kg` : '–'}</Txt>
          <Txt size={13} style={{ flex: 1, textAlign: 'right' }}>{fat ? `${fat[k][0]} kg` : '–'}</Txt>
        </View>
      ))}
    </View>
  );
}

function Preview({ v, prev, onSave, onCancel, busy }: { v: InBody; prev: Scan | null; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const when = new Date(v.measured_at);
  return (
    <View style={{ gap: 12, borderWidth: 1.5, borderColor: C.accent, borderRadius: R.field, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="circle-check" size={18} color={C.accent} />
        <Txt bold style={{ flex: 1 }}>{`อ่านได้ · InBody${v.model} · ${thDate(isoDate(when))} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`}</Txt>
      </View>
      <Txt muted size={13}>ตรวจตัวเลขให้ตรงกับใบก่อนบันทึก</Txt>
      <Tiles s={v} prev={prev} />
      <Segments lean={v.seg_lean} fat={v.seg_fat} />
      {v.target_weight ? <Txt size={13} muted>{`น้ำหนักเป้าหมายจากเครื่อง ${fmt1(v.target_weight)} kg · ควบคุมไขมัน ${fmt1(v.fat_ctrl ?? 0)} kg · กล้ามเนื้อ ${fmt1(v.muscle_ctrl ?? 0)} kg`}</Txt> : null}
      <Btn icon="check" label="บันทึกผลนี้" onPress={onSave} loading={busy} />
      <Btn kind="ghost" label="ยกเลิก" onPress={onCancel} />
    </View>
  );
}

function History({ scans, onDelete }: { scans: Scan[]; onDelete: (s: Scan) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!scans.length) return null;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
      <Txt bold size={14} style={{ paddingVertical: 4 }}>{`ประวัติ InBody (${scans.length})`}</Txt>
      {scans.map(s => (
        <View key={s.id} style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8, gap: 6 }}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(open === s.id ? null : s.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt bold size={14}>{`${thDate(isoDate(new Date(s.measured_at)))}${s.model === 'manual' ? ' · พิมพ์เอง' : ''}`}</Txt>
              <Txt muted size={13}>{`${fmt1(s.weight_kg)} kg · กล้ามเนื้อ ${fmt1(s.smm_kg)} · ไขมัน ${fmt1(s.pbf)}%${s.score ? ` · ${s.score} คะแนน` : ''}`}</Txt>
            </View>
            <Icon name={open === s.id ? 'chevron-down' : 'chevron-right'} size={18} color={C.muted} />
          </Pressable>
          {open === s.id ? <>
            <Segments lean={s.seg_lean} fat={s.seg_fat} />
            <ConfirmBtn label="ลบผลนี้" onConfirm={() => onDelete(s)} />
          </> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Older tests from the "history" table on the printout (date, weight, muscle, body-fat %), typed by hand,
 * so the chart starts with the whole history instead of only the scans made in the app.
 */
function ManualPast({ onSaved, onCancel, onError }: { onSaved: (msg: string) => void; onCancel: () => void; onError: (msg: string) => void }) {
  const { profile } = useAuth();
  const [day, setDay] = useState(isoDate(new Date()));
  const [time, setTime] = useState('07:00');
  const [w, setW] = useState(''); const [m, setM] = useState(''); const [f, setF] = useState('');
  const [busy, setBusy] = useState(false);
  const num = (v: string) => v.replace(/[^\d.]/g, '');
  async function save() {
    const wk = Number(w), mk = Number(m), fp = Number(f);
    if (!(wk > 20 && wk < 400)) { onError('ใส่น้ำหนัก (kg) ให้ถูกต้อง'); return; }
    if (m && !(mk > 5 && mk < 150)) { onError('มวลกล้ามเนื้อดูไม่ถูก (kg)'); return; }
    if (f && !(fp > 1 && fp < 80)) { onError('%ไขมันดูไม่ถูก'); return; }
    const [hh, mm] = (/^\d{1,2}:\d{2}$/.test(time) ? time : '07:00').split(':').map(Number);
    const at = new Date(`${day}T00:00:00`); at.setHours(hh, mm, 0, 0);
    setBusy(true);
    const { error } = await supabase.from('body_scans').insert({ user_id: profile!.id, created_by: profile!.id, measured_at: at.toISOString(), model: 'manual',
      weight_kg: wk, smm_kg: m ? mk : null, pbf: f ? fp : null, fat_kg: f ? Math.round(wk * fp) / 100 : null });
    if (!error) {
      const { data: ex } = await supabase.from('body_measurements').select('id').eq('user_id', profile!.id).eq('measured_on', day).limit(1);
      if (!ex?.length) await supabase.from('body_measurements').insert({ user_id: profile!.id, measured_on: day, weight_kg: wk, created_by: profile!.id });
    }
    setBusy(false);
    if (error) { onError(error.code === '23505' ? 'วันเวลานี้มีผลอยู่แล้ว' : thError(error)); return; }
    setW(''); setM(''); setF('');
    onSaved(`เพิ่มผลวันที่ ${thDate(day)} แล้ว · ใส่ครั้งต่อไปได้เลย`);
  }
  return (
    <View style={{ gap: 10, borderWidth: 1.5, borderColor: C.accent, borderRadius: R.field, padding: 12 }}>
      <Txt bold>เพิ่มผลเก่าเอง</Txt>
      <Txt muted size={12.5}>ดูจากตาราง "ประวัติการวัดองค์ประกอบของร่างกาย" บนใบ InBody ใส่ทีละวัน</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 2, minWidth: 0 }}><DateField label="วันที่วัด" value={day} onChange={setDay} max={isoDate(new Date())} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Field label="เวลา" value={time} onChangeText={setTime} placeholder="07:00" /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}><Field label="น้ำหนัก kg" value={w} onChangeText={v => setW(num(v))} keyboardType="decimal-pad" placeholder="93.4" /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Field label="กล้ามเนื้อ kg" value={m} onChangeText={v => setM(num(v))} keyboardType="decimal-pad" placeholder="42.9" /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Field label="%ไขมัน" value={f} onChangeText={v => setF(num(v))} keyboardType="decimal-pad" placeholder="20.9" /></View>
      </View>
      <Btn icon="check" label="บันทึก" onPress={save} loading={busy} />
      <Btn kind="ghost" label="ปิด" onPress={onCancel} />
    </View>
  );
}
