const MAX_SOURCE_WIDTH = 3840;
const MAX_SOURCE_HEIGHT = 2160;
const STORED_MAX_WIDTH = 800;
const STORED_MAX_HEIGHT = 600;
const JPEG_QUALITY = 0.75;

export async function compressImageFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  if (bitmap.width > MAX_SOURCE_WIDTH || bitmap.height > MAX_SOURCE_HEIGHT) {
    bitmap.close();
    throw new Error(`Obraz jest za duży. Maksymalny rozmiar to ${MAX_SOURCE_WIDTH}×${MAX_SOURCE_HEIGHT} px (4K).`);
  }

  const scale = Math.min(1, STORED_MAX_WIDTH / bitmap.width, STORED_MAX_HEIGHT / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    bitmap.close();
    throw new Error('Canvas is not available');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));

  if (!blob) {
    throw new Error('Could not compress image');
  }

  return blobToBase64(blob);
}

export function toImageSrc(base64: string | null | undefined): string | null {
  if (!base64) {
    return null;
  }

  return base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
