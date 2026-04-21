import { useEffect } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

/**
 * useHeartbeat hook updates the user's profile 'updated_at' timestamp 
 * on session initialization, app focus, and periodically (every 5 mins).
 * This helps track active user sessions and last-active status.
 */
export function useHeartbeat(initialized: boolean, session: Session | null) {
  useEffect(() => {
    if (!initialized || !session?.user) return;

    const heartbeat = async () => {
      try {
        await supabase
          .from('profiles')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', session.user.id);
      } catch (e) {
        // Silently ignore heartbeat errors as this is a non-critical background task
      }
    };

    // 1. Trigger heartbeat on initial mount/session load
    heartbeat();

    // 2. Trigger heartbeat when the app transitions back to active foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        heartbeat();
      }
    });

    // 3. Periodic heartbeat every 5 minutes while app remains active
    const interval = setInterval(heartbeat, 1000 * 60 * 5);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [initialized, session?.user?.id]);
}
