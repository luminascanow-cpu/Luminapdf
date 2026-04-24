import { NativeModules, Platform } from 'react-native';

export interface TextExtractionResult {
  text: string;
  pages: string[];
  pageCount: number;
}

type MlKitTextModule = {
  extractTextFromImages?: (imageUris: string[]) => Promise<TextExtractionResult>;
};

const nativeModule = NativeModules.MlKitDocumentScanner as MlKitTextModule | undefined;

export async function extractTextFromImages(imageUris: string[]): Promise<TextExtractionResult> {
  if (Platform.OS !== 'android') {
    throw new Error('Text extraction from scans is currently available on Android only.');
  }

  if (!nativeModule?.extractTextFromImages) {
    throw new Error('The on-device text extraction module is unavailable in this build.');
  }

  return nativeModule.extractTextFromImages(imageUris);
}
