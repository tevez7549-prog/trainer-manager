import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { rememberJoin } from '../../src/lib/groups';
import { Screen, Txt } from '../../src/ui';

/** Invite link: keep the code, then the groups page joins it (after signing in if needed) */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  useEffect(() => {
    (async () => {
      if (code) await rememberJoin(String(code));
      router.replace('/groups' as any);
    })();
  }, [code]);
  return <Screen center><Txt muted>กำลังพาเข้ากลุ่ม…</Txt></Screen>;
}
