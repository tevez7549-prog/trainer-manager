// Excel import: our template, read in the browser with SheetJS (loaded only when needed).
import { isoDate } from './gym';

export type ImportRow = { name: string; phone: string; plan_name: string; start_date: string; end_date: string; pt_only: boolean; note: string };
export type ParsedRow = ImportRow & { line: number; problem?: string };

export const TEMPLATE_HEADERS = ['ชื่อ', 'เบอร์โทร', 'แพ็กเกจ', 'วันเริ่ม', 'วันหมดอายุ', 'PT อย่างเดียว', 'หมายเหตุ'];

const ALIASES: Record<keyof ImportRow, string[]> = {
  name: ['ชื่อ', 'ชื่อสมาชิก', 'ชื่อ-นามสกุล', 'name'],
  phone: ['เบอร์โทร', 'เบอร์', 'โทรศัพท์', 'มือถือ', 'phone', 'tel', 'mobile'],
  plan_name: ['แพ็กเกจ', 'แพ็คเกจ', 'แพคเกจ', 'package', 'plan'],
  start_date: ['วันเริ่ม', 'วันที่เริ่ม', 'เริ่ม', 'start'],
  end_date: ['วันหมดอายุ', 'วันหมด', 'หมดอายุ', 'end', 'expire', 'expiry'],
  pt_only: ['pt อย่างเดียว', 'เทรน pt อย่างเดียว', 'pt_only', 'pt only'],
  note: ['หมายเหตุ', 'note', 'remark'],
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const YES = ['ใช่', 'y', 'yes', 'true', '1', 'x', '✓', '/'];

async function lib() {
  return await import('xlsx');
}

/** Download the template (web only) */
export async function downloadTemplate() {
  const XLSX = await lib();
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ['สมชาย ใจดี', '081-234-5678', '3 เดือน', '01/09/2026', '30/11/2026', '', ''],
    ['มานี มีสุข', '0899998888', '', '', '', 'ใช่', 'เทรนกับโค้ชบอย'],
  ]);
  ws['!cols'] = [{ wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 24 }];
  const help = XLSX.utils.aoa_to_sheet([
    ['วิธีกรอก'],
    ['ชื่อ: จำเป็น'],
    ['เบอร์โทร: ใส่แบบ 081-234-5678 หรือ +66812345678 · เบอร์ซ้ำกับสมาชิกเดิมในยิม จะไม่สร้างคนใหม่'],
    ['แพ็กเกจ: ชื่ออะไรก็ได้ เช่น 3 เดือน (ไม่ใส่ = "นำเข้า")'],
    ['วันเริ่ม / วันหมดอายุ: วัน/เดือน/ปี เช่น 30/11/2026 หรือ 30/11/2569 · ไม่มีวันหมด = ยังไม่มีแพ็กเกจ'],
    ['PT อย่างเดียว: ใส่ "ใช่" ถ้ามาเทรนกับเทรนเนอร์อย่างเดียว ไม่ได้ซื้อสมาชิกยิม'],
    ['ลบ 2 แถวตัวอย่างออกก่อนนำเข้า · สูงสุด 5,000 แถวต่อไฟล์'],
  ]);
  help['!cols'] = [{ wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'สมาชิก');
  XLSX.utils.book_append_sheet(wb, help, 'วิธีกรอก');
  XLSX.writeFile(wb, 'trainer-manager-สมาชิก.xlsx');
}

/** Let the user pick a file (web only) */
export function pickFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function toIso(v: unknown, SSF: any): string | null {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return isoDate(v);
  if (typeof v === 'number') {
    const d = SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const s = String(v).trim();
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else return null;
  if (y < 100) y = y >= 43 ? y + 2500 : y + 2000;    // 69 = พ.ศ. 2569, 26 = ค.ศ. 2026
  if (y > 2400) y -= 543;                            // Buddhist year
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return isoDate(dt);
}

/** Read the first sheet. The header row is the first row that has a "ชื่อ" column. */
export async function parseFile(file: File): Promise<{ rows: ParsedRow[]; missing: string[] }> {
  const XLSX = await lib();
  // CSV: read as UTF-8 text and keep every value as typed (leading 0 in phones, day/month order in dates)
  const wb = /\.csv$/i.test(file.name) || file.type === 'text/csv'
    ? XLSX.read((await file.text()).replace(/^﻿/, ''), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
  const hi = grid.findIndex(r => r.some(c => ALIASES.name.includes(norm(c))));
  if (hi < 0) return { rows: [], missing: ['ชื่อ'] };
  const head = grid[hi].map(norm);
  const col = {} as Record<keyof ImportRow, number>;
  (Object.keys(ALIASES) as (keyof ImportRow)[]).forEach(k => { col[k] = head.findIndex(h => ALIASES[k].includes(h)); });
  const missing = col.end_date < 0 ? ['วันหมดอายุ'] : [];

  const rows: ParsedRow[] = [];
  grid.slice(hi + 1).forEach((r, i) => {
    const get = (k: keyof ImportRow) => (col[k] >= 0 ? r[col[k]] : '');
    if (r.every(c => String(c ?? '').trim() === '')) return;
    const start = toIso(get('start_date'), XLSX.SSF), end = toIso(get('end_date'), XLSX.SSF);
    const row: ParsedRow = {
      line: hi + i + 2,
      name: String(get('name') ?? '').trim(),
      phone: String(get('phone') ?? '').trim(),
      plan_name: String(get('plan_name') ?? '').trim(),
      start_date: start ?? '',
      end_date: end ?? '',
      pt_only: YES.includes(norm(get('pt_only'))),
      note: String(get('note') ?? '').trim(),
    };
    if (!row.name) row.problem = 'ไม่มีชื่อ';
    else if (start === null) row.problem = 'วันเริ่มอ่านไม่ออก';
    else if (end === null) row.problem = 'วันหมดอายุอ่านไม่ออก';
    else if (row.start_date && row.end_date && row.start_date > row.end_date) row.problem = 'วันเริ่มอยู่หลังวันหมด';
    rows.push(row);
  });
  return { rows, missing };
}
