const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

/** Read an image file as a data URL without compression. */
export async function readImageFile(file: File): Promise<string> {
  if (!isAllowedImageFile(file)) {
    throw new Error('Nieobsługiwany format. Dozwolone: JPEG, PNG, GIF, WebP, BMP.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Obraz może mieć maksymalnie 16 MB.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detected = detectMimeType(bytes);
  const mime = detected ?? normalizeMime(file.type) ?? mimeFromFilename(file.name);

  if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error('Nieobsługiwany format. Dozwolone: JPEG, PNG, GIF, WebP, BMP.');
  }

  return `data:${mime};base64,${uint8ToBase64(bytes)}`;
}

export function toImageSrc(image: string | null | undefined): string | null {
  if (!image) {
    return null;
  }

  if (image.startsWith('data:') || image.startsWith('/media/') || image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }

  // Legacy raw base64 payloads from older guest/local data.
  return `data:image/jpeg;base64,${image}`;
}

export function isAllowedImageFile(file: File): boolean {
  const mime = normalizeMime(file.type);
  if (mime && ALLOWED_MIME_TYPES.has(mime)) {
    return true;
  }

  const extension = file.name.includes('.')
    ? file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  return ALLOWED_EXTENSIONS.has(extension);
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
    if (ALLOWED_EXTENSIONS.has(extension)) {
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

function normalizeMime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase().split(';')[0];
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function mimeFromFilename(filename: string): string | null {
  const extension = filename.includes('.')
    ? filename.substring(filename.lastIndexOf('.') + 1).toLowerCase()
    : '';
  return extensionFromMime(`image/${extension === 'jpg' ? 'jpeg' : extension}`)
    ? `image/${extension === 'jpg' ? 'jpeg' : extension}`
    : null;
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

function detectMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 6
    && bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39)
    && bytes[5] === 0x61
  ) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  return null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
