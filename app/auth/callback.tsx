import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Palette } from '../../constants/Theme';
import { supabase } from '../../lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();

  useEffect(() => {
    let isMounted = true;

    const finishAuthRedirect = async () => {
      if (type === 'recovery') {
        router.replace('/reset-password');
        return;
      }

      try {
        // For confirmation/invite links we want the user to land on Sign In,
        // not jump straight into the app.
        await supabase.auth.signOut();
      } catch (error) {
        console.warn('Post-confirmation sign out failed:', error);
      } finally {
        if (isMounted) {
          router.replace('/login');
        }
      }
    };

    void finishAuthRedirect();

    return () => {
      isMounted = false;
    };
  }, [router, type]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Palette.primary} />
      <Text style={styles.title}>
        {type === 'recovery' ? 'Preparing password reset...' : 'Confirming your account...'}
      </Text>
      <Text style={styles.subtitle}>
        Please wait while LuminaScan processes your authentication link.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.background,
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: Palette.onSurface,
  },
  subtitle: {
    marginTop: 8,
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: Palette.onSurfaceVariant,
    textAlign: 'center',
  },
});
