import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { User, Mail, Edit3, LucideIcon } from 'lucide-react-native';
import { Palette, Radius, Shadows } from '../../constants/Theme';

interface InfoSectionProps {
  fullName: string | null;
  email: string | null;
  onEditPress: () => void;
}

export const InfoSection: React.FC<InfoSectionProps> = ({ fullName, email, onEditPress }) => {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <User size={20} color={Palette.primary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.label}>Username</Text>
          <Text style={styles.value}>{fullName || 'Not set'}</Text>
        </View>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <Mail size={20} color={Palette.primary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.label}>Email Address</Text>
          <Text style={styles.value}>{email || 'Not set'}</Text>
        </View>
      </View>

      <Pressable 
        style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
        onPress={onEditPress}
      >
        <Edit3 size={16} color={Palette.primary} />
        <Text style={styles.editBtnText}>Edit Username & Password</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxl,
    padding: 20,
    ...Shadows.ambient,
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '1A',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Palette.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    color: Palette.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.6,
  },
  value: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: Palette.onSurface,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Palette.outlineVariant + '1A',
    marginLeft: 56,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    backgroundColor: Palette.primary + '10',
    borderRadius: 12,
  },
  editBtnText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
    color: Palette.primary,
  },
});
