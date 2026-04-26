import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { establishSessionFromAuthUrl } from '../lib/authRedirect';
import { setSentryUser } from '../lib/sentry';

type AuthContextValue = {
  initialized: boolean;
  session: Session | null;
  user: Session['user'] | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const handledUrls = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;

    const finishInitialization = () => {
      if (isMounted) {
        setInitialized(true);
      }
    };

    const handleAuthUrl = async (url: string | null) => {
      if (!url || handledUrls.current.has(url)) return;

      handledUrls.current.add(url);

      try {
        await establishSessionFromAuthUrl(url);
      } catch (error) {
        console.error('Auth redirect handling failed:', error);
      }
    };

    void Linking.getInitialURL()
      .then((url) => handleAuthUrl(url))
      .finally(finishInitialization);

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (event === 'INITIAL_SESSION') {
        finishInitialization();
      }
    });

    return () => {
      isMounted = false;
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setSentryUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      session,
      user: session?.user ?? null,
    }),
    [initialized, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
