/** Parity with MediaStorageService. */
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

const UNSUPPORTED_IMAGE_MESSAGE = 'Nieobsługiwany format. Dozwolone: JPEG, PNG, GIF, WebP, BMP.';
const IMAGE_TOO_LARGE_MESSAGE = 'Obraz może mieć maksymalnie 16 MB.';

export async function readImageFile(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(IMAGE_TOO_LARGE_MESSAGE);
  }

  return imageBytesToDataUrl(new Uint8Array(await file.arrayBuffer()));
}

/** MIME from file signature only. */
export function imageBytesToDataUrl(bytes: Uint8Array): string {
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(IMAGE_TOO_LARGE_MESSAGE);
  }

  const mime = detectMimeType(bytes);

  if (!mime) {
    throw new Error(UNSUPPORTED_IMAGE_MESSAGE);
  }

  return `data:${mime};base64,${uint8ToBase64(bytes)}`;
}

export function extensionFromImageReference(image: string, fallback = 'jpg'): string {
  if (image.startsWith('data:')) {
    const mime = image.substring(5, image.indexOf(';')).toLowerCase();
    return extensionFromMime(mime) ?? fallback;
  }

  const path = image.includes('?') ? image.substring(0, image.indexOf('?')) : image;
  const filename = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;
  if (filename.includes('.')) {
    const extension = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension)) {
      return extension === 'jpeg' ? 'jpg' : extension;
    }
  }

  return fallback;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const payload = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function extensionFromMime(mime: string): string | null {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/bmp':
      return 'bmp';
    default:
      return null;
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
}

function detectMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x42, 0x4d])) return 'image/bmp';
  return null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
