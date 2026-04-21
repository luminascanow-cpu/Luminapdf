import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // 1. Try to restore persisted session from AsyncStorage first
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    // 2. Keep session in sync with any auth events (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setInitialized(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // GUARD: Do not redirect until the async session read from AsyncStorage is done
    if (!initialized) return;

    const inAuthScreen = segments[0] === 'login';

    if (!session && !inAuthScreen) {
      router.replace('/login');
      return;
    }

    if (session && inAuthScreen) {
      router.replace('/');
    }
  }, [initialized, session]);   // NOTE: intentionally exclude `router` and `segments` to prevent
                                 // re-triggering on every navigation change (which was resetting auth)

  return { session, initialized, user: session?.user ?? null };
}
