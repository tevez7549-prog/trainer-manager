import { LegalPage } from '../src/ui/LegalPage';
import { TERMS_POINTS } from '../src/lib/legal';

export default function Terms() {
  return <LegalPage title="เงื่อนไขการใช้งาน" sections={[{ points: TERMS_POINTS }]} />;
}
