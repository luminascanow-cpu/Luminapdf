import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Palette } from '../../constants/Theme';
import { Shield, Cloud, HelpCircle, LogOut } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { getDocumentsCount } from '../../lib/storage';

// Sub-components
import { ProfileHeader } from '../../components/profile/ProfileHeader';
import { InfoSection } from '../../components/profile/InfoSection';
import { SettingsMenu } from '../../components/profile/SettingsMenu';
import { EditAccountModal } from '../../components/profile/EditAccountModal';

interface UserProfile {
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string | null;
  updated_at?: string | null;
}

// Deterministic gradient colors from a string (for avatar fallback)
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 60%, 50%)`;
}

function getInitials(name: string | null, email: string | null): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  const loadProfile = useCallback(async (shouldShowFullLoading = false) => {
    if (shouldShowFullLoading) setIsLoading(true);
    
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setProfile(null);
        setEmail(null);
        const count = await getDocumentsCount();
        setScannedCount(count);
        return;
      }

      setEmail(user.email ?? null);

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, is_verified, created_at')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        setProfile(data as UserProfile);
      } else {
        setProfile({
          full_name: user.user_metadata?.full_name ?? null,
          avatar_url: user.user_metadata?.avatar_url ?? null,
          is_verified: false,
          created_at: user.created_at ?? null,
        });
      }
      
      const count = await getDocumentsCount();
      setScannedCount(count);
    } catch (e) {
      console.error('Failed to load profile:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isEditModalVisible) return undefined;
      void loadProfile(profile === null); // Only show full loader if profile is not yet loaded
      return undefined;
    }, [isEditModalVisible, loadProfile, profile])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void loadProfile(false);
  }, [loadProfile]);

  const openEditModal = () => {
    setIsEditModalVisible(true);
  };

  const handleUpdateAccount = async ({
    nameInput,
    emailInput,
    newPassword,
    confirmPassword,
  }: {
    nameInput: string;
    emailInput: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    if (newPassword || confirmPassword) {
      if (newPassword.length < 6) {
        Alert.alert('Weak Password', 'New password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        Alert.alert('Password Mismatch', 'New password and confirm password do not match.');
        return;
      }
    }

    setIsUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      if (nameInput.trim() !== (profile?.full_name || '')) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: nameInput.trim(),
            updated_at: new Date().toISOString(),
          });
        if (profileError) throw profileError;
      }

      const updateData: { email?: string; password?: string } = {};
      if (emailInput.trim() && emailInput.trim() !== email) {
        updateData.email = emailInput.trim();
      }
      if (newPassword) {
        updateData.password = newPassword;
      }

      if (Object.keys(updateData).length > 0) {
        const { error: authError } = await supabase.auth.updateUser(updateData);
        if (authError) throw authError;

        if (updateData.email) {
          Alert.alert('Email Update', 'A confirmation link has been sent to your new email address.');
        }
      }

      await loadProfile(false); // Silent refresh
      setIsEditModalVisible(false);
      Alert.alert('✅ Saved', 'Your information has been updated.');
    } catch (e: any) {
      Alert.alert('Update Failed', e.message || 'Check your internet connection.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsSigningOut(true);
            await supabase.auth.signOut();
            router.replace('/login');
          } catch (e) {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          } finally {
            setIsSigningOut(false);
          }
        },
      },
    ]);
  };

  const lastSyncedText = profile?.updated_at 
    ? `Last synced: ${new Date(profile.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Not connected';

  const menuItems = [
    { icon: Shield, label: 'Privacy & Security', sub: 'Biometric lock and data' },
    { icon: Cloud, label: 'Cloud Sync', sub: lastSyncedText, action: () => onRefresh() },
    { icon: HelpCircle, label: 'Support & Feedback', sub: 'Get help or request features' },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingState]}>
        <ActivityIndicator size="large" color={Palette.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  const joinDateFormatted = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[Palette.primary]}
            tintColor={Palette.primary}
          />
        }
      >
        <ProfileHeader 
          displayName={profile?.full_name || (email ? email.split('@')[0] : 'User')}
          email={email}
          initials={getInitials(profile?.full_name ?? null, email)}
          avatarColor={stringToColor(email ?? 'user')}
          avatarUrl={profile?.avatar_url ?? null}
          isVerified={profile?.is_verified ?? false}
          joinDate={joinDateFormatted}
          scannedCount={scannedCount}
          onEditPress={openEditModal}
        />

        <View style={styles.contentPadding}>
          <Text style={styles.sectionHeader}>Basic Information</Text>
          <InfoSection 
            fullName={profile?.full_name ?? null}
            email={email}
            onEditPress={openEditModal}
          />

          <Text style={styles.sectionHeader}>Settings & Preferences</Text>
          <SettingsMenu items={menuItems} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
          onPress={handleSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? (
            <ActivityIndicator size="small" color="#FF5A5A" />
          ) : (
            <LogOut size={20} color="#FF5A5A" />
          )}
          <Text style={styles.logoutText}>{isSigningOut ? 'Signing out...' : 'Sign Out'}</Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.versionText}>LuminaScan v1.0.5</Text>
          <Text style={styles.footerBrand}>Powered by Archivist AI</Text>
        </View>
      </ScrollView>

        <EditAccountModal
          visible={isEditModalVisible}
          onClose={() => setIsEditModalVisible(false)}
          onSave={handleUpdateAccount}
          isUpdating={isUpdating}
          initialName={profile?.full_name || ''}
          initialEmail={email || ''}
        />
      </View>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  loadingState: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  contentPadding: {
    paddingHorizontal: 24,
    marginTop: 32,
  },
  sectionHeader: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: Palette.primary,
    marginBottom: 16,
    marginTop: 24,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 32,
    marginHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: 'rgba(255, 90, 90, 0.05)',
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 90, 90, 0.1)',
  },
  logoutText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: '#FF5A5A',
  },
  footer: {
    alignItems: 'center',
    marginTop: 48,
  },
  versionText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 11,
    color: Palette.onSurfaceVariant,
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footerBrand: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 12,
    color: Palette.primary,
    marginTop: 8,
    opacity: 0.8,
  },
});
