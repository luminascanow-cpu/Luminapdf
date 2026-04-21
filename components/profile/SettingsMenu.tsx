import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ChevronRight, LucideIcon } from 'lucide-react-native';
import { Palette, Radius, Shadows } from '../../constants/Theme';

interface MenuItem {
  icon: LucideIcon;
  label: string;
  sub: string;
  action?: () => void;
}

interface SettingsMenuProps {
  items: MenuItem[];
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ items }) => {
  return (
    <View style={styles.menuContainer}>
      {items.map((item, index) => (
        <Pressable
          key={index}
          style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          onPress={item.action}
        >
          <View style={styles.menuIconBox}>
            <item.icon size={22} color={Palette.primary} />
          </View>
          <View style={styles.menuText}>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuSub}>{item.sub}</Text>
          </View>
          <ChevronRight size={18} color={Palette.outlineVariant} />
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  menuContainer: {
    gap: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surfaceContainerLowest,
    padding: 16,
    borderRadius: Radius.xxl,
    ...Shadows.ambient,
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '0D',
  },
  menuIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Palette.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuText: {
    flex: 1,
  },
  menuLabel: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: Palette.onSurface,
  },
  menuSub: {
    fontFamily: 'Manrope-Medium',
    fontSize: 12,
    color: Palette.onSurfaceVariant,
    marginTop: 2,
  },
});
