import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import { establishSessionFromAuthUrl } from '../lib/authRedirect';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const handledUrls = useRef(new Set<string>());
  const topSegment = segments[0] ?? '';
  const isPublicRoute =
    topSegment === 'login' || topSegment === 'auth' || topSegment === 'reset-password';
  const segmentKey = segments.join('/');

  useEffect(() => {
    let isMounted = true;

    const handleAuthUrl = async (url: string | null) => {
      if (!url || handledUrls.current.has(url)) return;

      handledUrls.current.add(url);

      try {
        await establishSessionFromAuthUrl(url);
      } catch (error) {
        console.error('Auth redirect handling failed:', error);
      } finally {
        if (isMounted) {
          setInitialized(true);
        }
      }
    };

    Linking.getInitialURL()
      .then((url) => handleAuthUrl(url))
      .finally(() => {
        if (isMounted) {
          setInitialized(true);
        }
      });

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        setSession(session);
        return;
      }

      setSession(session);
    });

    return () => {
      isMounted = false;
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // GUARD: Do not redirect until the async session read from AsyncStorage is done
    if (!initialized) return;

    if (!session && !isPublicRoute) {
      router.replace('/login');
      return;
    }

    if (session && (topSegment === 'login' || topSegment === 'auth')) {
      router.replace('/');
    }
  }, [initialized, session, isPublicRoute, topSegment, segmentKey, router]);

  return { session, initialized, user: session?.user ?? null };
}
