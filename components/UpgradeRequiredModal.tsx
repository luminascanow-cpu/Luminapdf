import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, X } from 'lucide-react-native';
import { Gradients, Palette, Radius, Shadows } from '../constants/Theme';

interface UpgradeRequiredModalProps {
  visible: boolean;
  message: string;
  onClose: () => void;
  onOpenPayment: () => void;
  isOpeningPayment?: boolean;
}

export function UpgradeRequiredModal({
  visible,
  message,
  onClose,
  onOpenPayment,
  isOpeningPayment = false,
}: UpgradeRequiredModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.backdrop} />
        <View style={styles.modalCard}>
          <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.lockBadge}>
                <Lock size={18} color="#FFF" />
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <X size={22} color="rgba(255,255,255,0.82)" />
              </Pressable>
            </View>
            <Text style={styles.title}>Upgrade Required</Text>
            <Text style={styles.subtitle}>One-time unlock for unlimited scans</Text>
          </LinearGradient>

          <View style={styles.body}>
            <Text style={styles.message}>{message}</Text>

            <Pressable
              style={({ pressed }) => [styles.primaryButton, (pressed || isOpeningPayment) && { opacity: 0.88 }]}
              onPress={onOpenPayment}
              disabled={isOpeningPayment}
            >
              <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButtonGradient}>
                {isOpeningPayment ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Open Payment</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Not Now</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 16, 30, 0.48)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    overflow: 'hidden',
    ...Shadows.ambient,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 24,
    color: '#FFF',
  },
  subtitle: {
    marginTop: 6,
    fontFamily: 'Manrope-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  body: {
    padding: 20,
  },
  message: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: Palette.onSurfaceVariant,
  },
  primaryButton: {
    marginTop: 20,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FFF',
  },
  secondaryButton: {
    minHeight: 48,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.xxl,
    backgroundColor: Palette.surfaceContainerLow,
  },
  secondaryButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: Palette.onSurface,
  },
});
