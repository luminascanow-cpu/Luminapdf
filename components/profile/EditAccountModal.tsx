import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import { User, Mail, Key, Eye, EyeOff, X } from 'lucide-react-native';
import { Palette, Radius, Shadows } from '../../constants/Theme';

interface EditAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (payload: {
    nameInput: string;
    emailInput: string;
    newPassword: string;
    confirmPassword: string;
  }) => void;
  isUpdating: boolean;
  initialName: string;
  initialEmail: string;
}

export const EditAccountModal: React.FC<EditAccountModalProps> = ({
  visible,
  onClose,
  onSave,
  isUpdating,
  initialName,
  initialEmail,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!visible) return;

    setNameInput(initialName);
    setEmailInput(initialEmail);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }, [initialEmail, initialName, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Account</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={24} color={Palette.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalForm}>
            {/* ── Profile Info ── */}
            <Text style={styles.sectionHeading}>Basic Information</Text>

            <Text style={styles.modalLabel}>Display Name</Text>
            <View style={styles.inputWrapper}>
              <User size={18} color={Palette.outlineVariant} />
              <TextInput
                style={styles.modalInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Your display name"
                placeholderTextColor={Palette.outlineVariant}
              />
            </View>

            <Text style={styles.modalLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color={Palette.outlineVariant} />
              <TextInput
                style={styles.modalInput}
                value={emailInput}
                onChangeText={setEmailInput}
                placeholder="Update your email"
                placeholderTextColor={Palette.outlineVariant}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* ── Change Password ── */}
            <Text style={[styles.sectionHeading, { marginTop: 8 }]}>Change Password</Text>
            <Text style={styles.sectionNote}>Leave blank if you don't want to change your password.</Text>

            <Text style={styles.modalLabel}>New Password</Text>
            <View style={styles.inputWrapper}>
              <Key size={18} color={Palette.outlineVariant} />
              <TextInput
                style={styles.modalInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Min. 6 characters"
                placeholderTextColor={Palette.outlineVariant}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowNewPassword(!showNewPassword)} hitSlop={12}>
                {showNewPassword
                  ? <EyeOff size={18} color={Palette.outlineVariant} />
                  : <Eye size={18} color={Palette.outlineVariant} />}
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Confirm New Password</Text>
            <View style={styles.inputWrapper}>
              <Key size={18} color={Palette.outlineVariant} />
              <TextInput
                style={styles.modalInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
                placeholderTextColor={Palette.outlineVariant}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} hitSlop={12}>
                {showConfirmPassword
                  ? <EyeOff size={18} color={Palette.outlineVariant} />
                  : <Eye size={18} color={Palette.outlineVariant} />}
              </Pressable>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable
              style={[styles.modalBtn, styles.saveBtn, isUpdating && { opacity: 0.7 }]}
              onPress={() => onSave({ nameInput, emailInput, newPassword, confirmPassword })}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 24,
    ...Shadows.ambient,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: Palette.onSurface,
  },
  modalForm: {
    maxHeight: 480,
  },
  sectionHeading: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
    color: Palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionNote: {
    fontFamily: 'Manrope-Medium',
    fontSize: 12,
    color: Palette.onSurfaceVariant,
    opacity: 0.7,
    marginBottom: 16,
    marginTop: -6,
  },
  modalLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: Palette.onSurfaceVariant,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '40',
    marginBottom: 20,
    height: 56,
    gap: 12,
  },
  modalInput: {
    flex: 1,
    fontFamily: 'Manrope-Medium',
    fontSize: 15,
    color: Palette.onSurface,
  },
  modalFooter: {
    marginTop: 8,
  },
  modalBtn: {
    width: '100%',
    height: 52,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: Palette.primary,
  },
  saveBtnText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FFF',
  },
});
