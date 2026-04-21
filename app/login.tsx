import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, EyeOff } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { Palette, Gradients, Radius, Shadows } from '../constants/Theme';
import { supabase } from '../lib/supabase';

type AuthMode = 'sign-in' | 'sign-up';

export default function LoginScreen() {
  const { height } = useWindowDimensions();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Record<string, number>>({});

  const title = useMemo(
    () => (mode === 'sign-in' ? 'Welcome Back' : 'Create Account'),
    [mode]
  );

  const subtitle = useMemo(
    () =>
      mode === 'sign-in'
        ? 'Sign in to sync scans, manage your profile, and keep your library secure.'
        : 'Create your LuminaScan account to save documents and unlock cloud-backed access.',
    [mode]
  );

  const handleSubmit = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password.trim()) {
      Alert.alert('Missing details', 'Enter your email and password to continue.');
      return;
    }

    if (mode === 'sign-up' && !fullName.trim()) {
      Alert.alert('Missing name', 'Enter your full name to create your account.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;
      } else {
        const redirectUrl = Linking.createURL('/(tabs)/home'); // Deep link to the app
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
            emailRedirectTo: redirectUrl,
          },
        });

        if (error) throw error;

        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: fullName.trim(),
            updated_at: new Date().toISOString(),
          });
        }

        if (!data.session) {
          Alert.alert(
            'Check your email',
            'Your account was created. Confirm your email address, then sign in.'
          );
          setMode('sign-in');
          return;
        }
      }
    } catch (error: any) {
      Alert.alert('Authentication failed', error.message || 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldFocus = (field: string) => {
    const y = fieldPositions.current[field];
    if (typeof y !== 'number') return;

    scrollViewRef.current?.scrollTo({
      y: Math.max(0, y - 32),
      animated: true,
    });
  };

  return (
    <LinearGradient
      colors={Gradients.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.screen}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrap}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
        >
          <ScrollView 
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { minHeight: height - 32 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            <View style={styles.hero}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.modeSwitch}>
                <Pressable
                  style={[styles.modeButton, mode === 'sign-in' && styles.modeButtonActive]}
                  onPress={() => setMode('sign-in')}
                >
                  <Text style={[styles.modeText, mode === 'sign-in' && styles.modeTextActive]}>
                    Sign In
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeButton, mode === 'sign-up' && styles.modeButtonActive]}
                  onPress={() => setMode('sign-up')}
                >
                  <Text style={[styles.modeText, mode === 'sign-up' && styles.modeTextActive]}>
                    Sign Up
                  </Text>
                </Pressable>
              </View>

              {mode === 'sign-up' && (
                <View
                  style={styles.field}
                  onLayout={(event) => {
                    fieldPositions.current.fullName = event.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Avery Walker"
                    placeholderTextColor={Palette.onSurfaceVariant + '99'}
                    style={styles.input}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onFocus={() => handleFieldFocus('fullName')}
                  />
                </View>
              )}

              <View
                style={styles.field}
                onLayout={(event) => {
                  fieldPositions.current.email = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={Palette.onSurfaceVariant + '99'}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onFocus={() => handleFieldFocus('email')}
                />
              </View>

              <View
                style={styles.field}
                onLayout={(event) => {
                  fieldPositions.current.password = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 6 characters"
                    placeholderTextColor={Palette.onSurfaceVariant + '99'}
                    style={styles.passwordInput}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onFocus={() => handleFieldFocus('password')}
                    onSubmitEditing={handleSubmit}
                  />
                  <Pressable 
                    style={styles.eyeIcon} 
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color={Palette.outlineVariant} />
                    ) : (
                      <Eye size={20} color={Palette.outlineVariant} />
                    )}
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed && !isSubmitting && { transform: [{ scale: 0.98 }] },
                  isSubmitting && { opacity: 0.8 },
                ]}
              >
                <LinearGradient
                  colors={Gradients.accent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.submitText}>
                      {mode === 'sign-in' ? 'Sign In Securely' : 'Create Account'}
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>

              <Text style={styles.footnote}>
                {mode === 'sign-in'
                  ? 'Use the account connected to your Supabase project.'
                  : 'Your profile will be created in Supabase after sign up.'}
              </Text>
              
              <Text style={styles.versionTag}>v1.0.1</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  hero: {
    marginBottom: 24,
    paddingTop: 8,
  },
  eyebrow: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 34,
    lineHeight: 40,
    color: '#FFF',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: 'Manrope-Medium',
    fontSize: 15,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.82)',
    maxWidth: 420,
  },
  card: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 20,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    ...Shadows.ambient,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: Palette.surfaceContainerLow,
    borderRadius: Radius.full,
    padding: 4,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: Palette.primary,
  },
  modeText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
  },
  modeTextActive: {
    color: '#FFF',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontFamily: 'Manrope-Bold',
    fontSize: 13,
    color: Palette.onSurface,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '40',
    borderRadius: Radius.xxl,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontFamily: 'Manrope-Medium',
    fontSize: 15,
    color: Palette.onSurface,
    backgroundColor: Palette.surface,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '40',
    borderRadius: Radius.xxl,
    backgroundColor: Palette.surface,
  },
  passwordInput: {
    flex: 1,
    paddingLeft: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontFamily: 'Manrope-Medium',
    fontSize: 15,
    color: Palette.onSurface,
  },
  eyeIcon: {
    padding: 16,
  },
  submitButton: {
    marginTop: 8,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },
  submitGradient: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FFF',
  },
  footnote: {
    marginTop: 14,
    fontFamily: 'Manrope-Medium',
    fontSize: 12,
    lineHeight: 18,
    color: Palette.onSurfaceVariant,
    textAlign: 'center',
  },
  versionTag: {
    marginTop: 12,
    fontFamily: 'Manrope-Medium',
    fontSize: 10,
    color: Palette.onSurfaceVariant + '60',
    textAlign: 'center',
  },
});
