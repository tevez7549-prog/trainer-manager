import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { supabase, thError } from '../../../src/lib/supabase';
import { KIND, type GroupKind } from '../../../src/lib/groups';
import { Btn, Card, Field, Header, Label, Notice, Screen, Txt } from '../../../src/ui';
import { Icon } from '../../../src/ui/Icon';
import { GroupInvite } from '../../../src/ui/GroupInvite';
import { C, R } from '../../../src/lib/theme';

const DEFAULT_NAME: Record<GroupKind, string> = { couple: 'แฟนกับฉัน', family: 'บ้านเรา', friends: 'แก๊งออกกำลังกาย' };

/** Make a group in two steps, then send the invite */
export default function NewGroup() {
  const [kind, setKind] = useState<GroupKind>('couple');
  const [name, setName] = useState('');
  const [made, setMade] = useState<{ id: string; code: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/groups' as any));

  async function create() {
    const n = name.trim() || DEFAULT_NAME[kind];
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('create_group', { gname: n, gkind: kind });
    setBusy(false);
    if (error) { setErr(thError(error)); return; }
    setMade({ id: (data as any).id, code: (data as any).code, name: n });
  }

  if (made) return (
    <Screen>
      <Header title="ชวนเข้ากลุ่ม" back={() => router.replace(`/groups/${made.id}` as any)} />
      <Notice kind="ok" text={`สร้างกลุ่ม "${made.name}" แล้ว · ส่งโค้ดหรือลิงก์ให้คนที่อยากชวน`} />
      <Card><GroupInvite name={made.name} code={made.code} /></Card>
      <Btn label="ไปที่กลุ่ม" onPress={() => router.replace(`/groups/${made.id}` as any)} />
    </Screen>
  );

  return (
    <Screen>
      <Header title="สร้างกลุ่ม" back={back} />
      {err ? <Notice text={err} /> : null}
      <Label>1 · เล่นกับใคร</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(Object.keys(KIND) as GroupKind[]).map(k => {
          const on = k === kind;
          return (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setKind(k)}
              style={{ flex: 1, height: 96, borderRadius: 16, borderWidth: on ? 1.5 : 1, borderColor: on ? C.accent : C.line,
                backgroundColor: on ? C.accentSoft : C.surface, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name={KIND[k].icon} size={26} color={on ? C.accent : C.muted} />
              <Txt bold={on} style={on ? { color: C.accent } : undefined}>{KIND[k].t}</Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt muted size={13}>ทุกแบบใช้เหมือนกัน ต่างกันแค่ไอคอน · สูงสุด 20 คน</Txt>
      <Label>2 · ชื่อกลุ่ม</Label>
      <Field label="ชื่อกลุ่ม" value={name} onChangeText={setName} placeholder={DEFAULT_NAME[kind]} maxLength={60} />
      <Txt muted size={13}>ในกลุ่มจะเห็นกันแค่ "ใครเล่นอะไร เมื่อไหร่" · อาหารและน้ำหนักไม่แชร์ ยกเว้นคนที่คุณกดให้ดูแล</Txt>
      <Btn label="สร้างกลุ่ม แล้วชวนเพื่อน" onPress={create} loading={busy} />
    </Screen>
  );
}
