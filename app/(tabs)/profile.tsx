import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, Pressable, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreditCard, LogOut, RefreshCw } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Palette, Radius, Shadows } from '../../constants/Theme';
import { supabase } from '../../lib/supabase';
import { getExportedDocumentsCount, isPaymentUnlocked } from '../../lib/storage';
import { FREE_PAGE_LIMIT, FREE_SCAN_LIMIT } from '../../lib/paymentGate';
import { useAuth } from '../../hooks/useAuth';

interface ProfileState {
  displayName: string;
  email: string;
  scannedCount: number;
  isPaymentActive: boolean;
}

const EMPTY_PROFILE: ProfileState = {
  displayName: 'User',
  email: 'Not available',
  scannedCount: 0,
  isPaymentActive: false,
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSignOutModalVisible, setIsSignOutModalVisible] = useState(false);

  const loadProfile = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    }

    try {
      const [scannedCount, paymentUnlocked] = await Promise.all([
        getExportedDocumentsCount(),
        isPaymentUnlocked(),
      ]);

      if (!user) {
        setProfile({
          ...EMPTY_PROFILE,
          scannedCount,
          isPaymentActive: paymentUnlocked,
        });
        return;
      }

      const metadataName =
        typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim().length > 0
          ? user.user_metadata.full_name.trim()
          : null;

      let profileName = metadataName;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();

        if (data?.full_name && data.full_name.trim().length > 0) {
          profileName = data.full_name.trim();
        }
      } catch (error) {
        console.warn('Profile row lookup failed, using auth metadata instead.', error);
      }

      const email = user.email?.trim() || 'Not available';
      setProfile({
        displayName: profileName || email.split('@')[0] || 'User',
        email,
        scannedCount,
        isPaymentActive: paymentUnlocked,
      });
    } catch (error) {
      console.error('Failed to load profile screen:', error);
      setProfile((prev) => ({
        ...prev,
        displayName: prev.displayName || 'User',
        email: prev.email || 'Not available',
        scannedCount: Number.isFinite(prev.scannedCount) ? prev.scannedCount : 0,
        isPaymentActive: Boolean(prev.isPaymentActive),
      }));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile(true);
      return undefined;
    }, [loadProfile])
  );

  useEffect(() => {
    setProfile(EMPTY_PROFILE);
    void loadProfile(true);
  }, [loadProfile, user?.id]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void loadProfile(false);
  };

  const handleSignOut = () => {
    setIsSignOutModalVisible(true);
  };

  const confirmSignOut = async () => {
    try {
      setIsSigningOut(true);
      await supabase.auth.signOut();
      setIsSignOutModalVisible(false);
      router.replace('/login');
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingState]}>
        <ActivityIndicator size="large" color={Palette.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile.displayName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.name}>{profile.displayName}</Text>
            <Text style={styles.email}>{profile.email}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{profile.scannedCount}</Text>
                <Text style={styles.statLabel}>Documents</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{profile.isPaymentActive ? 'Unlocked' : 'Free'}</Text>
                <Text style={styles.statLabel}>Plan</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Payment & Access</Text>
            <Text style={styles.sectionBody}>
              {profile.isPaymentActive
                ? 'Unlimited access is active for this account.'
                : `Free access includes ${FREE_SCAN_LIMIT} completed scans and up to ${FREE_PAGE_LIMIT} pages in one scan session.`}
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/payment')}>
              <CreditCard size={18} color="#FFF" />
              <Text style={styles.primaryButtonText}>
                {profile.isPaymentActive ? 'View Payment Access' : 'Open Payment Page'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              onPress={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color={Palette.primary} />
              ) : (
                <RefreshCw size={18} color={Palette.primary} />
              )}
              <Text style={styles.secondaryButtonText}>{isRefreshing ? 'Refreshing...' : 'Refresh Profile'}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
              onPress={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <ActivityIndicator size="small" color="#FF5A5A" />
              ) : (
                <LogOut size={18} color="#FF5A5A" />
              )}
              <Text style={styles.logoutText}>{isSigningOut ? 'Signing out...' : 'Sign Out'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={isSignOutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSigningOut) {
            setIsSignOutModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!isSigningOut) {
                setIsSignOutModalVisible(false);
              }
            }}
          />

          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <LogOut size={22} color="#FFF" />
            </View>
            <Text style={styles.modalTitle}>Sign Out?</Text>
            <Text style={styles.modalBody}>
              You will need to sign in again to access your scans and account settings.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalSecondaryButton,
                  (pressed || isSigningOut) && styles.pressed,
                ]}
                onPress={() => setIsSignOutModalVisible(false)}
                disabled={isSigningOut}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modalPrimaryButton,
                  (pressed || isSigningOut) && styles.pressed,
                ]}
                onPress={() => void confirmSignOut()}
                disabled={isSigningOut}
              >
                <LinearGradient
                  colors={['#C5164E', '#FF7A45']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalPrimaryGradient}
                >
                  {isSigningOut ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.modalPrimaryText}>Sign Out</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  safeArea: {
    flex: 1,
  },
  loadingState: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
    gap: 18,
  },
  headerCard: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 24,
    alignItems: 'center',
    ...Shadows.ambient,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primary,
  },
  avatarText: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 34,
    color: '#FFF',
  },
  name: {
    marginTop: 16,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 24,
    color: Palette.onSurface,
  },
  email: {
    marginTop: 6,
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  statCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: Palette.surfaceContainerLow,
    borderRadius: Radius.xxl,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 20,
    color: Palette.onSurface,
  },
  statLabel: {
    marginTop: 4,
    fontFamily: 'Manrope-Bold',
    fontSize: 11,
    color: Palette.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCard: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 20,
    ...Shadows.ambient,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: Palette.onSurface,
  },
  sectionBody: {
    marginTop: 10,
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: Palette.onSurfaceVariant,
  },
  primaryButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: Radius.xxl,
    backgroundColor: Palette.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FFF',
  },
  secondaryButton: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: Radius.xxl,
    backgroundColor: Palette.surfaceContainerLow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  secondaryButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: Palette.primary,
  },
  logoutButton: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: Radius.xxl,
    backgroundColor: 'rgba(255, 90, 90, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 90, 90, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoutText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FF5A5A',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 16, 30, 0.48)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 22,
    alignItems: 'center',
    ...Shadows.ambient,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Palette.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    marginTop: 16,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 24,
    color: Palette.onSurface,
  },
  modalBody: {
    marginTop: 10,
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: Palette.onSurfaceVariant,
    textAlign: 'center',
  },
  modalActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: Radius.xxl,
    backgroundColor: Palette.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: Palette.onSurface,
  },
  modalPrimaryButton: {
    flex: 1,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },
  modalPrimaryGradient: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FFF',
  },
  pressed: {
    opacity: 0.78,
  },
});
