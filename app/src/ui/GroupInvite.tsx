import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { copyText, inviteText, inviteUrl, prettyCode, shareAny, shareLine } from '../lib/groups';
import { C, R } from '../lib/theme';
import { Btn, H, Txt } from './index';
import { Icon } from './Icon';

/** Code, link, and the ways to send it: LINE, the phone's share sheet, copy */
export function GroupInvite({ name, code }: { name: string; code: string }) {
  const [note, setNote] = useState('');
  const text = inviteText(name, code);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <H size={28} style={{ letterSpacing: 4, fontVariant: ['tabular-nums'] }}>{prettyCode(code)}</H>
          <Txt muted size={13} numberOfLines={1}>{inviteUrl(code).replace(/^https?:\/\//, '')}</Txt>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="คัดลอกลิงก์ชวน"
          onPress={async () => setNote((await copyText(text)) ? 'คัดลอกข้อความชวนแล้ว' : 'คัดลอกไม่ได้ กดค้างที่โค้ดแล้วคัดลอกเอง')}
          style={{ width: 44, height: 44, borderRadius: R.field, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="copy" size={20} color={C.fg} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={() => shareLine(text)}
        style={({ pressed }) => ({ height: 48, borderRadius: R.field, backgroundColor: '#06C755', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
        <Txt bold style={{ color: '#FFFFFF' }}>ส่งชวนทาง LINE</Txt>
      </Pressable>
      <Btn kind="ghost" icon="share" label="แชร์ทางอื่น" onPress={async () => {
        const r = await shareAny(text, inviteUrl(code));
        if (r === 'copied') setNote('คัดลอกข้อความชวนแล้ว วางในแชทได้เลย');
      }} />
      {note ? <Txt size={13} style={{ color: C.accent }}>{note}</Txt> : null}
      <Txt muted size={12.5}>เพื่อนยังไม่มีแอป? กดลิงก์แล้วสมัครได้เลย ระบบพาเข้ากลุ่มให้เอง</Txt>
    </View>
  );
}
