import React from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions,
  type TextInputProps, type TextProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, R } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { tr, trNode } from '../lib/i18n';

// Volt Graphite components. Colours are read from C at render time (see theme.ts), so nothing is cached in a StyleSheet.

export function Txt({ style, muted, size, bold, children, ...p }: TextProps & { muted?: boolean; size?: number; bold?: boolean }) {
  const fs = size ?? 15;
  return <Text {...p} children={trNode(children)} style={[{ fontFamily: F.body, color: muted ? C.muted : C.fg, fontSize: fs, lineHeight: Math.round(fs * 1.55), fontWeight: bold ? '600' : '400', fontVariant: ['tabular-nums'] }, style]} />;
}
export function H({ style, size = 22, children, ...p }: TextProps & { size?: number }) {
  return <Text {...p} children={trNode(children)} accessibilityRole="header" style={[{ fontFamily: F.display, color: C.fg, fontSize: size, lineHeight: Math.round(size * 1.4), fontWeight: '700', fontVariant: ['tabular-nums'] }, style]} />;
}
/** Section label above a group (`label` style, ink-muted) */
export function Label({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[{ fontFamily: F.display, fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.muted, paddingHorizontal: 4 }, style]}>{trNode(children)}</Text>;
}

/** Phone-width column, centred on large screens */
export function Screen({ children, scroll = true, center, wide, footer }: { children: React.ReactNode; scroll?: boolean; center?: boolean; wide?: boolean; footer?: React.ReactNode }) {
  const inner = (
    <View style={[{ width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 16 },
      wide && { maxWidth: 1180, paddingHorizontal: 24 }, center && { flexGrow: 1, justifyContent: 'center' }]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={footer ? ['top'] : ['top', 'bottom']}>
      {scroll ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : <View style={{ flex: 1 }}>{inner}</View>}
      {footer}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ backgroundColor: C.surface, borderRadius: R.card, padding: 16, gap: 12 }, style]}>{children}</View>;
}

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
export function Btn({ label, onPress, kind = 'primary', loading, disabled, style, icon, textColor }: {
  label: string; onPress?: () => void; kind?: BtnKind; loading?: boolean; disabled?: boolean; style?: ViewStyle; icon?: IconName; textColor?: string;
}) {
  const off = disabled || loading;
  const [bg, fg0, border] =
    kind === 'primary' ? [C.brand, C.brandInk, C.brand]
    : kind === 'secondary' ? [C.surface2, C.fg, C.surface2]
    : kind === 'danger' ? [C.badBg, C.badFg, C.badBg]
    : kind === 'danger-solid' ? [C.badFg, C.surface, C.badFg]
    : ['transparent', C.fg, C.line];       // ghost = outline
  const fg = textColor ?? fg0;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }} onPress={off ? undefined : onPress}
      style={(st: any) => [{ minHeight: 48, borderRadius: R.field, borderWidth: 1, borderColor: border, backgroundColor: bg, flexDirection: 'row', gap: 8,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, opacity: off ? 0.45 : st.pressed ? 0.85 : st.hovered ? 0.93 : 1,
        transform: st.pressed && !off ? [{ translateY: 1 }] : undefined }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>
        {icon ? <Icon name={icon} size={18} color={fg} /> : null}
        <Text style={{ fontFamily: F.body, color: fg, fontWeight: '600', fontSize: 16, lineHeight: 24 }}>{tr(label)}</Text>
      </>}
    </Pressable>
  );
}

export function Field({ label, error, hint, style, icon, ...p }: TextInputProps & { label: string; error?: string; hint?: string; icon?: IconName }) {
  const [focus, setFocus] = React.useState(false);
  const bw = error || focus ? 2 : 1;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: F.display, fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.fg }}>{tr(label)}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: R.field, backgroundColor: C.surface2,
        borderWidth: bw, borderColor: error ? C.badFg : focus ? C.accent : C.line, paddingHorizontal: 16 - (bw - 1) }}>
        {icon ? <Icon name={icon} size={20} /> : null}
        <TextInput placeholderTextColor={C.muted} {...p} placeholder={tr(p.placeholder) ?? undefined} accessibilityLabel={tr(label)}
          onFocus={e => { setFocus(true); p.onFocus?.(e); }} onBlur={e => { setFocus(false); p.onBlur?.(e); }}
          style={[{ flex: 1, minWidth: 0, fontSize: 16, color: C.fg, fontFamily: F.body, paddingVertical: 11, outlineStyle: 'none' } as any, style]} />
      </View>
      {error ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="circle-x" size={16} color={C.badFg} /><Txt size={13} bold style={{ color: C.badFg, flex: 1 }}>{error}</Txt></View>
        : hint ? <Txt size={13} muted>{hint}</Txt> : null}
    </View>
  );
}

