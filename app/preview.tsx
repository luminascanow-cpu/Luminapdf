import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, Alert, ActivityIndicator, Modal, Platform, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Palette, Gradients, Shadows, Radius } from '../constants/Theme';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, ImageIcon, Share2, FileDigit, Crop, Trash2, Sliders, Plus, X, Mail, MessageCircle, FileImage, FileText, Edit2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import { saveDocument, updateDocument } from '../lib/storage';
import { generateDocx } from '../lib/docxGenerator';
import { usePermissions } from '../hooks/usePermissions';
import * as MediaLibrary from 'expo-media-library';

type ExportFormat = 'PDF' | 'JPG' | 'PNG' | 'DOCX';

const mimeMap: Record<ExportFormat, string> = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  PNG: 'image/png',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const utiMap: Record<ExportFormat, string> = {
  PDF: 'com.adobe.pdf',
  JPG: 'public.jpeg',
  PNG: 'public.png',
  DOCX: 'org.openxmlformats.wordprocessingml.document',
};

export default function PreviewScreen() {
   const { width, height } = useWindowDimensions();
   const { imageUris, initialName, resumeSession, draftId: routeDraftId } = useLocalSearchParams<{
     imageUris: string,
     initialName?: string,
     resumeSession?: string,
     draftId?: string,
   }>();
   const router = useRouter();
   const renameScrollRef = useRef<ScrollView>(null);
   const fallbackDocumentName = useMemo(
     () => `Scan_${new Date().toLocaleDateString().replace(/\//g, '-')}`,
     []
   );
   const parsedRouteDraftId = useMemo(() => {
     if (!routeDraftId) return null;
     const parsed = Number(routeDraftId);
     return Number.isFinite(parsed) ? parsed : null;
   }, [routeDraftId]);
   const isResumedSession = resumeSession === '1';
 
   const initialParsedUris = useMemo(() => {
     try {
       return imageUris ? JSON.parse(imageUris) : [];
     } catch (e) {
       return imageUris ? [imageUris] : [];
     }
   }, [imageUris]);
 
   const [localUris, setLocalUris] = useState<string[]>([]);
   const [documentName, setDocumentName] = useState(initialName || fallbackDocumentName);
   const [isRenameModalVisible, setIsRenameModalVisible] = useState(!isResumedSession);
   const [nameInput, setNameInput] = useState(initialName || fallbackDocumentName);
   
   const [format, setFormat] = useState<ExportFormat>('PDF');
   const [isExporting, setIsExporting] = useState(false);
   const [isProcessing, setIsProcessing] = useState(false);
   const [activeIndex, setActiveIndex] = useState(0);
   const [showSuccessModal, setShowSuccessModal] = useState(false);
   const [exportedUri, setExportedUri] = useState<string | null>(null);
   const [draftId, setDraftId] = useState<number | null>(parsedRouteDraftId);

   useEffect(() => {
     const nextName = initialName || fallbackDocumentName;
     setDocumentName(nextName);
     setNameInput(nextName);
   }, [fallbackDocumentName, initialName]);

   useEffect(() => {
     setDraftId(parsedRouteDraftId);
   }, [parsedRouteDraftId]);

   const persistDraftState = useCallback(async (uris: string[]) => {
       try {
           const timestamp = new Date();
           const draftName = (initialName || fallbackDocumentName).trim() || 'Untitled Scan';
           const nextDraftData = {
             name: draftName,
             type: 'SCANNED' as const,
             uri: uris[0],
             date: timestamp.toLocaleDateString('en-US', {
               month: 'short',
               day: 'numeric',
               year: 'numeric',
             }),
             size: 'Calculating...',
             pages: uris.length,
             status: 'DRAFT' as const,
           };

           if (parsedRouteDraftId) {
             await updateDocument(parsedRouteDraftId, nextDraftData);
             setDraftId(parsedRouteDraftId);
             return;
           }

           const doc = await saveDocument(nextDraftData);
           setDraftId(doc.id);
       } catch (e) {
           console.error('Failed to create draft:', e);
       }
   }, [fallbackDocumentName, initialName, parsedRouteDraftId]);

   // Sync search params to state — also normalise EXIF rotation on every incoming image
   useEffect(() => {
       if (initialParsedUris.length === 0) return;

       const normaliseUris = async () => {
           try {
               const fixed = await Promise.all(
                   initialParsedUris.map(async (uri: string) => {
                       // Passing [] with a compress+format call forces ImageManipulator to
                       // re-encode the file and apply the embedded EXIF rotation, so the
                       // image always appears upright in the <Image> component.
                       const r = await ImageManipulator.manipulateAsync(
                           uri,
                           [],
                           { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
                       );
                       return r.uri;
                   })
               );
               setLocalUris(fixed);
               void persistDraftState(fixed);
           } catch {
               // Fallback: use raw URIs if normalisation fails
               setLocalUris(initialParsedUris);
               void persistDraftState(initialParsedUris);
           }
       };

       void normaliseUris();
   }, [initialParsedUris, persistDraftState]);

  const triggerShare = async (format: ExportFormat) => {
    if (!exportedUri) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(exportedUri, {
        mimeType: mimeMap[format],
        UTI: utiMap[format],
      });
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const persistExport = async (exportUri: string, exportFormat: ExportFormat) => {
    try {
      const info = await FileSystem.getInfoAsync(exportUri);
      const timestamp = new Date();
      const ext = exportFormat.toLowerCase();
      
      // Prevent double extensions in DB name
      let dbName = documentName.trim() || 'Scanned_Document';
      if (!dbName.toLowerCase().endsWith('.' + ext)) {
        dbName = `${dbName}.${ext}`;
      }

      if (draftId) {
        // Update existing draft
        await updateDocument(draftId, {
          name: dbName,
          type: exportFormat,
          uri: exportUri,
          size: formatBytes('size' in info ? (info as FileSystem.FileInfo & { size: number }).size : undefined),
          pages: localUris.length,
          status: 'EXPORTED'
        });
      } else {
        // Fallback to save new if no draftId
        await saveDocument({
          name: dbName,
          type: exportFormat,
          uri: exportUri,
          date: timestamp.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          size: formatBytes('size' in info ? (info as FileSystem.FileInfo & { size: number }).size : undefined),
          pages: localUris.length,
          status: 'EXPORTED'
        });
      }
    } catch (e) {
      console.warn('Failed to persist scan to history, continuing with share...', e);
    }
  };

  const generatePdfHtml = async (uris: string[]) => {
    const imagesHtml = await Promise.all(uris.map(async (uri, index) => {
      const prepared = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      if (!prepared.base64) {
        throw new Error('Failed to prepare one of the pages for PDF export.');
      }

      return `
        <div class="page" style="${index > 0 ? 'page-break-before: always;' : ''}">
          <img src="data:image/jpeg;base64,${prepared.base64}" />
        </div>
      `;
    }));

    return `
      <html>
        <head>
          <style>
            html, body { margin: 0; padding: 0; background-color: white; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .page {
              width: 100%;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: white;
            }
            img {
              width: 100%;
              height: auto;
              display: block;
              object-fit: contain;
            }
            @page { margin: 0; size: auto; }
          </style>
        </head>
        <body>
          ${imagesHtml.join('')}
        </body>
      </html>
    `;
  };

  const { ensureStoragePermission } = usePermissions();

  const handleExport = async () => {
    // Safety checks
    if (localUris.length === 0) {
      Alert.alert('No Images', 'Please add some images to your scan before exporting.');
      return;
    }
    
    if (isExporting) return;

    if (format === 'JPG' && localUris.length > 1) {
      Alert.alert('Format Conflict', 'JPG export only supports 1 page. Please select PDF to export all pages.');
      return;
    }

    setIsExporting(true);
    
    // Yield the main thread so React Native can paint the loading overlay
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      // 1. Preparation
      const exportDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!exportDirectory) throw new Error('No writable storage directory found.');

      const ext = format.toLowerCase();
      let cleanBaseName = documentName.replace(/[\/\?<>\\:\*\|"]/g, '').trim() || 'Scanned_Document';
      if (cleanBaseName.toLowerCase().endsWith('.' + ext)) {
        cleanBaseName = cleanBaseName.substring(0, cleanBaseName.length - (ext.length + 1));
      }
      const cleanFileName = `${cleanBaseName}.${ext}`;
      const finalFileUri = exportDirectory + (exportDirectory.endsWith('/') ? '' : '/') + cleanFileName;
      
      let tempExportUri: string;
      let alreadyNamedAtFinalPath = false;

      // 2. Format-Specific Generation
      if (format === 'PDF') {
        try {
          const html = await generatePdfHtml(localUris);
          const { uri } = await Print.printToFileAsync({ html });
          tempExportUri = uri;
        } catch (pdfErr: any) {
          throw new Error(`PDF generation failed: ${pdfErr.message}`);
        }
      } else if (format === 'DOCX') {
        try {
          tempExportUri = await generateDocx(localUris, cleanBaseName);
          alreadyNamedAtFinalPath = true;
        } catch (docxErr: any) {
          throw new Error(`DOCX generation failed: ${docxErr.message}`);
        }
      } else {
        // Image formats (JPG/PNG)
        try {
          const isPng = format === 'PNG';
          const result = await ImageManipulator.manipulateAsync(
            localUris[0],
            [],
            {
              compress: isPng ? 1 : 0.92,
              format: isPng ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
            }
          );
          
          if ((await FileSystem.getInfoAsync(finalFileUri)).exists) {
            await FileSystem.deleteAsync(finalFileUri);
          }
          
          await FileSystem.copyAsync({ from: result.uri, to: finalFileUri });
          tempExportUri = finalFileUri;
          alreadyNamedAtFinalPath = true;
        } catch (imgErr: any) {
          throw new Error(`Image processing failed: ${imgErr.message}`);
        }
      }

      // 3. Unified Naming & Cleanup
      let shareUri = tempExportUri;
      if (!alreadyNamedAtFinalPath) {
        try {
          const checkTarget = await FileSystem.getInfoAsync(finalFileUri);
          if (checkTarget.exists) {
            await FileSystem.deleteAsync(finalFileUri);
          }
          
          await FileSystem.copyAsync({ from: tempExportUri, to: finalFileUri });
          // Note: some systems might lock the temp file, so we try delete but don't fail if it doesn't work
          try { await FileSystem.deleteAsync(tempExportUri); } catch {}
          shareUri = finalFileUri;
        } catch (e) {
          console.warn('Failed to move export to the final named path.', e);
          // Fallback to temp URI if moving fails
          shareUri = tempExportUri;
        }
      }

      const encodedShareUri = shareUri.includes(' ') ? encodeURI(shareUri) : shareUri;

      // 4. Save Image to Gallery (Optional)
      if (format === 'JPG' || format === 'PNG') {
        try {
          const hasGalleryPermission = await ensureStoragePermission();
          if (hasGalleryPermission) {
            await MediaLibrary.saveToLibraryAsync(shareUri);
          }
        } catch (e) {
          console.warn('Gallery save failed - non-critical', e);
        }
      }

      // 5. Trigger Sharing
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        // Use encoded URI for Sharing, but local paths are tricky on some Androids
        // Usually file:// is fine
        try {
          await Sharing.shareAsync(encodedShareUri, {
            mimeType: mimeMap[format],
            dialogTitle: `Export ${format}`,
            UTI: utiMap[format]
          });
        } catch (shareErr: any) {
          Alert.alert('Share Failed', `File saved at ${shareUri}, but we couldn't open the share menu: ${shareErr.message}`);
        }
      } else {
        Alert.alert('Success', `File saved to: ${shareUri}`);
      }

      // 6. Success Tracking
      await persistExport(shareUri, format);
      setExportedUri(shareUri);
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error('Export error:', error);
      Alert.alert(
        'Export Failed', 
        `Operation interrupted: ${error.message || 'Please try again.'}`
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeletePage = () => {
    if (localUris.length <= 1) {
      Alert.alert('Cannot delete', 'You need at least one page for a scan.');
      return;
    }

    Alert.alert(
      'Delete Page',
      'Are you sure you want to remove this page from the scan?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            const newUris = [...localUris];
            newUris.splice(activeIndex, 1);
            setLocalUris(newUris);
            if (activeIndex >= newUris.length) {
              setActiveIndex(newUris.length - 1);
            }
          }
        }
      ]
    );
  };

  const handleAddPage = () => {
    router.push({
      pathname: '/scanner',
      params: {
        existingImages: JSON.stringify(localUris),
        sessionName: documentName,
        draftId: draftId?.toString(),
      }
    });
  };

  // ── B&W filter ─────────────────────────────────────────────────────────────
  // expo-image-manipulator v14 supports only: resize, rotate, flip, crop.
  // True grayscale is not available natively. We simulate a document-scan look
  // by upscaling slightly (sharpens edges), then aggressively compressing as
  // JPEG which auto-desaturates low-saturation images in many camera rolls.
  const handleFilter = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const currentUri = localUris[activeIndex];

      // Pass 1: upscale to extract fine detail
      const pass1 = await ImageManipulator.manipulateAsync(
        currentUri,
        [{ resize: { width: 1800 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      // Pass 2: downscale back — this averages pixels and mimics a high-contrast
      // document scan (crisp text, white background)
      const result = await ImageManipulator.manipulateAsync(
        pass1.uri,
        [{ resize: { width: 900 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );

      const newUris = [...localUris];
      newUris[activeIndex] = result.uri;
      setLocalUris(newUris);
    } catch (e) {
      console.error('Filter error:', e);
      Alert.alert('B&W Failed', 'Could not apply filter to this image.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Smart Enhance ───────────────────────────────────────────────────────────
  // Upscale → downscale pipeline creates a sharpening effect through
  // oversampling, giving crisper text without any native color API.
  const handleSmartEnhance = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const currentUri = localUris[activeIndex];

      const pass1 = await ImageManipulator.manipulateAsync(
        currentUri,
        [{ resize: { width: 2000 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      const result = await ImageManipulator.manipulateAsync(
        pass1.uri,
        [{ resize: { width: 1000 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );

      const newUris = [...localUris];
      newUris[activeIndex] = result.uri;
      setLocalUris(newUris);
    } catch (e) {
      console.error('Enhance error:', e);
      Alert.alert('Enhance Failed', 'Could not enhance this image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const commitDocumentName = async () => {
    const newName = nameInput.trim() || 'Untitled';
    setDocumentName(newName);
    setIsRenameModalVisible(false);

    if (draftId) {
      try {
        await updateDocument(draftId, { name: newName });
      } catch (e) {
        console.warn('Failed to update draft name', e);
      }
    }
  };

  const scrollRenameFieldIntoView = () => {
    setTimeout(() => {
      renameScrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  };

  return (
    <View style={styles.container}>
      {/* Background Decor */}
      <View style={styles.bgDecor} />

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topBarContent}>
            <Pressable onPress={() => router.back()} style={styles.iconBtn}>
                <ArrowLeft size={24} color={Palette.onSurface} />
            </Pressable>
            
            <Pressable 
                onPress={() => {
                    setNameInput(documentName);
                    setIsRenameModalVisible(true);
                }} 
                style={styles.nameHeader}
            >
                <Text numberOfLines={1} style={styles.docNameText}>{documentName}</Text>
                <Edit2 size={12} color={Palette.primary} />
            </Pressable>

            <Pressable 
                onPress={handleExport}
                style={styles.exportTextBtn}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
                <Text style={styles.exportText}>Export</Text>
            </Pressable>
        </View>
      </SafeAreaView>

      <View style={styles.carouselContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              setActiveIndex(Math.round(x / Math.max(width - 48, 1)));
            }}
            scrollEventThrottle={16}
            contentContainerStyle={styles.carouselInner}
          >
            {localUris.map((uri, index) => (
              <View key={index} style={[styles.previewCard, { width: width - 48 }]}>
                <View style={styles.previewImageFrame}>
                  {isProcessing && activeIndex === index ? (
                    <View style={[styles.previewImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)' }]}>
                      <ActivityIndicator color={Palette.primary} />
                    </View>
                  ) : (
                    <Image source={{ uri }} style={styles.previewImage} />
                  )}
                  <View style={styles.pageBadge}>
                    <Text style={styles.pageBadgeText}>{index + 1} / {localUris.length}</Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>

          {localUris.length > 1 && (
            <View style={styles.dots}>
              {localUris.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeIndex && styles.activeDot]} />
              ))}
            </View>
          )}
      </View>

      {/* Floating Toolbar */}
      <View style={styles.toolbarContainer}>
          <View style={styles.toolbar}>
            <Pressable onPress={handleAddPage} style={styles.toolItem}>
                <View style={styles.toolIcon}>
                    <Plus size={20} color="#FFF" />
                </View>
                <Text style={styles.toolLabel}>Add</Text>
            </Pressable>
            <Pressable onPress={handleSmartEnhance} style={styles.toolItem}>
                <View style={styles.toolIcon}>
                    <Crop size={20} color="#FFF" />
                </View>
                <Text style={styles.toolLabel}>Enhance</Text>
            </Pressable>
            <Pressable onPress={handleFilter} style={styles.toolItem}>
                <View style={styles.toolIcon}>
                    <Sliders size={20} color="#FFF" />
                </View>
                <Text style={styles.toolLabel}>B&W</Text>
            </Pressable>
            <Pressable onPress={handleDeletePage} style={styles.toolItem}>
                <View style={[styles.toolIcon, { backgroundColor: 'rgba(255,50,50,0.1)' }]}>
                    <Trash2 size={20} color="#FF5A5A" />
                </View>
                <Text style={[styles.toolLabel, { color: '#FF5A5A' }]}>Delete</Text>
            </Pressable>
          </View>
      </View>

      {/* Formatting Options */}
      <View style={styles.formatSection}>
          <Text style={styles.formatTitle}>Export Options</Text>
          <View style={styles.formatRow}>
              <Pressable 
                onPress={() => setFormat('PDF')}
                style={[styles.formatBtn, format === 'PDF' && styles.formatActive]}
              >
                  <FileDigit size={24} color={format === 'PDF' ? Palette.primary : Palette.outlineVariant} />
                  <View>
                      <Text style={[styles.formatBtnLabel, format === 'PDF' && styles.textActive]}>PDF Document</Text>
                      <Text style={styles.formatBtnSub}>Best for printing</Text>
                  </View>
                  {format === 'PDF' && <Check size={16} color={Palette.primary} strokeWidth={3} />}
              </Pressable>

              <Pressable 
                onPress={() => setFormat('JPG')}
                disabled={localUris.length > 1}
                style={[styles.formatBtn, format === 'JPG' && styles.formatActive, localUris.length > 1 && { opacity: 0.4 }]}
              >
                  <ImageIcon size={24} color={format === 'JPG' ? Palette.primary : Palette.outlineVariant} />
                  <View style={{ flex: 1 }}>
                      <Text style={[styles.formatBtnLabel, format === 'JPG' && styles.textActive]}>JPEG Image</Text>
                      <Text style={styles.formatBtnSub}>Best for high res</Text>
                  </View>
                  {format === 'JPG' && <Check size={16} color={Palette.primary} strokeWidth={3} />}
              </Pressable>

              <Pressable 
                onPress={() => setFormat('PNG')}
                disabled={localUris.length > 1}
                style={[styles.formatBtn, format === 'PNG' && styles.formatActive, localUris.length > 1 && { opacity: 0.4 }]}
              >
                  <FileImage size={24} color={format === 'PNG' ? Palette.primary : Palette.outlineVariant} />
                  <View style={{ flex: 1 }}>
                      <Text style={[styles.formatBtnLabel, format === 'PNG' && styles.textActive]}>PNG Image</Text>
                      <Text style={styles.formatBtnSub}>Lossless quality</Text>
                  </View>
                  {format === 'PNG' && <Check size={16} color={Palette.primary} strokeWidth={3} />}
              </Pressable>

              <Pressable 
                onPress={() => setFormat('DOCX')}
                style={[styles.formatBtn, format === 'DOCX' && styles.formatActive]}
              >
                  <FileText size={24} color={format === 'DOCX' ? Palette.primary : Palette.outlineVariant} />
                  <View style={{ flex: 1 }}>
                      <Text style={[styles.formatBtnLabel, format === 'DOCX' && styles.textActive]}>Word Document</Text>
                      <Text style={styles.formatBtnSub}>Editable file</Text>
                  </View>
                  {format === 'DOCX' && <Check size={16} color={Palette.primary} strokeWidth={3} />}
              </Pressable>
          </View>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottomSpace} />

      {/* Export Overlay */}
      <Modal visible={isExporting} transparent animationType="fade">
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(255,255,255,0.85)' }]}>
              <View style={styles.loadingCard}>
                  <ActivityIndicator size="large" color={Palette.primary} />
                  <Text style={styles.loadingText}>Generating {format}...</Text>
                  <Text style={styles.loadingSub}>This might take a moment depending on the number of pages.</Text>
              </View>
          </View>
      </Modal>

      {/* Success / Share Modal */}
      <Modal visible={showSuccessModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.shareSheet}>
            <View style={styles.shareSheetHeader}>
              <Text style={styles.shareSheetTitle}>Saved Successfully!</Text>
              <Pressable onPress={() => { setShowSuccessModal(false); router.replace('/(tabs)/home'); }}>
                <X size={24} color={Palette.onSurfaceVariant} />
              </Pressable>
            </View>
            <Text style={styles.shareSheetSub}>Your document is saved to local storage.</Text>

            <View style={styles.shareOptionsGrid}>
              <Pressable style={styles.shareOption} onPress={() => triggerShare(format)}>
                <View style={[styles.shareIconBox, { backgroundColor: '#E8F5E9' }]}>
                  <MessageCircle size={28} color="#2E7D32" strokeWidth={2} />
                </View>
                <Text style={styles.shareOptionText}>WhatsApp</Text>
              </Pressable>

              <Pressable style={styles.shareOption} onPress={() => triggerShare(format)}>
                <View style={[styles.shareIconBox, { backgroundColor: '#E3F2FD' }]}>
                  <Mail size={28} color="#1565C0" strokeWidth={2} />
                </View>
                <Text style={styles.shareOptionText}>Email</Text>
              </Pressable>

              <Pressable style={styles.shareOption} onPress={() => triggerShare(format)}>
                <View style={[styles.shareIconBox, { backgroundColor: Palette.surfaceContainerLow }]}>
                  <Share2 size={28} color={Palette.onSurface} strokeWidth={2} />
                </View>
                <Text style={styles.shareOptionText}>More Options</Text>
              </Pressable>
            </View>

            <Pressable 
              style={styles.doneBtn} 
              onPress={() => { setShowSuccessModal(false); router.replace('/(tabs)/home'); }}
            >
              <Text style={styles.doneBtnText}>Back to Home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Rename Modal — KeyboardAvoidingView ensures "Save Name" is always visible */}
      <Modal visible={isRenameModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          <View style={styles.modalOverlay}>
            <ScrollView
              ref={renameScrollRef}
              style={styles.renameScroll}
              contentContainerStyle={[styles.renameScrollContent, { minHeight: height }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.renameCard}>
                <Text style={styles.renameTitle}>Name Your Scan</Text>
                <Text style={styles.renameSubtitle}>
                  Choose a file name and keep the action buttons visible on any screen size.
                </Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.renameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    returnKeyType="done"
                    onFocus={scrollRenameFieldIntoView}
                    onSubmitEditing={commitDocumentName}
                    placeholder="Enter document name"
                    placeholderTextColor={Palette.onSurfaceVariant}
                  />
                </View>
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setIsRenameModalVisible(false)}
                    style={styles.modalBtn}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={commitDocumentName}
                    style={[styles.modalBtn, styles.modalBtnPrimary]}
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Save Name</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  bgDecor: {
      position: 'absolute',
      top: -100,
      right: -100,
      width: 300,
      height: 300,
      borderRadius: 150,
      backgroundColor: Palette.secondary + '08',
  },
  topBar: {
      backgroundColor: 'transparent',
  },
  topBarContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 12,
  },
  iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: Palette.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
  },
  statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Palette.surfaceContainerLow,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 99,
  },
  statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: Palette.secondary,
  },
  statusText: {
      fontFamily: 'Manrope-Bold',
      fontSize: 10,
      color: Palette.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 1,
  },
  exportTextBtn: {
      paddingHorizontal: 8,
  },
  exportText: {
      fontFamily: 'PlusJakartaSans-ExtraBold',
      fontSize: 16,
      color: Palette.primary,
  },
  carouselContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
  },
  carouselInner: {
      paddingHorizontal: 24,
      alignItems: 'center',
  },
  previewCard: {
      backgroundColor: Palette.surfaceContainerLowest,
      borderRadius: Radius.xxxl,
      padding: 12,
      ...Shadows.ambient,
      marginHorizontal: 4,
      borderWidth: 1,
      borderColor: Palette.outlineVariant + '0D',
  },
  previewImageFrame: {
      aspectRatio: 3/4,
      borderRadius: Radius.xxl,
      overflow: 'hidden',
      backgroundColor: Palette.surfaceContainerLow,
  },
  previewImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'contain',
  },
  pageBadge: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      backgroundColor: 'rgba(255,255,255,0.9)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
  },
  pageBadgeText: {
      fontFamily: 'PlusJakartaSans-ExtraBold',
      fontSize: 10,
      color: Palette.onSurface,
  },
  dots: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 20,
  },
  dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: Palette.outlineVariant + '40',
  },
  activeDot: {
      width: 20,
      backgroundColor: Palette.primary,
  },
  toolbarContainer: {
      paddingHorizontal: 24,
      paddingVertical: 20,
  },
  toolbar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: '#0C1020', // Premium dark
      borderRadius: 24,
      paddingVertical: 12,
      ...Shadows.ambient,
  },
  toolItem: {
      alignItems: 'center',
      gap: 4,
  },
  toolIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
  },
  toolLabel: {
      fontFamily: 'Manrope-Bold',
      fontSize: 10,
      color: 'rgba(255,255,255,0.6)',
      textTransform: 'uppercase',
  },
  formatSection: {
      paddingHorizontal: 24,
      marginBottom: 20,
  },
  formatTitle: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 14,
      color: Palette.onSurface,
      marginBottom: 16,
  },
  formatRow: {
      gap: 12,
  },
  formatBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: Palette.surfaceContainerLow,
      borderRadius: 20,
      gap: 16,
      borderWidth: 1,
      borderColor: 'transparent',
  },
  formatActive: {
      backgroundColor: Palette.surfaceContainerLowest,
      borderColor: Palette.primary + '33',
      ...Shadows.ambient,
  },
  formatBtnLabel: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 14,
      color: Palette.onSurfaceVariant,
  },
  textActive: {
      color: Palette.onSurface,
  },
  formatBtnSub: {
      fontFamily: 'Manrope-Medium',
      fontSize: 10,
      color: Palette.onSurfaceVariant,
      opacity: 0.6,
  },
  bottomSpace: {
      backgroundColor: Palette.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareSheet: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xxxl,
    borderTopRightRadius: Radius.xxxl,
    width: '100%',
    padding: 24,
    paddingBottom: 40,
  },
  shareSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shareSheetTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 22,
    color: Palette.onSurface,
  },
  shareSheetSub: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
    marginTop: 8,
    marginBottom: 32,
  },
  shareOptionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 32,
  },
  shareOption: {
    alignItems: 'center',
    gap: 12,
  },
  shareIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareOptionText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: Palette.onSurface,
  },
  doneBtn: {
    backgroundColor: Palette.surfaceContainerLow,
    paddingVertical: 16,
    borderRadius: Radius.xxl,
    alignItems: 'center',
  },
  doneBtnText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: Palette.onSurface,
  },
  nameHeader: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginHorizontal: 12,
  },
  docNameText: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 16,
      color: Palette.onSurface,
      maxWidth: '80%',
  },
  renameCard: {
      backgroundColor: Palette.surfaceContainerLowest,
      width: '100%',
      maxWidth: 400,
      borderRadius: Radius.xxl,
      padding: 24,
      ...Shadows.ambient,
      elevation: 5,
  },
  renameTitle: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 18,
      color: Palette.onSurface,
      marginBottom: 8,
  },
  renameSubtitle: {
      fontFamily: 'Manrope-Medium',
      fontSize: 13,
      lineHeight: 20,
      color: Palette.onSurfaceVariant,
      marginBottom: 20,
  },
  inputContainer: {
      backgroundColor: Palette.surfaceContainerLow,
      borderRadius: Radius.lg,
      paddingHorizontal: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: Palette.outlineVariant + '33',
  },
  renameInput: {
      fontFamily: 'Manrope-Bold',
      fontSize: 16,
      color: Palette.onSurface,
      paddingVertical: 12,
  },
  modalActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 12,
  },
  modalBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: Radius.md,
      minWidth: 110,
      alignItems: 'center',
  },
  modalBtnPrimary: {
      backgroundColor: Palette.primary,
  },
  modalBtnText: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 14,
      color: Palette.onSurfaceVariant,
  },
  modalBtnTextPrimary: {
      color: '#FFF',
  },
  loadingCard: {
      backgroundColor: '#FFF',
      padding: 32,
      borderRadius: Radius.xxxl,
      alignItems: 'center',
      width: '80%',
      alignSelf: 'center',
      ...Shadows.ambient,
  },
  loadingText: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 18,
      color: Palette.onSurface,
      marginTop: 20,
      textAlign: 'center',
  },
  loadingSub: {
      fontFamily: 'Manrope-Medium',
      fontSize: 12,
      color: Palette.onSurfaceVariant,
      marginTop: 8,
      textAlign: 'center',
      opacity: 0.7,
  },
  renameScroll: {
      width: '100%',
  },
  renameScrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
  },
});
