import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, Alert, ActivityIndicator, Modal, Platform, KeyboardAvoidingView, useWindowDimensions, PanResponder } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Palette, Gradients, Shadows, Radius } from '../constants/Theme';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, ImageIcon, Share2, FileDigit, Crop, Trash2, Plus, X, Mail, MessageCircle, FileImage, FileText, Edit2, PenTool, RotateCcw } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextInput } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import Svg, { Path } from 'react-native-svg';
import { saveDocument, updateDocument } from '../lib/storage';
import { usePermissions } from '../hooks/usePermissions';
import * as MediaLibrary from 'expo-media-library';
import { extractTextFromImages } from '../lib/textExtractor';
import { FREE_PAGE_LIMIT, getUsageGateState } from '../lib/paymentGate';
import { UpgradeRequiredModal } from '../components/UpgradeRequiredModal';

type ExportFormat = 'PDF' | 'JPG' | 'PNG' | 'TXT';
type SignaturePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};
const mimeMap: Record<ExportFormat, string> = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  PNG: 'image/png',
  TXT: 'text/plain',
};

const utiMap: Record<ExportFormat, string> = {
  PDF: 'com.adobe.pdf',
  JPG: 'public.jpeg',
  PNG: 'public.png',
  TXT: 'public.plain-text',
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
   const [isReviewModalVisible, setIsReviewModalVisible] = useState(false);
   const [isSignatureModalVisible, setIsSignatureModalVisible] = useState(false);
   const [signaturePath, setSignaturePath] = useState('');
   const [signatureDraftPath, setSignatureDraftPath] = useState('');
   const [signaturePlacements, setSignaturePlacements] = useState<Record<number, SignaturePlacement>>({});
   const [reviewFrameSize, setReviewFrameSize] = useState({ width: 0, height: 0 });
   const isTxtExtractionAvailable = Platform.OS === 'android';
   const [upgradeMessage, setUpgradeMessage] = useState('');
   const [isUpgradeModalVisible, setIsUpgradeModalVisible] = useState(false);
   const signaturePathRef = useRef('');
   const signatureDragOriginRef = useRef<SignaturePlacement | null>(null);
   const signatureTouchOffsetRef = useRef({ x: 0, y: 0 });

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

   // Sync search params to state without re-encoding the full document on every reopen.
   // Scanner/import paths already provide prepared image URIs, and reprocessing here
   // both slows down resumed sessions and compounds JPEG quality loss.
   useEffect(() => {
       if (initialParsedUris.length === 0) return;
       setLocalUris(initialParsedUris);
       void persistDraftState(initialParsedUris);
   }, [initialParsedUris, persistDraftState]);

   useEffect(() => {
     if (activeIndex < localUris.length) return;
     setActiveIndex(Math.max(0, localUris.length - 1));
   }, [activeIndex, localUris.length]);

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

  const encodeImageForPdf = async (uri: string) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (base64) {
        return base64;
      }
    } catch (readError) {
      console.warn('Direct PDF image read failed, falling back to conversion.', readError);
    }

    const prepared = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1000 } }],
      {
        compress: 0.58,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );

    if (!prepared.base64) {
      throw new Error('Failed to prepare one of the pages for PDF export.');
    }

    return prepared.base64;
  };

  const generatePdfHtml = async (uris: string[]) => {
    const imagesHtml = await Promise.all(uris.map(async (uri, index) => {
      const base64 = await encodeImageForPdf(uri);
      const signatureMarkup = signaturePath && signaturePlacements[index]
        ? `
        <div
          style="
            position:absolute;
            left:${(signaturePlacements[index].x * 100).toFixed(2)}%;
            top:${(signaturePlacements[index].y * 100).toFixed(2)}%;
            width:${(signaturePlacements[index].width * 100).toFixed(2)}%;
            height:${(signaturePlacements[index].height * 100).toFixed(2)}%;
          "
        >
          <svg viewBox="0 0 320 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            <path d="${signaturePath.replace(/"/g, '&quot;')}" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>`
        : '';

      return `
        <div class="page" style="${index > 0 ? 'page-break-before: always;' : ''}">
          <img src="data:image/jpeg;base64,${base64}" />
          ${signatureMarkup}
        </div>
      `;
    }));

    return `
      <html>
        <head>
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              background-color: white;
            }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .page {
              width: 100vw;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: white;
              position: relative;
              overflow: hidden;
              page-break-inside: avoid;
            }
            img {
              max-width: 100%;
              max-height: 100%;
              width: auto;
              height: auto;
              object-fit: contain;
              display: block;
            }
            @page {
              size: A4 portrait;
              margin: 0;
            }
          </style>
        </head>
        <body>
          ${imagesHtml.join('')}
        </body>
      </html>
    `;
  };

  const { ensureStoragePermission } = usePermissions();
  const exportLabel = format === 'TXT' ? 'Extracted Text' : format;

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

    if (format === 'TXT' && !isTxtExtractionAvailable) {
      Alert.alert('Unavailable', 'Text extraction is currently available on Android only.');
      return;
    }

    if (signaturePath && format !== 'PDF') {
      Alert.alert('PDF Required', 'Signed documents can currently be exported as PDF only.');
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
      } else if (format === 'TXT') {
        try {
          const extraction = await extractTextFromImages(localUris);
          const extractedText = extraction.text.trim();

          if (!extractedText) {
            throw new Error('No readable text was found in this scan.');
          }

          if ((await FileSystem.getInfoAsync(finalFileUri)).exists) {
            await FileSystem.deleteAsync(finalFileUri);
          }

          await FileSystem.writeAsStringAsync(finalFileUri, extractedText, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          tempExportUri = finalFileUri;
          alreadyNamedAtFinalPath = true;
        } catch (textErr: any) {
          throw new Error(`Text extraction failed: ${textErr.message}`);
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
            dialogTitle: `Export ${exportLabel}`,
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

  const handleAddPage = async () => {
    const usage = await getUsageGateState();
    if (!usage.isUnlocked && localUris.length >= FREE_PAGE_LIMIT) {
      setUpgradeMessage(`Free access allows up to ${FREE_PAGE_LIMIT} pages in one scan session.`);
      setIsUpgradeModalVisible(true);
      return;
    }

    router.push({
      pathname: '/scanner',
      params: {
        existingImages: JSON.stringify(localUris),
        sessionName: documentName,
        draftId: draftId?.toString(),
      }
    });
  };

  const replaceActivePage = (nextUri: string) => {
    const nextUris = [...localUris];
    nextUris[activeIndex] = nextUri;
    setLocalUris(nextUris);
  };

  const createDocumentCleanupPass = async (uri: string, width: number, compress: number) => {
    return ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width } }],
      {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
  };

  // ── B&W / document cleanup ────────────────────────────────────────────────
  // Expo's built-in manipulator does not offer a true grayscale or threshold
  // filter, so we lean into a stronger document-style cleanup pass instead:
  // oversample, average back down, and strip color detail through multiple
  // JPEG passes. The result is intentionally more obvious than the previous
  // subtle effect and works well on text-heavy scans.
  const handleFilter = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const currentUri = localUris[activeIndex];
      const pass1 = await createDocumentCleanupPass(currentUri, 2200, 0.7);
      const pass2 = await createDocumentCleanupPass(pass1.uri, 1400, 0.38);
      const result = await createDocumentCleanupPass(pass2.uri, 1100, 0.22);
      replaceActivePage(result.uri);
    } catch (e) {
      console.error('Filter error:', e);
      Alert.alert('B&W Failed', 'Could not apply the document cleanup effect to this image.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Smart Enhance ───────────────────────────────────────────────────────────
  // A stronger multi-pass oversampling pass helps text edges feel cleaner and
  // more intentional than the original one-pass resize.
  const handleSmartEnhance = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const currentUri = localUris[activeIndex];
      const pass1 = await createDocumentCleanupPass(currentUri, 2600, 0.92);
      const pass2 = await createDocumentCleanupPass(pass1.uri, 1700, 0.82);
      const result = await createDocumentCleanupPass(pass2.uri, 1200, 0.9);
      replaceActivePage(result.uri);
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

  const setPlacementForPage = useCallback((pageIndex: number, nextPlacement: SignaturePlacement) => {
    setSignaturePlacements((current) => ({
      ...current,
      [pageIndex]: nextPlacement,
    }));
  }, []);

  const getDefaultSignaturePlacement = useCallback((): SignaturePlacement => ({
    x: 0.36,
    y: 0.76,
    width: 0.28,
    height: 0.12,
  }), []);

  const applySignatureToActivePage = useCallback(() => {
    if (!signaturePath) return;

    setPlacementForPage(activeIndex, signaturePlacements[activeIndex] || getDefaultSignaturePlacement());
    setIsReviewModalVisible(true);
  }, [activeIndex, getDefaultSignaturePlacement, setPlacementForPage, signaturePath, signaturePlacements]);

  const recenterActiveSignature = useCallback(() => {
    if (!signaturePath) return;
    setPlacementForPage(activeIndex, getDefaultSignaturePlacement());
  }, [activeIndex, getDefaultSignaturePlacement, setPlacementForPage, signaturePath]);

  const removeSignatureFromActivePage = useCallback(() => {
    setSignaturePlacements((current) => {
      const next = { ...current };
      delete next[activeIndex];
      return next;
    });
  }, [activeIndex]);

  const resizeActiveSignature = useCallback((delta: number) => {
    const currentPlacement = signaturePlacements[activeIndex];
    if (!currentPlacement) return;

    const nextWidth = Math.min(Math.max(0.18, currentPlacement.width + delta), 0.55);
    const aspectRatio = currentPlacement.height / currentPlacement.width;
    const nextHeight = Math.min(Math.max(0.08, nextWidth * aspectRatio), 0.24);
    const nextX = Math.min(currentPlacement.x, 1 - nextWidth - 0.04);
    const nextY = Math.min(currentPlacement.y, 1 - nextHeight - 0.05);

    setPlacementForPage(activeIndex, {
      ...currentPlacement,
      x: Math.max(0.04, nextX),
      y: Math.max(0.05, nextY),
      width: nextWidth,
      height: nextHeight,
    });
  }, [activeIndex, setPlacementForPage, signaturePlacements]);

  const clearSignatureDraft = () => {
    signaturePathRef.current = '';
    setSignatureDraftPath('');
  };

  const saveSignature = () => {
    if (!signatureDraftPath.trim()) {
      Alert.alert('Signature Needed', 'Please draw your signature before saving it.');
      return;
    }

    setSignaturePath(signatureDraftPath);
    setIsSignatureModalVisible(false);
    setPlacementForPage(activeIndex, signaturePlacements[activeIndex] || getDefaultSignaturePlacement());
    setIsReviewModalVisible(true);
  };

  const handleSignaturePress = () => {
    if (signaturePath) {
      applySignatureToActivePage();
      return;
    }

    clearSignatureDraft();
    setIsSignatureModalVisible(true);
  };

  const handleOpenReview = () => {
    if (localUris.length === 0) return;
    setIsReviewModalVisible(true);
  };

  const signaturePadResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      const start = `${signaturePathRef.current ? ' ' : ''}M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
      signaturePathRef.current += start;
      setSignatureDraftPath(signaturePathRef.current);
    },
    onPanResponderMove: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      signaturePathRef.current += ` L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
      setSignatureDraftPath(signaturePathRef.current);
    },
  }), []);

  const reviewSignatureResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(signaturePlacements[activeIndex]),
    onMoveShouldSetPanResponder: () => Boolean(signaturePlacements[activeIndex]),
    onStartShouldSetPanResponderCapture: () => Boolean(signaturePlacements[activeIndex]),
    onMoveShouldSetPanResponderCapture: () => Boolean(signaturePlacements[activeIndex]),
    onPanResponderGrant: (event) => {
      const currentPlacement = signaturePlacements[activeIndex] || null;
      signatureDragOriginRef.current = currentPlacement;
      if (!currentPlacement) return;

      const reviewWidth = Math.max(reviewFrameSize.width, 1);
      const reviewHeight = Math.max(reviewFrameSize.height, 1);
      const touchX = event.nativeEvent.locationX / reviewWidth;
      const touchY = event.nativeEvent.locationY / reviewHeight;

      signatureTouchOffsetRef.current = {
        x: touchX - currentPlacement.x,
        y: touchY - currentPlacement.y,
      };
    },
    onPanResponderMove: (event) => {
      const currentPlacement = signatureDragOriginRef.current || signaturePlacements[activeIndex];
      if (!currentPlacement) return;

      const reviewWidth = Math.max(reviewFrameSize.width, 1);
      const reviewHeight = Math.max(reviewFrameSize.height, 1);
      const touchX = event.nativeEvent.locationX / reviewWidth;
      const touchY = event.nativeEvent.locationY / reviewHeight;
      const nextX = Math.min(
        Math.max(0, touchX - signatureTouchOffsetRef.current.x),
        1 - currentPlacement.width
      );
      const nextY = Math.min(
        Math.max(0, touchY - signatureTouchOffsetRef.current.y),
        1 - currentPlacement.height
      );

      setPlacementForPage(activeIndex, {
        ...currentPlacement,
        x: nextX,
        y: nextY,
      });
    },
    onPanResponderRelease: () => {
      signatureDragOriginRef.current = null;
      signatureTouchOffsetRef.current = { x: 0, y: 0 };
    },
    onPanResponderTerminate: () => {
      signatureDragOriginRef.current = null;
      signatureTouchOffsetRef.current = { x: 0, y: 0 };
    },
  }), [activeIndex, reviewFrameSize.height, reviewFrameSize.width, setPlacementForPage, signaturePlacements]);

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
              setActiveIndex(Math.round(x / Math.max(width - 24, 1)));
            }}
            scrollEventThrottle={16}
            contentContainerStyle={styles.carouselInner}
          >
            {localUris.map((uri, index) => (
              <View key={index} style={[styles.previewCard, { width: width - 24 }]}>
                <Pressable style={styles.previewImageFrame} onPress={handleOpenReview}>
                  {isProcessing && activeIndex === index ? (
                    <View style={[styles.previewImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }]}>
                      <ActivityIndicator color={Palette.primary} />
                    </View>
                  ) : (
                    <Image source={{ uri }} style={styles.previewImage} />
                  )}
                  <View style={styles.pageBadge}>
                    <Text style={styles.pageBadgeText}>{index + 1} / {localUris.length}</Text>
                  </View>
                  {signaturePath && signaturePlacements[index] ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.signatureOverlay,
                        {
                          left: `${signaturePlacements[index].x * 100}%`,
                          top: `${signaturePlacements[index].y * 100}%`,
                          width: `${signaturePlacements[index].width * 100}%`,
                          height: `${signaturePlacements[index].height * 100}%`,
                        },
                      ]}
                    >
                      <Svg width="100%" height="100%" viewBox="0 0 320 120">
                        <Path d={signaturePath} fill="none" stroke="#111827" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                  ) : null}
                  <View style={styles.tapHint}>
                    <Text style={styles.tapHintText}>Tap to review full page</Text>
                  </View>
                </Pressable>
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
            <Pressable onPress={() => void handleAddPage()} style={styles.toolItem}>
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
            <Pressable onPress={handleSignaturePress} style={styles.toolItem}>
                <View style={styles.toolIcon}>
                    <PenTool size={20} color="#FFF" />
                </View>
                <Text style={styles.toolLabel}>Sign</Text>
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
                onPress={() => {
                  if (!isTxtExtractionAvailable) {
                    Alert.alert('Unavailable', 'Text extraction is currently available on Android only.');
                    return;
                  }
                  setFormat('TXT');
                }}
                style={[styles.formatBtn, format === 'TXT' && styles.formatActive, !isTxtExtractionAvailable && { opacity: 0.45 }]}
              >
                  <FileText size={24} color={format === 'TXT' ? Palette.primary : Palette.outlineVariant} />
                  <View style={{ flex: 1 }}>
                      <Text style={[styles.formatBtnLabel, format === 'TXT' && styles.textActive]}>Extract content from PDF</Text>
                      <Text style={styles.formatBtnSub}>
                        {isTxtExtractionAvailable ? 'Save OCR text as .txt' : 'Android only'}
                      </Text>
                  </View>
                  {format === 'TXT' && <Check size={16} color={Palette.primary} strokeWidth={3} />}
              </Pressable>
          </View>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottomSpace} />

      <Modal visible={isReviewModalVisible} transparent animationType="slide">
        <View style={styles.reviewOverlay}>
          <SafeAreaView style={styles.reviewSafeArea}>
            <View style={styles.reviewHeader}>
              <Pressable onPress={() => setIsReviewModalVisible(false)} style={styles.reviewCloseBtn}>
                <Text style={styles.reviewCloseText}>Close</Text>
              </Pressable>
              <Text style={styles.reviewTitle}>Review Page</Text>
              <View style={styles.reviewHeaderSpacer} />
            </View>

            <Text style={styles.reviewSubtitle}>
              Check the page closely and confirm if any changes are needed before export.
            </Text>

            <ScrollView
              horizontal
              pagingEnabled
              scrollEnabled={!signaturePlacements[activeIndex]}
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                setActiveIndex(Math.round(x / Math.max(width, 1)));
              }}
              scrollEventThrottle={16}
              contentOffset={{ x: activeIndex * width, y: 0 }}
            >
              {localUris.map((uri, index) => (
                <View key={`review-${index}`} style={[styles.reviewPage, { width }]}>
                  <View
                    style={styles.reviewImageFrame}
                    onLayout={(event) => {
                      if (index !== activeIndex) return;
                      const { width: frameWidth, height: frameHeight } = event.nativeEvent.layout;
                      setReviewFrameSize((current) => (
                        current.width === frameWidth && current.height === frameHeight
                          ? current
                          : { width: frameWidth, height: frameHeight }
                      ));
                    }}
                    {...(index === activeIndex && signaturePlacements[index] ? reviewSignatureResponder.panHandlers : {})}
                  >
                    <Image source={{ uri }} style={styles.reviewImage} />
                    {signaturePath && signaturePlacements[index] ? (
                      <View
                        style={[
                          styles.reviewSignatureOverlay,
                          {
                            left: `${signaturePlacements[index].x * 100}%`,
                            top: `${signaturePlacements[index].y * 100}%`,
                            width: `${signaturePlacements[index].width * 100}%`,
                            height: `${signaturePlacements[index].height * 100}%`,
                          },
                        ]}
                        pointerEvents="none"
                      >
                        <Svg width="100%" height="100%" viewBox="0 0 320 120">
                          <Path d={signaturePath} fill="none" stroke="#111827" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                        </Svg>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.reviewBadge}>
                    <Text style={styles.reviewBadgeText}>{index + 1} / {localUris.length}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.reviewActions}>
              {signaturePath ? (
                <>
                  <View style={styles.reviewUtilityRow}>
                    <Pressable style={styles.reviewMiniBtn} onPress={signaturePlacements[activeIndex] ? recenterActiveSignature : applySignatureToActivePage}>
                      <Text style={styles.reviewMiniBtnText}>{signaturePlacements[activeIndex] ? 'Recenter Signature' : 'Sign This Page'}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.reviewMiniBtn, !signaturePlacements[activeIndex] && styles.reviewMiniBtnDisabled]}
                      onPress={() => resizeActiveSignature(-0.04)}
                      disabled={!signaturePlacements[activeIndex]}
                    >
                      <Text style={styles.reviewMiniBtnText}>Smaller</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.reviewMiniBtn, !signaturePlacements[activeIndex] && styles.reviewMiniBtnDisabled]}
                      onPress={() => resizeActiveSignature(0.04)}
                      disabled={!signaturePlacements[activeIndex]}
                    >
                      <Text style={styles.reviewMiniBtnText}>Larger</Text>
                    </Pressable>
                    <Pressable style={styles.reviewMiniBtn} onPress={() => {
                      setIsReviewModalVisible(false);
                      setIsSignatureModalVisible(true);
                    }}>
                      <Text style={styles.reviewMiniBtnText}>Redraw</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.reviewMiniBtn, !signaturePlacements[activeIndex] && styles.reviewMiniBtnDisabled]}
                      onPress={removeSignatureFromActivePage}
                      disabled={!signaturePlacements[activeIndex]}
                    >
                      <Text style={styles.reviewMiniBtnText}>Remove</Text>
                    </Pressable>
                  </View>
                  {signaturePlacements[activeIndex] ? (
                    <Text style={styles.reviewHint}>Drag the signature to move it, or use Smaller and Larger to resize it.</Text>
                  ) : null}
                </>
              ) : null}
              <Pressable
                style={styles.reviewConfirmBtn}
                onPress={() => {
                  setIsReviewModalVisible(false);
                }}
              >
                <Text style={styles.reviewConfirmText}>Looks Good</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal visible={isSignatureModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.signatureSheet}>
            <View style={styles.signatureHeader}>
              <View>
                <Text style={styles.signatureTitle}>Create Signature</Text>
                <Text style={styles.signatureSubtitle}>Draw your signature, then place it on the page.</Text>
              </View>
              <Pressable onPress={() => setIsSignatureModalVisible(false)}>
                <X size={22} color={Palette.onSurfaceVariant} />
              </Pressable>
            </View>

            <View style={styles.signatureCanvas} {...signaturePadResponder.panHandlers}>
              {signatureDraftPath ? (
                <Svg width="100%" height="100%" viewBox="0 0 320 120">
                  <Path d={signatureDraftPath} fill="none" stroke="#111827" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              ) : (
                <View style={styles.signatureEmptyState}>
                  <PenTool size={28} color={Palette.primary} />
                  <Text style={styles.signatureEmptyTitle}>Draw your signature</Text>
                  <Text style={styles.signatureEmptyText}>Use your finger inside this box.</Text>
                </View>
              )}
            </View>

            <View style={styles.signatureFooter}>
              <Pressable style={styles.signatureGhostBtn} onPress={clearSignatureDraft}>
                <RotateCcw size={16} color={Palette.primary} />
                <Text style={styles.signatureGhostText}>Clear</Text>
              </Pressable>
              <Pressable
                style={[styles.signatureSaveBtn, !signatureDraftPath && styles.reviewMiniBtnDisabled]}
                onPress={saveSignature}
                disabled={!signatureDraftPath}
              >
                <Text style={styles.signatureSaveText}>Save Signature</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Export Overlay */}
      <Modal visible={isExporting} transparent animationType="fade">
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(255,255,255,0.85)' }]}>
              <View style={styles.loadingCard}>
                  <ActivityIndicator size="large" color={Palette.primary} />
                  <Text style={styles.loadingText}>{format === 'TXT' ? 'Extracting text...' : `Generating ${format}...`}</Text>
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
              <Pressable onPress={() => { setShowSuccessModal(false); router.replace('/(tabs)/history'); }}>
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
              onPress={() => { setShowSuccessModal(false); router.replace('/(tabs)/history'); }}
            >
              <Text style={styles.doneBtnText}>Back to Home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <UpgradeRequiredModal
        visible={isUpgradeModalVisible}
        message={upgradeMessage}
        onClose={() => setIsUpgradeModalVisible(false)}
        onOpenPayment={() => {
          setIsUpgradeModalVisible(false);
          router.push('/payment');
        }}
      />

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
      backgroundColor: '#FFFFFF',
      borderRadius: Radius.xxl,
      padding: 0,
      marginHorizontal: 12,
  },
  previewImageFrame: {
      aspectRatio: 3/4,
      borderRadius: Radius.xxl,
      overflow: 'hidden',
      backgroundColor: '#FFFFFF',
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
  signatureOverlay: {
      position: 'absolute',
      zIndex: 2,
  },
  tapHint: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      backgroundColor: 'rgba(12,16,32,0.75)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
  },
  tapHintText: {
      fontFamily: 'Manrope-Bold',
      fontSize: 10,
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
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
  reviewOverlay: {
      flex: 1,
      backgroundColor: '#050814',
  },
  reviewSafeArea: {
      flex: 1,
  },
  reviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
  },
  reviewCloseBtn: {
      minWidth: 64,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
  },
  reviewCloseText: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 14,
      color: '#FFFFFF',
  },
  reviewTitle: {
      fontFamily: 'PlusJakartaSans-ExtraBold',
      fontSize: 18,
      color: '#FFFFFF',
  },
  reviewHeaderSpacer: {
      width: 64,
  },
  reviewSubtitle: {
      paddingHorizontal: 24,
      marginBottom: 12,
      textAlign: 'center',
      fontFamily: 'Manrope-SemiBold',
      fontSize: 13,
      lineHeight: 20,
      color: 'rgba(255,255,255,0.7)',
  },
  reviewPage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
  },
  reviewImageFrame: {
      width: '100%',
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
  },
  reviewImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'contain',
  },
  reviewSignatureOverlay: {
      position: 'absolute',
      zIndex: 3,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: 'rgba(70,71,211,0.7)',
      backgroundColor: 'rgba(255,255,255,0.35)',
      borderRadius: 10,
  },
  reviewBadge: {
      position: 'absolute',
      top: 18,
      right: 32,
      backgroundColor: 'rgba(255,255,255,0.14)',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
  },
  reviewBadgeText: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 11,
      color: '#FFFFFF',
  },
  reviewActions: {
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 24,
  },
  reviewUtilityRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 12,
  },
  reviewMiniBtn: {
      minHeight: 40,
      borderRadius: 14,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
  },
  reviewMiniBtnDisabled: {
      opacity: 0.45,
  },
  reviewMiniBtnText: {
      fontFamily: 'PlusJakartaSans-Bold',
      fontSize: 12,
      color: '#FFFFFF',
  },
  reviewHint: {
      fontFamily: 'Manrope-Medium',
      fontSize: 12,
      color: 'rgba(255,255,255,0.7)',
      marginBottom: 12,
  },
  reviewConfirmBtn: {
      minHeight: 54,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Palette.primary,
  },
  reviewConfirmText: {
      fontFamily: 'PlusJakartaSans-ExtraBold',
      fontSize: 15,
      color: '#FFFFFF',
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
  signatureSheet: {
    width: '92%',
    maxWidth: 460,
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 22,
    ...Shadows.ambient,
  },
  signatureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  signatureTitle: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 20,
    color: Palette.onSurface,
  },
  signatureSubtitle: {
    marginTop: 6,
    fontFamily: 'Manrope-Medium',
    fontSize: 13,
    lineHeight: 20,
    color: Palette.onSurfaceVariant,
  },
  signatureCanvas: {
    height: 180,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Palette.outlineVariant + '55',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  signatureEmptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  signatureEmptyTitle: {
    marginTop: 12,
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: Palette.onSurface,
  },
  signatureEmptyText: {
    marginTop: 6,
    fontFamily: 'Manrope-Medium',
    fontSize: 13,
    textAlign: 'center',
    color: Palette.onSurfaceVariant,
  },
  signatureFooter: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  signatureGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Palette.surfaceContainerLow,
  },
  signatureGhostText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 13,
    color: Palette.primary,
  },
  signatureSaveBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primary,
  },
  signatureSaveText: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 14,
    color: '#FFFFFF',
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