type NoticeKind = 'bad' | 'ok' | 'info' | 'warn' | 'offline';
export function Notice({ text, kind = 'bad', action, onAction }: { text: string; kind?: NoticeKind; action?: string; onAction?: () => void }) {
  const m: Record<NoticeKind, [string, string, IconName, string?]> = {
    ok: [C.accentSoft, C.accent, 'circle-check'],
    info: [C.infoBg, C.infoFg, 'info'],
    warn: [C.warnBg, C.warnFg, 'triangle-alert'],
    bad: [C.badBg, C.badFg, 'circle-x'],
    offline: [C.surface2, C.fg, 'wifi-off', C.warnFg],
  };
  const [bg, fg, ic, icColor] = m[kind];
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: R.field, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ paddingTop: 1 }}><Icon name={ic} size={20} color={icColor ?? fg} /></View>
      <Txt size={15} style={{ color: fg, flex: 1 }}>{text}</Txt>
      {action ? <Txt size={14} bold style={{ color: fg, textDecorationLine: 'underline' }} onPress={onAction} accessibilityRole="button">{action}</Txt> : null}
    </View>
  );
}

/** ListRow: lead chip (initials or icon) · title + sub · right side · chevron */
export function Row({ title, sub, right, onPress, icon, ic, danger }: {
  title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; icon?: string; ic?: IconName; danger?: boolean;
}) {
  const leadBg = danger ? C.badBg : C.accentSoft, leadFg = danger ? C.badFg : C.accent;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress}
      style={(st: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64, borderRadius: R.field,
        backgroundColor: onPress && (st.pressed || st.hovered) ? C.surface2 : 'transparent', marginHorizontal: -8, paddingHorizontal: 8 })}>
      {ic ? <View style={{ width: 40, height: 40, borderRadius: R.field, backgroundColor: leadBg, alignItems: 'center', justifyContent: 'center' }}><Icon name={ic} size={20} color={leadFg} /></View>
        : icon ? <View style={{ width: 40, height: 40, borderRadius: R.field, backgroundColor: leadBg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: leadFg, fontWeight: '600', fontSize: 14, fontFamily: F.body }}>{icon}</Text></View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.body, fontSize: 16, lineHeight: 24, fontWeight: '600', color: danger ? C.badFg : C.fg }}>{tr(title)}</Text>
        {sub ? <Text numberOfLines={2} style={{ fontFamily: F.body, fontSize: 14, lineHeight: 22, color: C.muted }}>{tr(sub)}</Text> : null}
      </View>
      {right}
      {onPress ? <Icon name="chevron-right" size={18} /> : null}
    </Pressable>
  );
}

export type PillKind = 'ok' | 'warn' | 'bad' | 'info' | 'mute' | 'caution';
/** Badge: short status at the end of a row */
export function Pill({ text, kind = 'ok' }: { text: string; kind?: PillKind }) {
  const m = { ok: [C.accentSoft, C.accent], warn: [C.warnBg, C.warnFg], bad: [C.badBg, C.badFg], info: [C.infoBg, C.infoFg], mute: [C.surface2, C.muted], caution: [C.cautionBg, C.cautionFg] }[kind];
  return (
    <View style={{ backgroundColor: m[0], borderRadius: R.badge, paddingHorizontal: 10, minHeight: 26, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: F.body, fontSize: 13, lineHeight: 18, fontWeight: '600', color: m[1] }}>{tr(text)}</Text>
    </View>
  );
}

