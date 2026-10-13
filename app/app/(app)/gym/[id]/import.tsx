import { useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, thError } from '../../../../src/lib/supabase';
import { isManager, thDate, useGym } from '../../../../src/lib/gym';
import { downloadTemplate, parseFile, pickFile, TEMPLATE_HEADERS, type ParsedRow } from '../../../../src/lib/excel';
import { Btn, Card, H, Header, Notice, Screen, Stat, Txt } from '../../../../src/ui';
import { C } from '../../../../src/lib/theme';
import { GymFrame } from '../../../../src/ui/GymFrame';

type Result = { rows: number; added: number; existing: number; memberships: number; errors: { line: number; name: string; error: string }[] };
const CHUNK = 500;

export default function ImportPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gym, role } = useGym(id);
  const [file, setFile] = useState('');
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const good = (rows ?? []).filter(r => !r.problem);
  const bad = (rows ?? []).filter(r => r.problem);

  async function choose() {
    setErr(''); setWarn(''); setResult(null);
    const f = await pickFile();
    if (!f) return;
    try {
      const { rows: r, missing } = await parseFile(f);
      setFile(f.name);
      if (!r.length && missing.includes('ชื่อ')) { setRows(null); setErr('ไม่พบคอลัมน์ "ชื่อ" ในแผ่นงานแรก ใช้ไฟล์ตัวอย่างของเราเป็นแบบ'); return; }
      if (r.length > 5000) { setRows(null); setErr(`ไฟล์มี ${r.length} แถว เกิน 5,000 แถว แบ่งเป็นหลายไฟล์ก่อน`); return; }
      if (missing.includes('วันหมดอายุ')) setWarn('ไม่พบคอลัมน์ "วันหมดอายุ" · จะนำเข้าเฉพาะชื่อและเบอร์ (ยังไม่มีแพ็กเกจ)');
      setRows(r);
    } catch (e) {
      setRows(null); setErr('อ่านไฟล์ไม่ได้ ใช้ไฟล์ .xlsx หรือ .csv');
    }
  }

  async function run() {
    if (!good.length) return;
    setBusy(true); setErr('');
    const total: Result = { rows: 0, added: 0, existing: 0, memberships: 0, errors: [] };
    for (let i = 0; i < good.length; i += CHUNK) {
      const part = good.slice(i, i + CHUNK);
      setProgress(`กำลังนำเข้า ${Math.min(i + CHUNK, good.length)} / ${good.length}`);
      const { data, error } = await supabase.rpc('import_members', {
        g: id, rows: part.map(({ line, problem, ...r }) => r),
      });
      if (error) { setErr(`หยุดที่แถว ${part[0].line}: ${thError(error)}`); break; }
      const d = data as any;
      total.rows += d.rows; total.added += d.added; total.existing += d.existing; total.memberships += d.memberships;
      (d.errors as { row: number; name: string; error: string }[]).forEach(e => total.errors.push({ line: part[e.row - 1]?.line ?? 0, name: e.name, error: e.error }));
    }
    setBusy(false); setProgress(''); setResult(total); setRows(null);
  }

  if (gym && !isManager(role)) return <GymFrame id={id} gym={gym} role={role} active="import"><Header title="นำเข้า Excel" back={() => router.replace(`/gym/${id}/more` as any)} /><Notice text="เฉพาะเจ้าของและผู้จัดการ นำเข้าได้" /></GymFrame>;

  return (
    <GymFrame id={id} gym={gym} role={role} active="import">
      <Header title="นำเข้าสมาชิกจาก Excel" sub={gym?.name} back={() => router.replace(`/gym/${id}/more` as any)} />
      {Platform.OS !== 'web' ? <Notice kind="info" text="นำเข้า Excel ใช้ได้บนเว็บ (คอมพิวเตอร์) เท่านั้น" /> : null}
      {err ? <Notice text={err} /> : null}
      {warn ? <Notice kind="info" text={warn} /> : null}

      {!rows && !result ? (
        <Card>
          <H size={17}>1. ดาวน์โหลดไฟล์ตัวอย่าง</H>
          <Txt muted size={13.5}>คอลัมน์: {TEMPLATE_HEADERS.join(' · ')}</Txt>
          <Btn kind="ghost" label="ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)" onPress={() => downloadTemplate().catch(() => setErr('สร้างไฟล์ไม่สำเร็จ'))} />
          <H size={17}>2. กรอกแล้วอัปโหลด</H>
          <Txt muted size={13.5}>เบอร์ซ้ำกับสมาชิกที่มีอยู่ จะไม่สร้างคนซ้ำ · วันที่ใส่เป็น ค.ศ. หรือ พ.ศ. ก็ได้ · นำเข้าซ้ำไฟล์เดิมได้ ไม่เกิดรายการซ้ำ</Txt>
          <Btn label="เลือกไฟล์" onPress={choose} />
        </Card>
      ) : null}

      {rows ? <>
        <Card>
          <H size={17}>ตรวจก่อนนำเข้า</H>
          <Txt muted size={13}>{file}</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat n={good.length} t="พร้อมนำเข้า" />
            <Stat n={bad.length} t="มีปัญหา (ข้าม)" kind={bad.length ? 'bad' : undefined} />
          </View>
          {bad.slice(0, 20).map(r => <Txt key={r.line} size={13} style={{ color: C.badFg }}>แถว {r.line}: {r.name || '(ไม่มีชื่อ)'} · {r.problem}</Txt>)}
          {bad.length > 20 ? <Txt muted size={13}>…และอีก {bad.length - 20} แถว</Txt> : null}
        </Card>
        <Card style={{ gap: 6 }}>
          <H size={17}>ตัวอย่าง 8 แถวแรก</H>
          {good.slice(0, 8).map(r => (
            <View key={r.line} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Txt bold size={14}>{r.name}{r.pt_only ? ' · PT อย่างเดียว' : ''}</Txt>
              <Txt muted size={12.5}>{[r.phone, r.plan_name, r.end_date ? `${r.start_date ? thDate(r.start_date) + ' – ' : 'ถึง '}${thDate(r.end_date)}` : 'ไม่มีแพ็กเกจ', r.note].filter(Boolean).join(' · ')}</Txt>
            </View>
          ))}
        </Card>
        {progress ? <Notice kind="info" text={progress} /> : null}
        <Btn label={`นำเข้า ${good.length} รายการ`} onPress={run} loading={busy} disabled={!good.length} />
        <Btn kind="ghost" label="เลือกไฟล์ใหม่" onPress={choose} />
      </> : null}

      {result ? <>
        <Notice kind="ok" text={`นำเข้าเสร็จ · สมาชิกใหม่ ${result.added} คน · เบอร์ซ้ำ (มีอยู่แล้ว) ${result.existing} คน · แพ็กเกจ ${result.memberships} รายการ`} />
        {result.errors.length ? (
          <Card style={{ gap: 4 }}>
            <H size={17}>ไม่ได้นำเข้า {result.errors.length} แถว</H>
            {result.errors.slice(0, 30).map((e, i) => <Txt key={i} size={13} style={{ color: C.badFg }}>แถว {e.line}: {e.name} · {thError(e.error)}</Txt>)}
          </Card>
        ) : null}
        <Btn label="ดูรายชื่อสมาชิก" onPress={() => router.replace(`/gym/${id}/members` as any)} />
        <Btn kind="ghost" label="นำเข้าไฟล์อื่น" onPress={() => setResult(null)} />
      </> : null}
    </GymFrame>
  );
}
