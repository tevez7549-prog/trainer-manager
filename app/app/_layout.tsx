import { Fragment, useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/lib/auth';
import { ThemeProvider } from '../src/lib/themePref';
import { LangProvider, type Lang } from '../src/lib/i18n';
import { C, type Scheme } from '../src/lib/theme';

function headLink(id: string, rel: string, href: string, extra: Record<string, string> = {}) {
  if (document.getElementById(id)) return;
  const l = document.createElement('link');
  l.id = id; l.rel = rel; l.href = href;
  Object.entries(extra).forEach(([k, v]) => l.setAttribute(k, v));
  document.head.appendChild(l);
}

function WebChrome({ scheme, lang }: { scheme: Scheme; lang: Lang }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    headLink('tm-fonts', 'stylesheet', 'https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap');
    headLink('tm-icon', 'icon', '/icon-192.png', { type: 'image/png' });
    headLink('tm-apple', 'apple-touch-icon', '/apple-touch-icon.png');
    headLink('tm-manifest', 'manifest', '/manifest.webmanifest');
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = C.bg;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = C.bg;
  }, [scheme, lang]);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LangProvider>
          {lang => (
            <ThemeProvider>
              {scheme => (
                // remount the screens when the palette or language changes so every colour and word is read again
                <Fragment key={scheme + lang}>
                  <WebChrome scheme={scheme} lang={lang} />
                  <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
                </Fragment>
              )}
            </ThemeProvider>
          )}
        </LangProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
