import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Profile = {
  id: string;
  uid: number;
  display_name: string;
  phone: string | null;
  email: string | null;
  status: 'active' | 'suspended';
  is_super_admin: boolean;
};

type Ctx = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  hasConsent: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  loading: true, session: null, profile: null, hasConsent: false,
  refresh: async () => {}, signOut: async () => {},
});

export const PDPA_VERSION = '2026-10-v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasConsent, setHasConsent] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setHasConsent(false); return; }
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('id,uid,display_name,phone,email,status,is_super_admin').eq('id', s.user.id).single(),
      supabase.from('consents').select('id').eq('user_id', s.user.id).eq('doc', 'pdpa').is('withdrawn_at', null).limit(1),
    ]);
    setProfile((p.data as Profile) ?? null);
    setHasConsent(!!(c.data && c.data.length));
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s);
      // run outside the auth callback to avoid blocking supabase-js
      setTimeout(() => { loadProfile(s); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const refresh = useCallback(async () => { await loadProfile(session); }, [loadProfile, session]);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  return (
    <AuthCtx.Provider value={{ loading, session, profile, hasConsent, refresh, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
