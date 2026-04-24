import { Document, Packer, Paragraph, ImageRun, SectionType } from 'docx';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Buffer } from 'buffer';

/**
 * Generates a DOCX file from an array of image URIs.
 * Each image is resized to an optimized width to keep the document size manageable.
 */
export async function generateDocx(imageUris: string[], docName: string = 'Document'): Promise<string> {
  const sections = await Promise.all(
    imageUris.map(async (uri) => {
      // 1. Optimize image for document (Resize to ~1000px width)
      // This ensures the DOCX isn't unnecessarily large for mobile sharing.
      const optimized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1000 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!optimized.base64) {
        throw new Error(`Failed to generate base64 for image: ${uri}`);
      }

      // docx v9 ImageRun requires the `type` field; without it the internal
      // Base64 encoder throws "Cannot read property 'Base64' of undefined".
      // Pass the base64 string directly — docx handles decoding internally.
      return {
        properties: {
          type: SectionType.NEXT_PAGE,
        },
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                type: 'jpg',
                data: optimized.base64,
                transformation: {
                  width: 580,
                  height: 750,
                },
              }),
            ],
          }),
        ],
      };
    })
  );

  const doc = new Document({
    sections,
  });

  // Export to base64
  const base64String = await Packer.toBase64String(doc);

  // Clean the name — strip characters illegal in file paths
  let cleanName = docName.replace(/[\/\?<>\\:\*\|"]/g, '').trim() || 'Document';
  if (cleanName.toLowerCase().endsWith('.docx')) {
    cleanName = cleanName.substring(0, cleanName.length - 5);
  }

  // Save directly with the user's document name
  const docxUri = (FileSystem.cacheDirectory || '') + `${cleanName}.docx`;

  // Remove any pre-existing file with this name
  if ((await FileSystem.getInfoAsync(docxUri)).exists) {
    await FileSystem.deleteAsync(docxUri);
  }

  // Write base64 string directly using expo-file-system
  await FileSystem.writeAsStringAsync(docxUri, base64String, { 
    encoding: FileSystem.EncodingType.Base64 
  });

  return docxUri;
}
