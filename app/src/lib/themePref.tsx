import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getJSON, setJSON } from './store';
import { applyTheme, type Scheme } from './theme';

export type ThemeMode = 'system' | 'dark' | 'light';
const KEY = 'tm-theme';
const Ctx = createContext<{ mode: ThemeMode; scheme: Scheme; setMode: (m: ThemeMode) => void }>({ mode: 'system', scheme: 'dark', setMode: () => {} });

/** Follows the device's light/dark setting unless the person picked one on "ฉัน" */
export function ThemeProvider({ children }: { children: (scheme: Scheme) => React.ReactNode }) {
  const device = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  useEffect(() => { getJSON<ThemeMode>(KEY).then(m => { if (m === 'dark' || m === 'light' || m === 'system') setModeState(m); }); }, []);
  const scheme: Scheme = mode === 'system' ? (device === 'light' ? 'light' : 'dark') : mode;
  applyTheme(scheme);   // before children render, so every C.* read below gets this palette
  const setMode = (m: ThemeMode) => { setModeState(m); setJSON(KEY, m); };
  return <Ctx.Provider value={{ mode, scheme, setMode }}>{children(scheme)}</Ctx.Provider>;
}
export const useThemeMode = () => useContext(Ctx);
