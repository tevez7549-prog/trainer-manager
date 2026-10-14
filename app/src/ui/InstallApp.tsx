import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Btn, Card, H, Txt } from './index';
import { C, R } from '../lib/theme';

type Kind = 'prompt' | 'ios' | 'ios-inapp' | 'android-menu' | null;

/** Already opened from the home-screen icon? */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  return !!(window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches
    || (navigator as any).standalone);
}

function detect(): Kind {
  if (isStandalone()) return null;
  if ((window as any).__tmInstall) return 'prompt';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /Line\/|FBAN|FBAV|Instagram/i.test(ua) ? 'ios-inapp' : 'ios';
  if (/Android/.test(ua)) return 'android-menu';
  return null; // desktop without Chrome's prompt: nothing useful to show
}

/** "Install the app" card on the Me page: Chrome's install prompt, or how to do it by hand on iPhone */
export function InstallApp() {
  const [kind, setKind] = useState<Kind>(() => (Platform.OS === 'web' && typeof window !== 'undefined' ? detect() : null));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const again = () => setKind(detect());
    window.addEventListener('tm-install-ready', again);
    return () => window.removeEventListener('tm-install-ready', again);
  }, []);
  if (!kind) return null;

  async function install() {
    const ev = (window as any).__tmInstall;
    if (!ev) return setKind(detect());
    setBusy(true);
    try {
      await ev.prompt();
      const r = await ev.userChoice;
      if (r?.outcome === 'accepted') (window as any).__tmInstall = null;
    } finally { setBusy(false); setKind(detect()); }
  }

  return (
    <Card>
      <H size={17}>ติดตั้งแอพ</H>
      <Txt muted>เพิ่ม Dogfits ไว้ที่หน้าจอโฮม เปิดได้ทันทีแบบเต็มจอเหมือนแอพทั่วไป</Txt>
      {kind === 'prompt' ? <Btn icon="plus" label="ติดตั้งแอพ" onPress={install} loading={busy} /> : null}
      {kind === 'ios' ? (
        <Steps items={['กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบล่างของ Safari', 'เลื่อนลงแล้วเลือก "เพิ่มไปยังหน้าจอโฮม"', 'กด "เพิ่ม" แล้วเปิดแอพจากไอคอน Dogfits']} />
      ) : null}
      {kind === 'ios-inapp' ? (
        <Steps items={['กดเมนู ⋯ แล้วเลือก "เปิดใน Safari" ก่อน', 'ใน Safari กดปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม"']} />
      ) : null}
      {kind === 'android-menu' ? (
        <Steps items={['เปิดลิงก์นี้ใน Chrome', 'กดเมนู ⋮ มุมขวาบน', 'เลือก "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"']} />
      ) : null}
    </Card>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 24, height: 24, borderRadius: R.pill, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Txt bold size={13} style={{ color: C.accent }}>{String(i + 1)}</Txt>
          </View>
          <Txt style={{ flex: 1 }}>{t}</Txt>
        </View>
      ))}
    </View>
  );
}
