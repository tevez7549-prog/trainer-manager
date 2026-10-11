import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { Btn, Card, H, Loading, Screen, Txt } from '../../src/ui';
import { C } from '../../src/lib/theme';

/** Everything inside (app) needs: signed in, active account, PDPA consent */
export default function AppLayout() {
  const { loading, session, profile, hasConsent, signOut } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Loading />;
  if (profile.status === 'suspended') return (
    <Screen center><Card>
      <H size={20}>บัญชีถูกระงับ</H>
      <Txt muted>ติดต่อผู้ดูแลระบบเพื่อเปิดใช้งานอีกครั้ง</Txt>
      <Btn kind="ghost" label="ออกจากระบบ" onPress={signOut} />
    </Card></Screen>
  );
  if (!hasConsent) return <Redirect href="/consent" />;
  if (!profile.phone || !profile.display_name) return <Redirect href="/onboard" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
