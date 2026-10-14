import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Btn, Card, Txt } from './index';

async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* old browser / not allowed: fall back */ }
  try {
    const a = document.createElement('textarea');
    a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select(); a.setSelectionRange(0, t.length);
    const ok = document.execCommand('copy'); a.remove(); return ok;
  } catch { return false; }
}

/** "Open this page on a computer": the page's link with copy (and share on phones, e.g. send it to yourself in LINE) */
export function CopyLink({ path, title, hint }: { path: string; title: string; hint: string }) {
  const [done, setDone] = useState<'' | 'ok' | 'fail'>('');
  if (Platform.OS !== 'web' || typeof location === 'undefined') return null;
  const url = `${location.origin}${path}`;
  const canShare = typeof navigator !== 'undefined' && !!(navigator as any).share && /iPhone|iPad|Android/i.test(navigator.userAgent);
  return (
    <Card>
      <Txt bold>{title}</Txt>
      <Txt muted size={13}>{hint}</Txt>
      <Txt size={13} selectable numberOfLines={2} style={{ opacity: 0.85 }}>{url}</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn kind={done === 'ok' ? 'primary' : 'ghost'} icon={done === 'ok' ? 'check' : 'copy'} label={done === 'ok' ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'} style={{ flex: 1 }}
          onPress={async () => { const ok = await copyText(url); setDone(ok ? 'ok' : 'fail'); if (ok) setTimeout(() => setDone(''), 2500); }} />
        {canShare ? <Btn kind="ghost" icon="share" label="ส่งต่อ" style={{ flex: 1 }}
          onPress={() => (navigator as any).share({ title, url }).catch(() => {})} /> : null}
      </View>
      {done === 'fail' ? <Txt muted size={12.5}>คัดลอกอัตโนมัติไม่ได้ · กดค้างที่ลิงก์ด้านบนเพื่อคัดลอกเอง</Txt> : null}
    </Card>
  );
}
