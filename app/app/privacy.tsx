import { LegalPage } from '../src/ui/LegalPage';
import { PRIVACY_EXTRA, PRIVACY_POINTS } from '../src/lib/legal';

export default function Privacy() {
  return <LegalPage title="นโยบายความเป็นส่วนตัว" sections={[
    { head: 'ข้อมูลที่เก็บและใครเห็น', points: PRIVACY_POINTS },
    { head: 'การเข้าสู่ระบบและการจัดเก็บ', points: PRIVACY_EXTRA },
  ]} />;
}
