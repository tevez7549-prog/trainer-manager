// Phone numbers are stored in international form (E.164), e.g. +66812345678.
export type Country = { code: string; dial: string; flag: string; name: string };

export const COUNTRIES: Country[] = [
  { code: 'TH', dial: '66', flag: '🇹🇭', name: 'ไทย' },
  { code: 'LA', dial: '856', flag: '🇱🇦', name: 'ลาว' },
  { code: 'KH', dial: '855', flag: '🇰🇭', name: 'กัมพูชา' },
  { code: 'MM', dial: '95', flag: '🇲🇲', name: 'เมียนมา' },
  { code: 'MY', dial: '60', flag: '🇲🇾', name: 'มาเลเซีย' },
  { code: 'SG', dial: '65', flag: '🇸🇬', name: 'สิงคโปร์' },
  { code: 'VN', dial: '84', flag: '🇻🇳', name: 'เวียดนาม' },
  { code: 'ID', dial: '62', flag: '🇮🇩', name: 'อินโดนีเซีย' },
  { code: 'PH', dial: '63', flag: '🇵🇭', name: 'ฟิลิปปินส์' },
  { code: 'CN', dial: '86', flag: '🇨🇳', name: 'จีน' },
  { code: 'HK', dial: '852', flag: '🇭🇰', name: 'ฮ่องกง' },
  { code: 'TW', dial: '886', flag: '🇹🇼', name: 'ไต้หวัน' },
  { code: 'JP', dial: '81', flag: '🇯🇵', name: 'ญี่ปุ่น' },
  { code: 'KR', dial: '82', flag: '🇰🇷', name: 'เกาหลีใต้' },
  { code: 'IN', dial: '91', flag: '🇮🇳', name: 'อินเดีย' },
  { code: 'AE', dial: '971', flag: '🇦🇪', name: 'สหรัฐอาหรับเอมิเรตส์' },
  { code: 'AU', dial: '61', flag: '🇦🇺', name: 'ออสเตรเลีย' },
  { code: 'GB', dial: '44', flag: '🇬🇧', name: 'สหราชอาณาจักร' },
  { code: 'DE', dial: '49', flag: '🇩🇪', name: 'เยอรมนี' },
  { code: 'FR', dial: '33', flag: '🇫🇷', name: 'ฝรั่งเศส' },
  { code: 'US', dial: '1', flag: '🇺🇸', name: 'สหรัฐฯ / แคนาดา' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

const digits = (s: string) => s.replace(/\D/g, '');

/** "081-234-5678" + TH -> "+66812345678" */
export function toE164(local: string, c: Country): string | null {
  let d = digits(local);
  if (!d) return null;
  if (local.trim().startsWith('+')) return '+' + d;
  if (d.startsWith(c.dial) && d.length > 9) return '+' + d; // already includes the country code
  if (d.startsWith('0')) d = d.slice(1);
  return '+' + c.dial + d;
}

/** Valid if 7–15 digits in total (E.164 limit) and a sensible local part */
export function phoneError(local: string, c: Country): string | undefined {
  const e = toE164(local, c);
  if (!e) return 'ใส่เบอร์โทร';
  const n = e.length - 1;
  if (n < 8 || n > 15) return 'เบอร์ไม่ครบหรือยาวเกินไป';
  if (c.code === 'TH' && n !== 11) return 'เบอร์ไทยต้องมี 9–10 หลัก (เช่น 081-234-5678)';
  return undefined;
}

/** "+66812345678" -> { country: TH, local: "0812345678" } for editing */
export function splitE164(e: string | null | undefined): { country: Country; local: string } {
  if (!e || !e.startsWith('+')) return { country: DEFAULT_COUNTRY, local: e ?? '' };
  const d = e.slice(1);
  const c = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find(x => d.startsWith(x.dial));
  if (!c) return { country: DEFAULT_COUNTRY, local: e };
  const rest = d.slice(c.dial.length);
  return { country: c, local: c.code === 'TH' ? '0' + rest : rest };
}

/** "+66812345678" -> "081-234-5678" (Thai) or "+44 2079460000" */
export function prettyPhone(e: string | null | undefined): string {
  if (!e) return '';
  const { country, local } = splitE164(e);
  if (country.code === 'TH' && local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  return e.startsWith('+') ? `+${country.dial} ${local}` : e;
}
