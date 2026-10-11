import React from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type TextProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, R } from '../lib/theme';

export function Txt({ style, muted, size, bold, ...p }: TextProps & { muted?: boolean; size?: number; bold?: boolean }) {
  return <Text {...p} style={[{ fontFamily: F.body, color: muted ? C.muted : C.fg, fontSize: size ?? 15, lineHeight: (size ?? 15) * 1.5, fontWeight: bold ? '600' : '400' }, style]} />;
}
export function H({ style, size = 22, ...p }: TextProps & { size?: number }) {
  return <Text {...p} accessibilityRole="header" style={[{ fontFamily: F.display, color: C.fg, fontSize: size, lineHeight: size * 1.35, fontWeight: '700' }, style]} />;
}

/** Phone-width column, centred on large screens */
export function Screen({ children, scroll = true, center }: { children: React.ReactNode; scroll?: boolean; center?: boolean }) {
  const inner = <View style={[s.col, center && { flexGrow: 1, justifyContent: 'center' }]}>{children}</View>;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {scroll ? <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Btn({ label, onPress, kind = 'primary', loading, disabled, style }: {
  label: string; onPress?: () => void; kind?: 'primary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const off = disabled || loading;
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? C.badFg : C.surface;
  const fg = kind === 'ghost' ? C.fg : C.accentFg;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }} onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: kind === 'ghost' ? C.line : bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ fontFamily: F.body, color: fg, fontWeight: '600', fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, hint, style, ...p }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt bold size={13.5}>{label}</Txt>
      <TextInput placeholderTextColor="#8a968f" {...p} accessibilityLabel={label}
        style={[s.input, error ? { borderColor: C.badFg } : null, style]} />
      {error ? <Txt size={12.5} style={{ color: C.badFg }}>{error}</Txt> : hint ? <Txt size={12} muted>{hint}</Txt> : null}
    </View>
  );
}

export function Notice({ text, kind = 'bad' }: { text: string; kind?: 'bad' | 'ok' | 'info' }) {
  const bg = kind === 'bad' ? C.badBg : kind === 'ok' ? C.accentSoft : C.infoBg;
  const fg = kind === 'bad' ? C.badFg : kind === 'ok' ? C.accentInk : C.infoFg;
  return <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: 10, padding: 12 }}><Txt size={13.5} style={{ color: fg }}>{text}</Txt></View>;
}

export function Row({ title, sub, right, onPress, icon }: { title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; icon?: string }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress}
      style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: C.surface2 } : null]}>
      {icon ? <View style={s.ic}><Text style={{ color: C.accentInk, fontWeight: '700', fontSize: 13, fontFamily: F.body }}>{icon}</Text></View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt bold>{title}</Txt>
        {sub ? <Txt size={12.5} muted>{sub}</Txt> : null}
      </View>
      {right}
      {onPress ? <Txt muted size={18}>›</Txt> : null}
    </Pressable>
  );
}

export function Pill({ text, kind = 'ok' }: { text: string; kind?: 'ok' | 'warn' | 'bad' | 'info' | 'mute' }) {
  const m = { ok: [C.accentSoft, C.accentInk], warn: [C.warnBg, C.warnFg], bad: [C.badBg, C.badFg], info: [C.infoBg, C.infoFg], mute: [C.surface2, C.muted] }[kind];
  return <View style={{ backgroundColor: m[0], borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 2 }}><Txt size={12} bold style={{ color: m[1] }}>{text}</Txt></View>;
}

/** Back button + page title */
export function Header({ title, sub, back, right }: { title: string; sub?: string; back: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="กลับ" onPress={back} hitSlop={8}
        style={({ pressed }) => ({ alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12, opacity: pressed ? 0.6 : 1 })}>
        <Txt muted>‹ กลับ</Txt>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <H size={24}>{title}</H>
          {sub ? <Txt muted size={13.5}>{sub}</Txt> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

/** Single choice from a few options, shown as chips */
export function Chips<T extends string | number>({ options, value, onChange, label }: {
  options: { v: T; t: string }[]; value: T | null; onChange: (v: T) => void; label?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt bold size={13.5}>{label}</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(o => {
          const on = o.v === value;
          return (
            <Pressable key={String(o.v)} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.v)}
              style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1.5, justifyContent: 'center',
                borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accent : pressed ? C.surface2 : C.surface })}>
              <Txt size={14} bold={on} style={{ color: on ? C.accentFg : C.fg }}>{o.t}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Date picker: the browser's own calendar on web, typed YYYY-MM-DD on phones */
export function DateField({ label, value, onChange, hint, min, max }: { label: string; value: string; onChange: (v: string) => void; hint?: string; min?: string; max?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt bold size={13.5}>{label}</Txt>
      {Platform.OS === 'web'
        ? React.createElement('input', {
            type: 'date', value, min, max, 'aria-label': label,
            onChange: (e: any) => e.target.value && onChange(e.target.value),
            style: { border: `1px solid ${C.line}`, borderRadius: R.field, padding: '10px 12px', fontSize: 16, fontFamily: F.body, color: C.fg, background: C.surface, minHeight: 46, boxSizing: 'border-box', width: '100%' },
          })
        : <TextInput value={value} onChangeText={onChange} placeholder="2026-10-11" accessibilityLabel={label} style={s.input} />}
      {hint ? <Txt size={12} muted>{hint}</Txt> : null}
    </View>
  );
}

/** Big number with a caption */
export function Stat({ n, t, kind }: { n: string | number; t: string; kind?: 'warn' | 'bad' }) {
  const fg = kind === 'warn' ? C.warnFg : kind === 'bad' ? C.badFg : C.fg;
  return (
    <View style={{ flex: 1, minWidth: 90, backgroundColor: C.surface, borderRadius: R.card, padding: 14, gap: 2 }}>
      <H size={24} style={{ color: fg }}>{String(n)}</H>
      <Txt muted size={12.5}>{t}</Txt>
    </View>
  );
}

/** Button that asks "tap again to confirm" before doing something hard to undo */
export function ConfirmBtn({ label, confirmLabel, onConfirm, kind = 'danger', loading }: { label: string; confirmLabel?: string; onConfirm: () => void; kind?: 'danger' | 'ghost' | 'primary'; loading?: boolean }) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return armed
    ? <Btn kind={kind} label={confirmLabel ?? `กดอีกครั้งเพื่อยืนยัน: ${label}`} loading={loading} onPress={() => { setArmed(false); onConfirm(); }} />
    : <Btn kind="ghost" label={label} loading={loading} onPress={() => setArmed(true)} />;
}

/** On/off row */
export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Txt bold size={14}>{label}</Txt>
        {hint ? <Txt muted size={12}>{hint}</Txt> : null}
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? C.accent : C.line, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
      </View>
    </Pressable>
  );
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.accent} size="large" /></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  col: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 20, gap: 16 },
  card: { backgroundColor: C.surface, borderRadius: R.card, padding: 16, gap: 12 },
  btn: { minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: R.field, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, backgroundColor: C.surface, color: C.fg, fontFamily: F.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  ic: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
