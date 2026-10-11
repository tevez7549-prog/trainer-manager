import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { COUNTRIES, type Country } from '../lib/phone';
import { C, F, R } from '../lib/theme';
import { Txt } from './index';
import { Icon } from './Icon';

/** Country dial-code picker + local number */
export function PhoneField({ label, country, onCountry, value, onChangeText, error, hint }: {
  label: string; country: Country; onCountry: (c: Country) => void; value: string; onChangeText: (s: string) => void; error?: string; hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const bw = error || focus ? 2 : 1;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: F.display, fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.fg }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`รหัสประเทศ ${country.name} +${country.dial}`} onPress={() => setOpen(!open)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: open ? C.accent : C.line, borderRadius: R.field, paddingHorizontal: 12, minHeight: 48, backgroundColor: C.surface2 }}>
          <Txt bold>+{country.dial}</Txt><Icon name="chevron-down" size={16} />
        </Pressable>
        <TextInput value={value} onChangeText={onChangeText} keyboardType="phone-pad" autoComplete="tel" placeholder={country.code === 'TH' ? '081-234-5678' : ''}
          placeholderTextColor={C.muted} accessibilityLabel={label} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, minWidth: 0, borderWidth: bw, borderColor: error ? C.badFg : focus ? C.accent : C.line, borderRadius: R.field, paddingHorizontal: 16 - (bw - 1), minHeight: 48, fontSize: 16, backgroundColor: C.surface2, color: C.fg, fontFamily: F.body, outlineStyle: 'none' } as any} />
      </View>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.field, backgroundColor: C.surface, maxHeight: 264, overflow: 'hidden' }}>
          <ScrollView nestedScrollEnabled>
            {COUNTRIES.map((c, i) => {
              const on = c.code === country.code;
              return (
                <Pressable key={c.code} accessibilityRole="button" onPress={() => { onCountry(c); setOpen(false); }}
                  style={(st: any) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16, minHeight: 44, borderTopWidth: i ? 1 : 0, borderTopColor: C.line,
                    backgroundColor: on ? C.accentSoft : st.pressed || st.hovered ? C.surface2 : 'transparent' })}>
                  <Txt style={{ flex: 1, color: on ? C.accent : C.fg }} bold={on}>{c.name}</Txt><Txt muted style={on ? { color: C.accent } : undefined}>+{c.dial}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      {error ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="circle-x" size={16} color={C.badFg} /><Txt size={13} bold style={{ color: C.badFg }}>{error}</Txt></View>
        : hint ? <Txt size={13} muted>{hint}</Txt> : null}
    </View>
  );
}
