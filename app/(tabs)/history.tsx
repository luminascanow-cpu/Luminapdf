import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Platform, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Palette, Radius, Shadows } from '../../constants/Theme';
import { ChevronLeft, FileImage, FileDigit, FileText, Trash2, LayoutGrid, List } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Document, getDocuments, deleteDocument } from '../../lib/storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

const { width } = Dimensions.get('window');

const getDocumentColor = (type: string) => {
  switch (type) {
    case 'PDF':
      return Palette.secondary;
    case 'JPG':
      return Palette.tertiary;
    case 'TXT':
      return '#7986CB';
    default:
      return Palette.primary;
  }
};

export default function HistoryScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocs, setFilteredDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'PDF' | 'JPG' | 'TXT'>('ALL');

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const storedDocuments = await getDocuments();
      // Only show exported (converted) documents
      const exportedOnly = storedDocuments.filter(d => d.status === 'EXPORTED');
      setDocuments(exportedOnly);
      applyFilters(exportedOnly, activeFilter);
    } catch (error) {
      console.error('Failed to load documents:', error);
      setDocuments([]);
      setFilteredDocs([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter]);

  useFocusEffect(
    useCallback(() => {
      void loadDocuments();
    }, [loadDocuments])
  );

  const applyFilters = (docs: Document[], filter: string) => {
    let result = docs;
    if (filter !== 'ALL') {
      result = result.filter(doc => doc.type === filter);
    }
    setFilteredDocs(result);
  };

  const onFilterChange = (filter: 'ALL' | 'PDF' | 'JPG' | 'TXT') => {
    setActiveFilter(filter);
    applyFilters(documents, filter);
  };

  const openDocument = async (doc: Document) => {
    try {
      if (!doc.uri) {
        Alert.alert('File Missing', 'This scan does not have a valid file path.');
        return;
      }

      const info = await FileSystem.getInfoAsync(doc.uri);

      if (!info.exists) {
        Alert.alert('File Missing', 'This scan is no longer available on your device.');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(doc.uri, {
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

  const handleDelete = async (id: number, name: string) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDocument(id);
              await loadDocuments();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete the document.');
            }
          }
        }
      ]
    );
  };

  const renderDocPreview = (item: Document) => {
    return (
      <View style={styles.filePreview}>
        <View style={[styles.filePreviewIconBox, { backgroundColor: getDocumentColor(item.type) + '1A' }]}>
          {item.type === 'PDF' ? (
            <FileDigit size={40} color={getDocumentColor(item.type)} />
          ) : item.type === 'TXT' ? (
            <FileText size={40} color={getDocumentColor(item.type)} />
          ) : (
            <FileImage size={40} color={getDocumentColor(item.type)} />
          )}
        </View>
      </View>
    );
  };

  const renderDocItem = ({ item }: { item: Document }) => {
    const isGrid = viewMode === 'grid';
    
    return (
      <Pressable 
        style={[isGrid ? styles.docCardGrid : styles.docCardList]}
        onPress={() => void openDocument(item)}
        onLongPress={() => handleDelete(item.id, item.name)}
      >
        <View style={[isGrid ? styles.cardImageWrapperGrid : styles.cardImageWrapperList]}>
          {renderDocPreview(item)}
          <View style={[styles.typeBadge, { backgroundColor: getDocumentColor(item.type) }]}>
            <Text style={styles.typeBadgeText}>{item.type}</Text>
          </View>
        </View>
        
        <View style={styles.cardContent}>
          <Text style={styles.docName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.metaText}>{item.date} • {item.size}</Text>
          <View style={styles.cardActions}>
            <Text style={styles.pageCountText}>{item.pages} PGS</Text>
            <Pressable onPress={() => handleDelete(item.id, item.name)}>
              <Trash2 size={16} color={Palette.error} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={Palette.onSurface} strokeWidth={2.5} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>My Scans</Text>
            <Pressable style={styles.closeBtn} onPress={() => router.replace('/')}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.headerTools}>
            <Pressable style={styles.toolBtn} onPress={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}>
              {viewMode === 'grid' ? <List size={20} color={Palette.onSurfaceVariant} /> : <LayoutGrid size={20} color={Palette.onSurfaceVariant} />}
            </Pressable>
          </View>
        </View>

        <View style={styles.filterRow}>
          {(['ALL', 'PDF', 'JPG', 'TXT'] as const).map((filter) => (
            <Pressable
              key={filter}
              style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
              onPress={() => onFilterChange(filter)}
            >
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
                {filter}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={Palette.primary} size="large" />
          <Text style={styles.statusText}>Loading your scans...</Text>
        </View>
      ) : filteredDocs.length > 0 ? (
        <FlatList
          key={viewMode} // Force re-render on orientation change
          data={filteredDocs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDocItem}
          numColumns={viewMode === 'grid' ? 2 : 1}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={viewMode === 'grid' ? styles.columnWrapper : undefined}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.centerBox}>
          <View style={styles.emptyIconBox}>
            <FileDigit size={48} color={Palette.outlineVariant} opacity={0.3} />
          </View>
          <Text style={styles.emptyTitle}>No Local Scans</Text>
          <Text style={styles.emptyText}>
            All your successfully completed scans will appear here automatically.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  header: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: Palette.outlineVariant + '1A',
    paddingBottom: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: Palette.onSurface,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Palette.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '1A',
  },
  closeBtnText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: Palette.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTools: {
    flexDirection: 'row',
    gap: 12,
  },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Palette.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '1A',
  },
  filterChipActive: {
    backgroundColor: Palette.primary,
    borderColor: Palette.primary,
  },
  filterText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 13,
    color: Palette.onSurfaceVariant,
  },
  filterTextActive: {
    color: '#FFF',
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  docCardGrid: {
    backgroundColor: Palette.surfaceContainerLowest,
    width: (width - 60) / 2,
    marginBottom: 20,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '0D',
    ...Shadows.ambient,
  },
  docCardList: {
    backgroundColor: Palette.surfaceContainerLowest,
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: Radius.xl,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '0D',
    ...Shadows.ambient,
  },
  cardImageWrapperGrid: {
    height: 140,
    backgroundColor: Palette.surfaceContainerLow,
  },
  cardImageWrapperList: {
    width: 70,
    height: 70,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surfaceContainerLow,
    overflow: 'hidden',
    marginRight: 16,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  filePreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePreviewIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#FFF',
    fontFamily: 'Manrope-Bold',
    fontSize: 8,
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  docName: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: Palette.onSurface,
  },
  metaText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 11,
    color: Palette.onSurfaceVariant,
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  pageCountText: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 10,
    color: Palette.outlineVariant,
    textTransform: 'uppercase',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  statusText: {
    marginTop: 16,
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
  },
  emptyIconBox: {
    marginBottom: 20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Palette.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    color: Palette.onSurface,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  }
});
