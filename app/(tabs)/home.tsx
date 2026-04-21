import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, FlatList, Platform, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Palette, Gradients, Radius, Shadows } from '../../constants/Theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, LayoutGrid, Filter, MoreVertical, Scanner, FileImage, FileDigit, Camera, Image as ImageIcon } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Document, getDocuments } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { User } from '@supabase/supabase-js';
import { usePermissions } from '../../hooks/usePermissions';
import { useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';

const { width } = Dimensions.get('window');

const getDocumentColor = (type: string) => {
  switch (type) {
    case 'PDF':
      return Palette.secondary;
    case 'JPG':
      return Palette.tertiary;
    default:
      return Palette.primary;
  }
};

export default function HomeScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState(0);

  const { ensureStoragePermission } = usePermissions();

  const openDocument = async (doc: Document) => {
    try {
      const info = await FileSystem.getInfoAsync(doc.uri);

      if (!info.exists) {
        Alert.alert('File Missing', 'This scan is no longer available on your device.');
        return;
      }

      const encodedUri = doc.uri.includes(' ') ? encodeURI(doc.uri) : doc.uri;
      try {
        await Linking.openURL(encodedUri);
        return;
      } catch (linkingError) {
        console.warn('Direct open failed, falling back to sharing.', linkingError);
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(encodedUri, {
          dialogTitle: doc.name,
        });
        return;
      }

      Alert.alert('Unavailable', 'This file cannot be opened on this device.');
    } catch (error) {
      console.error('Failed to open document:', error);
      Alert.alert('Open Failed', 'We could not open this scan right now.');
    }
  };

  useEffect(() => {
    // Proactive permission request after login/home mount
    const timer = setTimeout(() => {
      void ensureStoragePermission();
    }, 1000); // Small delay to allow UI to settle
    return () => clearTimeout(timer);
  }, [ensureStoragePermission]);

  const loadDocuments = useCallback(async () => {
    try {
      // 1. Get user profile
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);

      if (currentUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', currentUser.id)
          .maybeSingle();
        
        if (profile?.full_name) {
          setProfileName(profile.full_name);
        }
      } else {
        setProfileName(null);
      }

      // 2. Load documents
      const storedDocuments = await getDocuments();
      const exportedOnly = storedDocuments.filter((doc) => doc.status === 'EXPORTED');
      setDocuments(exportedOnly); 
      
      // Calculate true scan count for stats
      setScannedCount(exportedOnly.length);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments])
  );

  const handleImport = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsLoading(true);
        const uris = result.assets.map(asset => asset.uri);
        
        // Extract a clean name from the first asset if available
        let initialName = 'Imported Scan';
        if (result.assets[0].fileName) {
            initialName = result.assets[0].fileName.split('.')[0];
        } else {
            const uriParts = result.assets[0].uri.split('/');
            const lastPart = uriParts[uriParts.length - 1];
            initialName = lastPart.split('.')[0];
        }

        router.push({
          pathname: '/preview',
          params: { 
            imageUris: JSON.stringify(uris),
            initialName: initialName
          }
        });
      }
    } catch (e) {
      console.error('Import failed:', e);
      Alert.alert('Import Failed', 'Failed to select images from gallery.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderDocPreview = (item: Document) => {
    if (item.type === 'JPG') {
      return <Image source={{ uri: item.uri }} style={styles.cardImage} />;
    }

    return (
      <View style={styles.filePreview}>
        <View style={[styles.filePreviewIconBox, { backgroundColor: getDocumentColor(item.type) + '1A' }]}>
          {item.type === 'PDF' ? (
            <FileDigit size={52} color={getDocumentColor(item.type)} />
          ) : (
            <FileImage size={52} color={getDocumentColor(item.type)} />
          )}
        </View>
        <Text style={styles.filePreviewLabel}>{item.type} Export</Text>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <LinearGradient
        colors={Gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <SafeAreaView edges={['top']} style={styles.heroContent}>
            <View style={styles.heroTop}>
                <View style={styles.branding}>
                    <View style={styles.avatarMini}>
                        <Image
                            source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAfBc0Vi_rdQCuKwoKNyqyCimH3omQh4Ud8fn-7ave5ZbU-yzObqimAlPStmx-APqrt0CTjzv6Id-YDYJKU1vkO5P7LnkKBryvo0T3jreXyEN2BHSbIdajQCj9olPkFSDr1d_yJHiPJfYbH3yOZbH_M2UWsbwu9rpx5QygGRxl3H_YID3bJWtNJMpEC5GZtn9k5DdCPoF7wtcpl5W0KmmHKKlRIbF9QBQOcD-kMJKEDXfJi7k2IdI0Sycqpvin75Pwaw0joQPC0bg' }}
                            style={styles.avatarImg}
                        />
                    </View>
                    <Text style={styles.heroTitle}>
                      {profileName || (user ? (user.email?.split('@')[0] || 'Member') : 'Guest Mode')}
                    </Text>
                </View>
            </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Version Update Banner - Proof of update */}
      <View style={{ backgroundColor: '#2E7D32', padding: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}>
        <Text style={{ color: '#FFF', fontFamily: 'PlusJakartaSans-Bold', fontSize: 13 }}>
          LuminaScan v1.0.6 (Build 23:13:27) - Update Active ✅
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/scanner')}>
              <View style={[styles.actionIcon, { backgroundColor: '#E3F2FD' }]}>
                  <Camera size={24} color={Palette.primary} />
              </View>
              <Text style={styles.actionLabel}>Camera</Text>
          </Pressable>
          
          <Pressable style={styles.actionBtn} onPress={handleImport}>
              <View style={[styles.actionIcon, { backgroundColor: '#F3E5F5' }]}>
                  <ImageIcon size={24} color="#9C27B0" />
              </View>
              <Text style={styles.actionLabel}>Import</Text>
          </Pressable>
      </View>

      {/* Overlapping Stats Cards */}
      <View style={styles.statsGrid}>
        <Pressable style={styles.statsCard} onPress={() => router.push('/history')}>
          <Text style={styles.statsLabel}>Weekly Scans</Text>
          <View style={styles.statsValueRow}>
            <Text style={styles.statsValueMain}>{scannedCount}</Text>
            {scannedCount > 0 && <Text style={styles.statsValueTrend}>Active</Text>}
          </View>
        </Pressable>
        <Pressable style={styles.statsCard} onPress={() => router.push('/history')}>
          <Text style={styles.statsLabel}>Total Docs</Text>
          <View style={styles.statsValueRow}>
            <Text style={styles.statsValueMain}>{documents.length}</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Library</Text>
        <Pressable 
          onPress={() => router.push('/history')}
          style={styles.seeAllBtn}
        >
          <Text style={styles.seeAllText}>See All</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderDocItem = ({ item }: { item: Document }) => (
    <Pressable style={styles.docCard} onPress={() => void openDocument(item)}>
      <View style={styles.cardImageWrapper}>
        {renderDocPreview(item)}
        {item.status === 'DRAFT' ? (
          <View style={[styles.typeBadge, { backgroundColor: Palette.outlineVariant }]}>
            <Text style={styles.typeBadgeText}>SCANNED</Text>
          </View>
        ) : (
          <View style={[styles.typeBadge, { backgroundColor: getDocumentColor(item.type) }]}>
            <Text style={styles.typeBadgeText}>{item.type}</Text>
          </View>
        )}
        <View style={styles.pageCount}>
          <Text style={styles.pageCountText}>{item.pages} PGS</Text>
        </View>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.docName} numberOfLines={1}>
          {item.name}
          {item.status === 'DRAFT' && <Text style={{ color: Palette.outlineVariant }}> (Pending)</Text>}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{item.date} • {item.size}</Text>
          <Pressable hitSlop={8}>
            <MoreVertical size={16} color={Palette.outlineVariant} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderDocItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyLibraryState}>
              <ActivityIndicator color={Palette.primary} />
              <Text style={styles.emptyLibraryText}>Loading your library...</Text>
            </View>
          ) : (
            <View style={styles.emptyLibraryState}>
              <View style={styles.emptyIconBox}>
                <FileDigit size={40} color={Palette.outlineVariant} opacity={0.5} />
              </View>
              <Text style={styles.emptyLibraryTitle}>Your library is empty</Text>
              <Text style={styles.emptyLibraryText}>Start scanning to build your collection.</Text>
            </View>
          )
        }
      />

      <Pressable 
        style={({ pressed }) => [
            styles.fab,
            pressed && { transform: [{ scale: 0.95 }] }
        ]}
        onPress={() => router.push('/scanner')}
      >
        <LinearGradient
          colors={Gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Scanner size={32} color="#FFF" strokeWidth={2.5} />
          <View style={styles.fabHighlight} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  listContent: {
    paddingBottom: 140,
  },
  headerContainer: {
    marginBottom: 8,
  },
  hero: {
    height: 180,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroContent: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 0 : 12,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarMini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  heroTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: '#FFF',
    letterSpacing: -0.5,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 20,
      gap: 16,
  },
  actionBtn: {
      flex: 1,
      backgroundColor: Palette.surfaceContainerLowest,
      borderRadius: Radius.xxl,
      padding: 16,
      alignItems: 'center',
      ...Shadows.ambient,
      borderWidth: 1,
      borderColor: Palette.outlineVariant + '0D',
  },
  actionIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
  },
  actionLabel: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 14,
      color: Palette.onSurface,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 24,
    marginTop: -40,
    marginBottom: 16,
  },
  statsCard: {
    flex: 1,
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 20,
    ...Shadows.ambient,
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '1A',
  },
  statsLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    color: Palette.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  statsValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  statsValueMain: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 28,
    color: Palette.onSurface,
  },
  statsValueTrend: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: Palette.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 22,
    color: Palette.onSurface,
    letterSpacing: -0.5,
  },
  seeAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Palette.surfaceContainerLow,
  },
  seeAllText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 14,
    color: Palette.primary,
  },
  docCard: {
    backgroundColor: Palette.surfaceContainerLowest,
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: Radius.xxxl,
    padding: 12,
    ...Platform.select({
        ios: {
            shadowColor: Palette.onSurface,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.06,
            shadowRadius: 24,
        },
        android: {
            elevation: 4,
        }
    }),
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '0D',
  },
  cardImageWrapper: {
    height: 180,
    backgroundColor: Palette.surfaceContainerLow,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    opacity: 0.9,
  },
  filePreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  filePreviewIconBox: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePreviewLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: Palette.onSurfaceVariant,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  typeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
  },
  typeBadgeText: {
    color: '#FFF',
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  pageCount: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pageCountText: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 10,
    color: Palette.onSurface,
  },
  cardContent: {
    paddingTop: 16,
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  docName: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 17,
    color: Palette.onSurface,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  metaText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 12,
    color: Palette.onSurfaceVariant,
  },
  emptyLibraryState: {
    paddingTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Palette.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyLibraryTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: Palette.onSurface,
    marginBottom: 8,
  },
  emptyLibraryText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 32,
    right: 24,
    width: 72,
    height: 72,
    ...Shadows.accent,
  },
  fabGradient: {
    flex: 1,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  }
});
