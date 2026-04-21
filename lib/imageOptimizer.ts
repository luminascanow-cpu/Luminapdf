import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Asynchronously resizes each scan to a professional width (usually 1200px)
 * to maintain high-quality document details while minimizing file size.
 */
export async function optimizeImages(uris: string[], targetWidth = 1200): Promise<string[]> {
  const optimizedUris = await Promise.all(
    uris.map(async (uri) => {
      try {
        const result = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: targetWidth } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        return result.uri;
      } catch (error) {
        console.warn(`Failed to optimize image ${uri}, falling back to original:`, error);
        return uri;
      }
    })
  );
  return optimizedUris;
}
