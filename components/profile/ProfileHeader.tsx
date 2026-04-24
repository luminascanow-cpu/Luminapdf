import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Edit3, CheckCircle, FileText, Award } from 'lucide-react-native';
import { Palette, Radius, Shadows } from '../../constants/Theme';

interface ProfileHeaderProps {
  displayName: string;
  email: string | null;
  initials: string;
  avatarColor: string;
  avatarUrl: string | null;
  isVerified: boolean;
  joinDate: string | null;
  scannedCount: number;
  onEditPress: () => void;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  displayName,
  email,
  initials,
  avatarColor,
  avatarUrl,
  isVerified,
  joinDate,
  scannedCount,
  onEditPress,
}) => {
  const [showAvatarImage, setShowAvatarImage] = useState(Boolean(avatarUrl));

  return (
    <SafeAreaView edges={['top']} style={styles.header}>
      <View style={styles.profileHeader}>
        {/* Avatar — real image if available, else initials */}
        <View style={styles.avatarWrapper}>
          {avatarUrl && showAvatarImage ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImg}
              onError={() => setShowAvatarImage(false)}
            />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}

          {/* Verified badge overlay */}
          {isVerified && (
            <View style={styles.verifiedOverlay}>
              <CheckCircle size={18} color={Palette.primary} fill="#FFF" />
            </View>
          )}
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.userName}>{displayName}</Text>
          <Pressable onPress={onEditPress} hitSlop={12} style={styles.editBadge}>
            <Edit3 size={14} color="#FFF" />
          </Pressable>
        </View>
        <Text style={styles.userEmail}>{email || 'No email set'}</Text>

        {joinDate && (
          <Text style={styles.joinDate}>Member since {joinDate}</Text>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <FileText size={20} color={Palette.primary} />
            <Text style={styles.statValue}>{scannedCount}</Text>
            <Text style={styles.statLabel}>Documents</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Award size={20} color="#FFD700" />
            <Text style={styles.statValue}>{scannedCount > 10 ? 'Scout' : 'Novice'}</Text>
            <Text style={styles.statLabel}>Current Rank</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
  },
  profileHeader: {
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#FFF',
    ...Shadows.ambient,
    overflow: 'visible',
    marginBottom: 20,
    position: 'relative',
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 36,
    color: '#FFF',
  },
  verifiedOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 24,
    color: Palette.onSurface,
    letterSpacing: -0.5,
  },
  editBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.ambient,
  },
  userEmail: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
    marginTop: 4,
  },
  joinDate: {
    fontFamily: 'Manrope-Medium',
    fontSize: 12,
    color: Palette.onSurfaceVariant,
    opacity: 0.6,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surfaceContainerLowest,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: Radius.xxl,
    marginTop: 24,
    ...Shadows.ambient,
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '1A',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Palette.outlineVariant + '40',
  },
  statValue: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 20,
    color: Palette.onSurface,
  },
  statLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    color: Palette.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
