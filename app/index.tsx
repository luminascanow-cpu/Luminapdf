import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, Dimensions, Modal, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Palette, Gradients, Shadows, Radius } from '../constants/Theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Settings, X, Image as ImageIcon, ChevronRight, FileDigit, FileImage } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { Document, getDocuments } from '../lib/storage';
import { optimizeImages } from '../lib/imageOptimizer';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [docCount, setDocCount] = useState(0);
  const [exportedDocs, setExportedDocs] = useState<Document[]>([]);
  const [showScanOptions, setShowScanOptions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfileName() {
      if (!user) {
        if (isMounted) {
          setProfileName(null);
        }
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (isMounted) {
        setProfileName(data?.full_name ?? null);
      }
    }

    void loadProfileName();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const displayName =
    profileName ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'LuminaScan User';
  const syncLabel = user ? 'Account Active' : 'Loading Account';

  const handlePickFromLibrary = async () => {
    setShowScanOptions(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsProcessing(true);
        const uris = result.assets.map(a => a.uri);
        const optimized = await optimizeImages(uris);
        setIsProcessing(false);
        router.push({
          pathname: '/preview',
          params: { imageUris: JSON.stringify(optimized) }
        });
      }
    } catch (error) {
      console.error('Image picking failed:', error);
      setIsProcessing(false);
    }
  };

  const getExportAccent = (type: string) => {
    switch (type) {
      case 'PDF':
        return '#FF8A65';
      case 'JPG':
        return '#4FC3F7';
      case 'PNG':
        return '#81C784';
      case 'DOCX':
        return '#7986CB';
      default:
        return Palette.primary;
    }
  };

  useFocusEffect(
    useCallback(() => {
      getDocuments()
        .then((docs) => {
          const successfulExports = docs.filter((doc) => doc.status === 'EXPORTED');
          setExportedDocs(successfulExports);
          setDocCount(successfulExports.length);
        })
        .catch(() => {});
    }, [])
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']} style={styles.headerContent}>
          <View style={styles.headerTop}>
            <View style={styles.userInfo}>
              <Pressable style={styles.settingsBtn} onPress={() => router.push('/profile')}>
                <Settings size={20} color={Palette.onPrimary} />
              </Pressable>
              <View style={styles.avatarContainer}>
                <Image
                  source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAfBc0Vi_rdQCuKwoKNyqyCimH3omQh4Ud8fn-7ave5ZbU-yzObqimAlPStmx-APqrt0CTjzv6Id-YDYJKU1vkO5P7LnkKBryvo0T3jreXyEN2BHSbIdajQCj9olPkFSDr1d_yJHiPJfYbH3yOZbH_M2UWsbwu9rpx5QygGRxl3H_YID3bJWtNJMpEC5GZtn9k5DdCPoF7wtcpl5W0KmmHKKlRIbF9QBQOcD-kMJKEDXfJi7k2IdI0Sycqpvin75Pwaw0joQPC0bg' }}
                  style={styles.avatar}
                />
              </View>
              <View>
                <Text style={styles.title}>{displayName}</Text>
                <View style={styles.syncStatus}>
                  <View style={styles.syncDot} />
                  <Text style={styles.syncText}>{syncLabel}</Text>
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <View style={styles.illustrationWrapper}>
            <Pressable
              onPress={() => router.push('/history')}
              style={({ pressed }) => [
                styles.illustrationMain,
                pressed && styles.illustrationPressed,
              ]}
            >
                <LinearGradient
                  colors={['#08111F', '#10243F', '#18345A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.vaultGradient}
                >
                  <View style={styles.illustrationOrb1} />
                  <View style={styles.illustrationOrb2} />
                  <View style={styles.illustrationOrb3} />
                  <View style={styles.vaultHeader}>
                    <View>
                      <Text style={styles.vaultEyebrow}>Export Vault</Text>
                      <Text style={styles.illustrationText}>
                        {docCount === 0 ? 'No successful exports yet' : `${docCount} successful exports`}
                      </Text>
                    </View>
                    <View style={styles.vaultBadge}>
                      <Text style={styles.vaultBadgeText}>{docCount}</Text>
                    </View>
                  </View>

                  {exportedDocs.length > 0 ? (
                    <View style={styles.exportList}>
                      {exportedDocs.slice(0, 3).map((doc, index) => (
                        <View key={doc.id} style={[styles.exportRow, index === exportedDocs.slice(0, 3).length - 1 && styles.exportRowLast]}>
                          <View style={[styles.exportIconWrap, { backgroundColor: getExportAccent(doc.type) + '22' }]}>
                            {doc.type === 'PDF' ? (
                              <FileDigit size={18} color={getExportAccent(doc.type)} />
                            ) : (
                              <FileImage size={18} color={getExportAccent(doc.type)} />
                            )}
                          </View>
                          <View style={styles.exportTextWrap}>
                            <Text numberOfLines={1} style={styles.exportName}>{doc.name}</Text>
                            <Text style={styles.exportMeta}>{doc.type} • {doc.pages} pages • {doc.date}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyVaultCard}>
                      <Text style={styles.emptyVaultTitle}>Your export history will appear here</Text>
                      <Text style={styles.emptyVaultText}>
                        Finish a scan and this space becomes your quick-access showcase.
                      </Text>
                    </View>
                  )}

                  <View style={styles.vaultFooter}>
                    <Text style={styles.vaultFooterText}>
                      {exportedDocs.length > 0 ? 'Tap to open all successful exports' : 'Tap to open export history'}
                    </Text>
                    <ChevronRight size={18} color="#FFF" />
                  </View>
                </LinearGradient>
            </Pressable>
        </View>

        <View style={styles.ctaContainer}>
            <Text style={styles.subtitle}>
            Your digital library is waiting. Start scanning documents to organize them with intelligent AI indexing.
            </Text>

            <Pressable 
                onPress={() => setShowScanOptions(true)}
                style={({ pressed }) => [
                styles.scanBtn,
                pressed && { transform: [{ scale: 0.95 }] }
                ]}
            >
                <LinearGradient
                    colors={Gradients.accent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.scanBtnGradient}
                >
                    <View style={styles.scanBtnInner}>
                        <Camera size={24} color="#FFF" style={styles.scanIcon} strokeWidth={2.5} />
                        <Text style={styles.scanBtnText}>Start Scanning</Text>
                    </View>
                    <View style={styles.scanBtnGlow} />
                </LinearGradient>
            </Pressable>
        </View>
      </ScrollView>

      {/* Scan Options Modal */}
      <Modal visible={showScanOptions} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.bottomSheet}>
                <View style={styles.bottomSheetHeader}>
                    <Text style={styles.modalTitle}>Choose Option</Text>
                    <Pressable onPress={() => setShowScanOptions(false)}>
                        <X size={24} color={Palette.onSurfaceVariant} />
                    </Pressable>
                </View>
                
                <Pressable style={styles.optionBtn} onPress={() => { setShowScanOptions(false); router.push('/scanner'); }}>
                    <View style={[styles.optionIcon, { backgroundColor: Palette.primary + '1A' }]}>
                        <Camera size={24} color={Palette.primary} />
                    </View>
                    <Text style={styles.optionText}>Take a Photo (Camera)</Text>
                </Pressable>
                
                <Pressable style={styles.optionBtn} onPress={handlePickFromLibrary}>
                    <View style={[styles.optionIcon, { backgroundColor: Palette.secondary + '1A' }]}>
                        <ImageIcon size={24} color={Palette.secondary} />
                    </View>
                    <Text style={styles.optionText}>Choose from Library</Text>
                </Pressable>
            </View>
        </View>
      </Modal>

      {isProcessing && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={Palette.primary} />
          <Text style={{ color: '#fff', marginTop: 16, fontFamily: 'PlusJakartaSans-Bold' }}>Processing Images...</Text>
        </View>
      )}

      <BlurView intensity={20} style={styles.bottomBlur} tint="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  header: {
    height: 190,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    zIndex: 10,
  },
  headerContent: {
    paddingHorizontal: 24,
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 4,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  title: {
    color: '#FFF',
    fontSize: 24,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: -0.5,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  syncText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontFamily: 'Manrope-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  illustrationWrapper: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  illustrationMain: {
    width: width - 48,
    minHeight: 320,
    borderRadius: 32,
    overflow: 'hidden',
    ...Shadows.ambient,
  },
  illustrationPressed: {
    transform: [{ scale: 0.985 }],
  },
  vaultGradient: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  illustrationOrb1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#39D0FF',
    opacity: 0.22,
    top: -60,
    left: -30,
  },
  illustrationOrb2: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#8C7BFF',
    opacity: 0.18,
    bottom: -45,
    right: -10,
  },
  illustrationOrb3: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFD86B',
    opacity: 0.14,
    top: 52,
    right: 30,
  },
  vaultHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 2,
  },
  vaultEyebrow: {
    fontFamily: 'Manrope-Bold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.68)',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 8,
  },
  illustrationText: {
    fontFamily: 'PlusJakartaSans-Bold',
    color: '#FFF',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    maxWidth: '78%',
  },
  vaultBadge: {
    minWidth: 62,
    height: 62,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultBadgeText: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 22,
    color: '#FFF',
  },
  exportList: {
    gap: 12,
    zIndex: 2,
  },
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  exportRowLast: {
    marginBottom: 0,
  },
  exportIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportTextWrap: {
    flex: 1,
  },
  exportName: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: '#FFF',
    marginBottom: 4,
  },
  exportMeta: {
    fontFamily: 'Manrope-Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
  emptyVaultCard: {
    zIndex: 2,
    borderRadius: 24,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyVaultTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: '#FFF',
    marginBottom: 8,
  },
  emptyVaultText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.68)',
  },
  vaultFooter: {
    zIndex: 2,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  vaultFooterText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
  },
  ctaContainer: {
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  subtitle: {
    fontFamily: 'Manrope-Regular',
    color: Palette.onSurfaceVariant,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 40,
  },
  scanBtn: {
    width: '100%',
    ...Shadows.accent,
  },
  scanBtnGradient: {
    borderRadius: Radius.full,
    padding: 2,
    overflow: 'hidden',
  },
  scanBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  scanBtnText: {
    color: '#FFF',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    letterSpacing: -0.2,
  },
  scanIcon: {
    marginTop: -2,
  },
  scanBtnGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderTopLeftRadius: 100,
    borderTopRightRadius: 100,
  },
  bottomBlur: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 24,
    gap: 18,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 10 }
    }),
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Palette.outlineVariant + '20',
  },
  infoLabel: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
  },
  infoValue: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: Palette.onSurface,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 13,
    color: Palette.onSurface,
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
  saveBtn: {
    marginTop: 8,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },
  saveBtnGradient: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FFF',
  },
  bottomSheet: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xxxl,
    borderTopRightRadius: Radius.xxxl,
    borderRadius: Radius.xxxl,
    padding: 24,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 20 }
    }),
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surfaceContainerLow,
    padding: 16,
    borderRadius: Radius.xxl,
    marginBottom: 12,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  optionText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: Palette.onSurface,
  }
});
