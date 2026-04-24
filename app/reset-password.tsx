import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, EyeOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Gradients, Palette, Radius, Shadows } from '../constants/Theme';
import { supabase } from '../lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSavePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Weak password', 'Your new password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Password mismatch', 'Your new password and confirmation do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      Alert.alert('Password updated', 'Your password has been reset successfully.', [
        {
          text: 'Continue',
          onPress: () => router.replace('/'),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Reset failed', error.message || 'We could not update your password.');
    } finally {
      setIsSaving(false);
    }
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
          <View style={styles.content}>
            <View style={styles.hero}>
              <Text style={styles.title}>Create a New Password</Text>
              <Text style={styles.subtitle}>
                Choose a fresh password for your LuminaScan account.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={Palette.onSurfaceVariant + '99'}
                  style={styles.passwordInput}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
                <Pressable style={styles.eyeIcon} onPress={() => setShowNewPassword((value) => !value)}>
                  {showNewPassword ? (
                    <EyeOff size={20} color={Palette.outlineVariant} />
                  ) : (
                    <Eye size={20} color={Palette.outlineVariant} />
                  )}
                </Pressable>
              </View>

              <Text style={[styles.label, styles.confirmLabel]}>Confirm Password</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={Palette.onSurfaceVariant + '99'}
                  style={styles.passwordInput}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSavePassword()}
                />
                <Pressable style={styles.eyeIcon} onPress={() => setShowConfirmPassword((value) => !value)}>
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={Palette.outlineVariant} />
                  ) : (
                    <Eye size={20} color={Palette.outlineVariant} />
                  )}
                </Pressable>
              </View>

              <Pressable
                onPress={() => void handleSavePassword()}
                disabled={isSaving}
                style={({ pressed }) => [
                  styles.submitButton,
                  (pressed || isSaving) && { opacity: 0.88 },
                ]}
              >
                <LinearGradient
                  colors={Gradients.accent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.submitText}>Update Password</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hero: {
    marginBottom: 24,
  },
  title: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 32,
    lineHeight: 38,
    color: '#FFF',
  },
  subtitle: {
    marginTop: 10,
    fontFamily: 'Manrope-Medium',
    fontSize: 15,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.82)',
  },
  card: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 20,
    ...Shadows.ambient,
  },
  label: {
    fontFamily: 'Manrope-Bold',
    fontSize: 13,
    color: Palette.onSurface,
    marginBottom: 8,
  },
  confirmLabel: {
    marginTop: 16,
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
    marginTop: 24,
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
});
