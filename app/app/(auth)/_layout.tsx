import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/lib/auth';
import { Loading } from '../../src/ui';
import { C } from '../../src/lib/theme';

export default function AuthLayout() {
  const { loading, session } = useAuth();
  if (loading) return <Loading />;
  if (session) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
