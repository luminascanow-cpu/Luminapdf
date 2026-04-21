import { NativeModules, Platform } from 'react-native';
import DocumentScanner from 'react-native-document-scanner-plugin';

type MlKitResult = {
  scannedImages: string[];
  pageCount?: number;
  pdfUri?: string | null;
  status?: 'success' | 'cancel' | string;
};

type MlKitNativeModule = {
  scanDocument(pageLimit: number): Promise<MlKitResult>;
};

const nativeMlKitScanner = NativeModules.MlKitDocumentScanner as MlKitNativeModule | undefined;

export async function scanDocumentWithBestAvailableScanner(pageLimit = 24): Promise<MlKitResult> {
  if (Platform.OS === 'android' && nativeMlKitScanner) {
    return nativeMlKitScanner.scanDocument(pageLimit);
  }

  const result = await DocumentScanner.scanDocument({
    maxNumDocuments: pageLimit,
    letUserAdjustCrop: true,
    croppedImageQuality: 100,
  });

  return {
    scannedImages: result.scannedImages ?? [],
    pageCount: result.scannedImages?.length ?? 0,
    pdfUri: null,
    status: result.status,
  };
}
