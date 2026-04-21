import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Animated, Platform, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Palette, Gradients, Radius, Shadows } from '../constants/Theme';
import { X, Zap, Settings, Focus, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scanDocumentWithBestAvailableScanner } from '../lib/mlKitScanner';
import { optimizeImages } from '../lib/imageOptimizer';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

const { width } = Dimensions.get('window');

export default function ScannerScreen() {
  const { existingImages, sessionName, draftId } = useLocalSearchParams<{
    existingImages?: string;
    sessionName?: string;
    draftId?: string;
  }>();
  const router = useRouter();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [scanMode, setScanMode] = useState<'ID Card' | 'Document' | 'Passport'>('Document');
  const [captureMode, setCaptureMode] = useState<'single' | 'multi'>('single');
  const [statusMessage, setStatusMessage] = useState('Scanner Ready');
  const [subMessage, setSubMessage] = useState('Align your document in the frame, then tap capture');
  const isCapturingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0.05)).current;

  const animateProgress = (toValue: number, duration = 500) => {
    Animated.timing(progressAnim, {
      toValue,
      duration,
      useNativeDriver: false, // width doesn't support native driver
    }).start();
  };

  const startScan = async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    try {
      if (!cameraPermission?.granted) {
        const permission = await requestCameraPermission();
        if (!permission.granted) {
          Alert.alert('Camera permission needed', 'Please allow camera access to scan documents.');
          return;
        }
      }

      setIsCapturing(true);
      setStatusMessage('Initializing AI...');
      setSubMessage('Calibrating computer vision');
      animateProgress(0.2, 800);

      const pageLimit = captureMode === 'single' ? 1 : 24;
      const result = await scanDocumentWithBestAvailableScanner(pageLimit);

      if (result.status === 'cancel') {
        // Reset to idle state silently
        setStatusMessage('Scanner Ready');
        setSubMessage('Align your document in the frame, then tap capture');
        animateProgress(0.05, 500);
        return;
      }

      if (result.scannedImages && result.scannedImages.length > 0) {
        setStatusMessage('Processing...');
        setSubMessage(`Optimizing ${result.scannedImages.length} page${result.scannedImages.length > 1 ? 's' : ''}`);
        animateProgress(0.7, 1200);

        // Optimize the images to 1200px width before rendering preview
        const optimizedImageUris = await optimizeImages(result.scannedImages);
        
        animateProgress(1, 400);
        setStatusMessage('Capture Complete');
        setSubMessage('Preparing preview...');
        
        // Wait for animation to feel smooth
        setTimeout(() => {
          let finalUris = optimizedImageUris;
          
          if (existingImages) {
            try {
              const previousParsed = JSON.parse(existingImages) as string[];
              finalUris = [...previousParsed, ...optimizedImageUris];
            } catch (e) {
              console.error('Failed to parse existing images', e);
            }
          }

          router.push({
            pathname: '/preview',
            params: { 
                imageUris: JSON.stringify(finalUris),
                initialName: sessionName || `Scan_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
                resumeSession: sessionName ? '1' : '0',
                draftId,
            }
          });
        }, 500);
      } else {
        // No images and no successful status (unlikely but safe)
        setStatusMessage('Scanner Ready');
        setSubMessage('Align your document in the frame, then tap capture');
        animateProgress(0.05, 500);
      }
    } catch (error: any) {
      console.error('Scan Error:', error);
      
      // Don't show technical errors if they contain "cancel" or similar
      const isUserCancel = error?.message?.toLowerCase().includes('cancel') || 
                          error?.toString().toLowerCase().includes('cancel');
      
      if (!isUserCancel) {
        Alert.alert('Scanner Error', 'Failed to start the scanner. Please ensure camera permissions are granted.');
      }
      
      // Always reset to idle on error
      setStatusMessage('Scanner Ready');
      setSubMessage('Align your document in the frame, then tap capture');
      animateProgress(0.05, 500);
    } finally {
      isCapturingRef.current = false;
      setIsCapturing(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  const handleScannerSettings = () => {
    Alert.alert(
      'Scanner Settings',
      `Capture: ${captureMode === 'single' ? 'Single page' : 'Multi page'}\nMode: ${scanMode}\n\nTip: use Single for one document and switch to Multi when you need several pages in one scan.`
    );
  };

  const handleCaptureModeToggle = () => {
    const nextMode = captureMode === 'single' ? 'multi' : 'single';
    setCaptureMode(nextMode);
    setStatusMessage(nextMode === 'single' ? 'Single Page Ready' : 'Multi Page Ready');
    setSubMessage(
      nextMode === 'single'
        ? 'Capture one page and jump straight to preview'
        : 'Capture multiple pages in one scanner session'
    );
  };

  const handleLibraryImport = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsCapturing(true);
        setStatusMessage('Importing...');
        
        const uris = result.assets.map(asset => asset.uri);
        
        // Extract name
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
            initialName: sessionName || initialName,
            resumeSession: sessionName ? '1' : '0',
            draftId,
          }
        });
      }
    } catch (e) {
      console.error('Library import failed:', e);
      Alert.alert('Import Failed', 'Failed to pick images from library.');
    } finally {
      setIsCapturing(false);
    }
  };

  useEffect(() => {
    // Start pulse animation for the "Auto Detect" chip
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    if (!cameraPermission) return;
    if (!cameraPermission.granted && cameraPermission.canAskAgain) {
      void requestCameraPermission();
    }
  }, [cameraPermission, pulseAnim, requestCameraPermission]);

  return (
    <View style={styles.container}>
      {cameraPermission?.granted ? (
        <CameraView
          facing="back"
          style={styles.cameraPlaceholder}
          animateShutter={false}
        />
      ) : (
        <View style={styles.cameraPlaceholder}>
          <LinearGradient
            colors={['#050B16', '#10213A', '#1A3150']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.permissionFallback}
          >
            <Text style={styles.permissionTitle}>Camera preview is waiting for permission</Text>
            <Text style={styles.permissionSubtitle}>
              Allow camera access to see the live document view here.
            </Text>
            <Pressable style={styles.permissionButton} onPress={() => void requestCameraPermission()}>
              <Text style={styles.permissionButtonText}>Enable Camera</Text>
            </Pressable>
          </LinearGradient>
        </View>
      )}
      <View style={styles.darkOverlay} />

      <SafeAreaView style={styles.overlay}>
        {/* Top Controls */}
        <View style={styles.topControls}>
          <Pressable onPress={handleClose} style={styles.glassBtn} hitSlop={15}>
            <X size={24} color="#FFF" />
          </Pressable>

          <View style={styles.statusChip}>
            <View style={styles.pulseContainer}>
              <Animated.View style={[styles.pulseDot, { transform: [{ scale: pulseAnim }] }]} />
              <View style={styles.coreDot} />
            </View>
            <Text style={styles.statusText}>{scanMode} Mode</Text>
            <View style={styles.chipDivider} />
            <Zap size={18} color="#FFF" opacity={0.7} />
          </View>

          <Pressable onPress={handleScannerSettings} style={styles.glassBtn} hitSlop={15}>
            <Settings size={22} color="#FFF" />
          </Pressable>
        </View>

        {/* HUD Visualization */}
        <View style={styles.hudOverlay}>
            <View style={styles.guideFrame}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                
                {/* HUD Coordinates simulated */}
                <View style={styles.hudMetaTop}>
                    <View style={styles.coordBox}>
                        <Text style={styles.coordText}>X: 247.2 Y: 812.9</Text>
                    </View>
                </View>
                <View style={styles.hudMetaBottom}>
                    <View style={styles.coordBox}>
                        <Text style={styles.coordText}>CONFIDENCE: 98%</Text>
                    </View>
                </View>
            </View>
        </View>

        {/* Center Feedback */}
        <View style={styles.feedbackContainer}>
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackTitle}>{statusMessage}</Text>
            <Text style={styles.feedbackSubtitle}>{subMessage}</Text>
          </View>
        </View>

        {/* Bottom Panel */}
        <View style={styles.bottomControls}>
          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
                <AnimatedLinearGradient
                  colors={Gradients.accent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.progressFill, 
                    { 
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%']
                      }) 
                    }
                  ]}
                />
            </View>
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <Pressable style={styles.actionItem} onPress={handleLibraryImport}>
              <View style={styles.actionIconBox}>
                <View style={styles.thumbPlaceholder} />
              </View>
              <Text style={styles.actionLabel}>Library</Text>
            </Pressable>

            <Pressable disabled={isCapturing} onPress={startScan} style={styles.shutterContainer}>
                <View style={styles.shutterOuterRing} />
                <LinearGradient
                    colors={Gradients.accent}
                    style={styles.shutterGradient}
                >
                    <View style={styles.shutterInnerRing}>
                        <Focus size={32} color="#FFF" strokeWidth={1.5} />
                    </View>
                </LinearGradient>
                {/* Inner Glow Hack */}
                <View style={styles.shutterGlow} />
            </Pressable>

            <Pressable style={styles.actionItem} onPress={handleCaptureModeToggle}>
              <View style={styles.actionIconBox}>
                <View style={[styles.glassCircle, captureMode === 'single' && styles.glassCircleActive]}>
                    <ChevronRight size={24} color="#FFF" opacity={0.6} />
                </View>
              </View>
              <Text style={styles.actionLabel}>{captureMode === 'single' ? 'Single' : 'Multi'}</Text>
            </Pressable>
          </View>

          {/* Mode Selector */}
          <View style={styles.modeSelector}>
            {(['ID Card', 'Document', 'Passport'] as const).map((modeItem) => (
              <Pressable key={modeItem} onPress={() => setScanMode(modeItem)} hitSlop={15}>
                {scanMode === modeItem ? (
                  <View style={styles.modeActiveItem}>
                    <Text style={styles.modeActiveText}>{modeItem}</Text>
                    <View style={styles.modeIndicator} />
                  </View>
                ) : (
                  <Text style={styles.modeInactive}>{modeItem}</Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A1A1A',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  permissionFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  permissionTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 22,
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  permissionSubtitle: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    minWidth: 160,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  permissionButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 14,
    color: '#FFF',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  glassBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(6, 14, 32, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 14, 32, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pulseContainer: {
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Palette.tertiaryFixed,
    opacity: 0.3,
  },
  coreDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.tertiaryFixed,
  },
  statusText: {
    color: '#FFF',
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  chipDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  hudOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  guideFrame: {
    width: '100%',
    aspectRatio: 3/4,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#FF9742',
    borderWidth: 3,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 16,
  },
  topRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 16,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 16,
  },
  hudMetaTop: {
      position: 'absolute',
      top: 40,
      left: 20,
  },
  hudMetaBottom: {
      position: 'absolute',
      bottom: 40,
      right: 20,
  },
  coordBox: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  coordText: {
    color: '#FFF',
    fontSize: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  feedbackContainer: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  feedbackBox: {
    backgroundColor: 'rgba(12, 16, 32, 0.8)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Shadows.ambient,
  },
  feedbackTitle: {
    color: '#FFF',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
  },
  feedbackSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'Manrope-Medium',
    fontSize: 12,
    marginTop: 2,
  },
  bottomControls: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 24,
  },
  progressContainer: {
    width: width * 0.7,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    flex: 1,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
    width: 70,
  },
  actionIconBox: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  glassCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCircleActive: {
    backgroundColor: 'rgba(45, 110, 255, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  actionLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  shutterContainer: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterRing: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  shutterGradient: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.accent,
  },
  shutterInnerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterGlow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    height: '40%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    zIndex: 5,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  modeInactive: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  modeActiveItem: {
    alignItems: 'center',
    gap: 6,
  },
  modeActiveText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: '#FFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  modeIndicator: {
    width: 24,
    height: 2,
    backgroundColor: '#FF9742',
    borderRadius: 1,
  }
});