/** Back link + page title */
export function Header({ title, sub, back, right }: { title: string; sub?: string; back?: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ gap: 4, paddingTop: back ? 0 : 8 }}>
      {back ? <Pressable accessibilityRole="button" accessibilityLabel={tr('กลับ')} onPress={back} hitSlop={8}
        style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 12, marginLeft: -4, opacity: pressed ? 0.6 : 1 })}>
        <Icon name="chevron-left" size={18} /><Txt muted size={14}>กลับ</Txt>
      </Pressable> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <H size={24} numberOfLines={1}>{title}</H>
          {sub ? <Txt muted size={14}>{sub}</Txt> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

/** Segmented: pick exactly one */
export function Chips<T extends string | number>({ options, value, onChange, label }: {
  options: { v: T; t: string }[]; value: T | null; onChange: (v: T) => void; label?: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={{ fontFamily: F.display, fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.fg }}>{tr(label)}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(o => {
          const on = o.v === value;
          return (
            <Pressable key={String(o.v)} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.v)}
              style={(st: any) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
                borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : st.pressed || st.hovered ? C.surface2 : C.surface })}>
              {on ? <Icon name="check" size={16} color={C.accent} /> : null}
              <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 22, fontWeight: on ? '600' : '500', color: on ? C.accent : C.fg }}>{tr(o.t)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// iPhone Safari gives date/time inputs a fixed inner width and centres the text, so they spill past the card.
// Force them to shrink to the column and left-align like the other fields.
let pickerCss = false;
function addPickerCss() {
  if (pickerCss || typeof document === 'undefined') return;
  pickerCss = true;
  const el = document.createElement('style');
  el.textContent = `input.tm-picker{-webkit-appearance:none;appearance:none;display:block;width:100%;min-width:0;max-width:100%;text-align:left}
input.tm-picker::-webkit-date-and-time-value{text-align:left;margin:0}
input.tm-picker::-webkit-datetime-edit{padding:0}`;
  document.head.appendChild(el);
}
const webInput = (label: string) => ({
  border: `1px solid ${C.line}`, borderRadius: R.field, padding: '0 14px', fontSize: 16, fontFamily: F.body, color: C.fg,
  background: C.surface2, height: 48, lineHeight: '48px', boxSizing: 'border-box', width: '100%', minWidth: 0, maxWidth: '100%',
  display: 'block', textAlign: 'left', colorScheme: C.scheme, 'aria-label': label,
});

/** Date picker: the browser's own calendar on web, typed YYYY-MM-DD on phones */
export function DateField({ label, value, onChange, hint, min, max }: { label: string; value: string; onChange: (v: string) => void; hint?: string; min?: string; max?: string }) {
  return (
    <View style={{ gap: 8, minWidth: 0, width: '100%' }}>
      <Text style={{ fontFamily: F.display, fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.fg }}>{tr(label)}</Text>
      {Platform.OS === 'web'
        ? (addPickerCss(), React.createElement('input', { type: 'date', className: 'tm-picker', value, min, max, 'aria-label': label, onChange: (e: any) => e.target.value && onChange(e.target.value), style: webInput(label) }))
        : <TextInput value={value} onChangeText={onChange} placeholder="2026-10-11" placeholderTextColor={C.muted} accessibilityLabel={label}
            style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.field, backgroundColor: C.surface2, color: C.fg, fontSize: 16, paddingHorizontal: 14, minHeight: 48 }} />}
      {hint ? <Txt size={13} muted>{hint}</Txt> : null}
    </View>
  );
}

/** Time picker: the browser's own control on web, typed HH:MM on phones */
export function TimeField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <View style={{ gap: 8, minWidth: 0, width: '100%' }}>
      <Text style={{ fontFamily: F.display, fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.fg }}>{tr(label)}</Text>
      {Platform.OS === 'web'
        ? (addPickerCss(), React.createElement('input', { type: 'time', className: 'tm-picker', value, step: 300, 'aria-label': label, onChange: (e: any) => e.target.value && onChange(e.target.value), style: webInput(label) }))
        : <TextInput value={value} onChangeText={onChange} placeholder="18:00" placeholderTextColor={C.muted} accessibilityLabel={label}
            style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.field, backgroundColor: C.surface2, color: C.fg, fontSize: 16, paddingHorizontal: 14, minHeight: 48 }} />}
      {hint ? <Txt size={13} muted>{hint}</Txt> : null}
    </View>
  );
}

