import type { ReactNode } from 'react';
import { View } from 'react-native';
import { STATUS_TH, type Member } from '../lib/counter';
import { thDate } from '../lib/gym';
import { prettyPhone } from '../lib/phone';
import { Pill, Row, Txt } from './index';

export function memberSub(m: Member) {
  const bits = [m.code];
  if (m.phone_norm || m.phone) bits.push(prettyPhone(m.phone_norm ?? m.phone));
  return bits.join(' · ');
}

export function expiryText(m: Member) {
  if (m.status === 'pt_only') return 'ไม่มีแพ็กเกจยิม';
  if (m.status === 'frozen') return `พักถึง ${thDate(m.frozen_until)}`;
  if (!m.end_date) return '';
  if (m.days_left != null && m.days_left < 0) return `หมด ${thDate(m.end_date)} (${-m.days_left} วันก่อน)`;
  return `ถึง ${thDate(m.end_date)}${m.days_left != null ? ` · เหลือ ${m.days_left} วัน` : ''}`;
}

export function MemberRow({ m, onPress, right }: { m: Member; onPress?: () => void; right?: ReactNode }) {
  const st = STATUS_TH[m.status];
  return (
    <Row icon={m.name.slice(0, 2)} title={m.name} sub={memberSub(m)} onPress={onPress}
      right={right ?? (
        <View style={{ alignItems: 'flex-end', gap: 3, maxWidth: 150 }}>
          <Pill text={st.t} kind={st.k} />
          {expiryText(m) ? <Txt muted size={11.5} style={{ textAlign: 'right' }}>{expiryText(m)}</Txt> : null}
        </View>
      )} />
  );
}
