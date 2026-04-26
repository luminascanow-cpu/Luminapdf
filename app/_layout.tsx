import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { Image, Text, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { initDatabase } from '../lib/storage';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { useHeartbeat } from '../hooks/useHeartbeat';
import { Gradients } from '../constants/Theme';
import { initSentry } from '../lib/sentry';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();
initSentry();

function BootSplash() {
  return (
    <LinearGradient
      colors={Gradients.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 128,
          height: 128,
          borderRadius: 36,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.14)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.18)',
          shadowColor: '#120f3d',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.22,
          shadowRadius: 32,
          elevation: 10,
        }}
      >
        <Image
          source={require('../assets/app-logo.png')}
          style={{ width: 84, height: 84 }}
          resizeMode="contain"
        />
      </View>
      <Text
        style={{
          marginTop: 24,
          fontFamily: 'PlusJakartaSans-ExtraBold',
          fontSize: 28,
          color: '#FFF',
          letterSpacing: 0.3,
        }}
      >
        LuminaScan
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontFamily: 'Manrope-Medium',
          fontSize: 14,
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        Preparing your scanner
      </Text>
    </LinearGradient>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
    'PlusJakartaSans-ExtraBold': PlusJakartaSans_800ExtraBold,
    'Manrope-Regular': Manrope_400Regular,
    'Manrope-Medium': Manrope_500Medium,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold': Manrope_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        await initDatabase();
      } catch (e) {
        console.error('DB Init Error:', e);
      } finally {
        if (loaded || error) {
          SplashScreen.hideAsync();
        }
      }
    }
    prepare();
  }, [loaded, error]);

  if (!loaded && !error) {
    return <BootSplash />;
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { initialized, session } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const topSegment = segments[0] ?? '';
  const isPublicRoute =
    topSegment === 'login' || topSegment === 'auth' || topSegment === 'reset-password';
  
  // Custom hook for background focus tracking
  useHeartbeat(initialized, session);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (!session && !isPublicRoute) {
      router.replace('/login');
      return;
    }

    if (session && (topSegment === '' || topSegment === 'login' || topSegment === 'auth')) {
      router.replace('/');
    }
  }, [initialized, isPublicRoute, router, session, topSegment]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f6f6ff' }}>
      <StatusBar style="dark" />
      <Stack
        initialRouteName="login"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#f6f6ff' },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="payment" />
        <Stack.Screen name="reset-password" options={{ animation: 'fade' }} />
        <Stack.Screen name="scanner" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="preview" />
      </Stack>
    </View>
  );
}