/** StatTile: label on top, big number below */
export function Stat({ n, t, kind, ic }: { n: string | number; t: string; kind?: 'warn' | 'bad'; ic?: IconName }) {
  const bg = kind === 'warn' ? C.warnBg : kind === 'bad' ? C.badBg : C.surface;
  const fg = kind === 'warn' ? C.warnFg : kind === 'bad' ? C.badFg : C.fg;
  return (
    <View style={{ flex: 1, minWidth: 96, backgroundColor: bg, borderRadius: R.card, padding: 16, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {kind ? <Icon name={ic ?? 'triangle-alert'} size={16} color={fg} /> : null}
        <Txt size={14} style={{ color: kind ? fg : C.muted, flexShrink: 1 }}>{t}</Txt>
      </View>
      <H size={32} style={{ color: fg, letterSpacing: -0.3 }}>{String(n)}</H>
    </View>
  );
}

/** Two-step confirm for things that can't be undone */
export function ConfirmBtn({ label, confirmLabel, onConfirm, kind = 'danger', loading }: { label: string; confirmLabel?: string; onConfirm: () => void; kind?: 'danger' | 'ghost' | 'primary'; loading?: boolean }) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return armed
    ? <Btn kind={kind === 'danger' ? 'danger-solid' : kind} label={confirmLabel ?? `กดอีกครั้งเพื่อยืนยัน: ${label}`} loading={loading} onPress={() => { setArmed(false); onConfirm(); }} />
    : <Btn kind="ghost" label={label} loading={loading} onPress={() => setArmed(true)} />;
}

/** Switch row: the whole row toggles */
export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
      <View style={{ flex: 1 }}>
        <Txt bold size={16}>{label}</Txt>
        {hint ? <Txt muted size={13}>{hint}</Txt> : null}
      </View>
      <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, borderWidth: 1.5, borderColor: value ? C.accent : C.line,
        backgroundColor: value ? C.brand : C.surface2, alignItems: value ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: value ? C.brandInk : C.muted }} />
      </View>
    </Pressable>
  );
}

/** true on a computer-sized browser window */
export function useWide(min = 960) {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= min;
}

/** Two columns on wide screens, stacked on phones */
export function Cols({ left, right, ratio = [3, 2] }: { left: React.ReactNode; right: React.ReactNode; ratio?: [number, number] }) {
  const wide = useWide();
  if (!wide) return <>{left}{right}</>;
  return (
    <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
      <View style={{ flex: ratio[0], gap: 16, minWidth: 0 }}>{left}</View>
      <View style={{ flex: ratio[1], gap: 16, minWidth: 0 }}>{right}</View>
    </View>
  );
}

/** Empty state: icon, title, how to start, one action */
export function Empty({ ic = 'inbox', title, text, action, onAction }: { ic?: IconName; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 16 }}>
      <View style={{ width: 56, height: 56, borderRadius: R.card, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name={ic} size={26} /></View>
      <H size={18} style={{ marginTop: 8, textAlign: 'center' }}>{title}</H>
      {text ? <Txt muted size={14} style={{ textAlign: 'center', maxWidth: 300 }}>{text}</Txt> : null}
      {action ? <Btn kind="secondary" icon="plus" label={action} onPress={onAction} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator color={C.accent} size="large" /></View>;
}

/** Dropdown: the browser's own list on web (opens the phone's native picker on iPhone), a simple list elsewhere */
export function Select<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  const [open, setOpen] = React.useState(false);
  const cur = tr(options.find(o => o.v === value)?.t ?? value);
  return (
    <View style={{ gap: 8, minWidth: 0 }}>
      {label ? <Text style={{ fontFamily: F.display, fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.fg }}>{tr(label)}</Text> : null}
      {Platform.OS === 'web' ? (
        <View style={{ position: 'relative' }}>
          {React.createElement('select', {
            value, 'aria-label': tr(label ?? 'เลือก'), onChange: (e: any) => onChange(e.target.value),
            style: { ...webInput(label ?? ''), appearance: 'none', WebkitAppearance: 'none', paddingRight: 40, cursor: 'pointer' },
          }, options.map(o => React.createElement('option', { key: o.v, value: o.v }, tr(o.t))))}
          <View pointerEvents="none" style={{ position: 'absolute', right: 14, top: 14 }}><Icon name="chevron-down" size={20} color={C.muted} /></View>
        </View>
      ) : <>
        <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}
          style={{ minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: R.field, backgroundColor: C.surface2, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Txt style={{ flex: 1 }}>{cur}</Txt><Icon name="chevron-down" size={20} color={C.muted} />
        </Pressable>
        {open ? <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.field, backgroundColor: C.surface }}>
          {options.map(o => (
            <Pressable key={o.v} accessibilityRole="button" onPress={() => { onChange(o.v); setOpen(false); }} style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
              <Txt bold={o.v === value} style={o.v === value ? { color: C.accent } : undefined}>{o.t}</Txt>
            </Pressable>
          ))}
        </View> : null}
      </>}
    </View>
  );
}
