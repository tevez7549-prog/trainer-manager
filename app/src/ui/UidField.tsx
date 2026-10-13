import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Field } from './index';
import { Icon } from './Icon';
import { QrScanner } from './QrScanner';
import { C, R } from '../lib/theme';
import { parseUid } from '../lib/qr';

/** UID box with a scan button: type the number, or scan the QR on the other person's Me page */
export function UidField({ label, value, onChange, placeholder = 'เช่น 100002', onScanned }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; onScanned?: (uid: number) => void;
}) {
  const [scan, setScan] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Field label={label} value={value} onChangeText={onChange} keyboardType="number-pad" placeholder={placeholder} />
      </View>
      {Platform.OS === 'web' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="สแกน QR" onPress={() => setScan(true)}
          style={(st: any) => ({ height: 48, paddingHorizontal: 14, borderRadius: R.field, flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: st.pressed || st.hovered ? C.surface2 : C.accentSoft })}>
          <Icon name="camera" size={20} color={C.accent} />
        </Pressable>
      ) : null}
      <QrScanner open={scan} title="สแกน QR ของอีกฝ่าย" hint={'ให้อีกฝ่ายเปิดหน้า "ฉัน" แล้วส่องกล้องไปที่ QR'}
        accept={parseUid} onClose={() => setScan(false)}
        onResult={uid => { setScan(false); onChange(String(uid)); onScanned?.(uid); }} />
    </View>
  );
}
