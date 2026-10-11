import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { COUNTRIES, type Country } from '../lib/phone';
import { C, F, R } from '../lib/theme';
import { Txt } from './index';

/** Country dial-code picker + local number */
export function PhoneField({ label, country, onCountry, value, onChangeText, error, hint }: {
  label: string; country: Country; onCountry: (c: Country) => void; value: string; onChangeText: (s: string) => void; error?: string; hint?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt bold size={13.5}>{label}</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`รหัสประเทศ ${country.name} +${country.dial}`} onPress={() => setOpen(!open)}
          style={{ borderWidth: 1, borderColor: open ? C.accent : C.line, borderRadius: R.field, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: C.surface, minWidth: 96 }}>
          <Txt>{country.flag} +{country.dial} ▾</Txt>
        </Pressable>
        <TextInput value={value} onChangeText={onChangeText} keyboardType="phone-pad" autoComplete="tel" placeholder={country.code === 'TH' ? '081-234-5678' : ''}
          placeholderTextColor="#8a968f" accessibilityLabel={label}
          style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: error ? C.badFg : C.line, borderRadius: R.field, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, backgroundColor: C.surface, color: C.fg, fontFamily: F.body }} />
      </View>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.field, backgroundColor: C.surface, maxHeight: 260 }}>
          <ScrollView nestedScrollEnabled>
            {COUNTRIES.map(c => (
              <Pressable key={c.code} accessibilityRole="button" onPress={() => { onCountry(c); setOpen(false); }}
                style={({ pressed }) => ({ flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.code === country.code ? C.accentSoft : pressed ? C.surface2 : 'transparent' })}>
                <Txt>{c.flag}</Txt><Txt style={{ flex: 1 }}>{c.name}</Txt><Txt muted>+{c.dial}</Txt>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {error ? <Txt size={12.5} style={{ color: C.badFg }}>{error}</Txt> : hint ? <Txt size={12} muted>{hint}</Txt> : null}
    </View>
  );
}
