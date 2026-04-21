import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { Palette, Radius, Shadows } from '../../constants/Theme';
import { Search as SearchIcon, X, Clock, Tag } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SearchScreen() {
  const [query, setQuery] = useState('');

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.searchBar}>
          <SearchIcon size={20} color={Palette.onSurfaceVariant} />
          <TextInput
            placeholder="Search documents, text, tags..."
            placeholderTextColor={Palette.onSurfaceVariant + '80'}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <X size={18} color={Palette.onSurfaceVariant} />
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Searches</Text>
          <View style={styles.recentList}>
            {/* Real search history would be mapped here */}
            <View style={styles.emptyRecent}>
              <Clock size={16} color={Palette.onSurfaceVariant} opacity={0.5} />
              <Text style={styles.emptyRecentText}>Your search history will appear here.</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Categories</Text>
          <View style={styles.chipGrid}>
            <View style={styles.chip}>
                <Tag size={14} color={Palette.primary} />
                <Text style={styles.chipText}>Financial</Text>
            </View>
            <View style={styles.chip}>
                <Tag size={14} color={Palette.primary} />
                <Text style={styles.chipText}>Personal</Text>
            </View>
            <View style={styles.chip}>
                <Tag size={14} color={Palette.primary} />
                <Text style={styles.chipText}>Travel</Text>
            </View>
            <View style={styles.chip}>
                <Tag size={14} color={Palette.primary} />
                <Text style={styles.chipText}>Work</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: Palette.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surfaceContainerLow,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '1A',
  },
  input: {
    flex: 1,
    fontFamily: 'Manrope-Medium',
    fontSize: 16,
    color: Palette.onSurface,
  },
  content: {
    paddingHorizontal: 24,
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: Palette.onSurface,
    marginBottom: 16,
  },
  recentList: {
    gap: 12,
  },
  emptyRecent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.surfaceContainerLow + '40',
    padding: 16,
    borderRadius: Radius.xl,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: Palette.outlineVariant + '33',
  },
  emptyRecentText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
    opacity: 0.7,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.surfaceContainerLowest,
    padding: 16,
    borderRadius: Radius.xl,
    ...Shadows.ambient,
  },
  recentText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 15,
    color: Palette.onSurfaceVariant,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Palette.surfaceContainerLow,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  chipText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 13,
    color: Palette.onSurface,
  }
});
