/**
 * Kliensoldali képméret-optimalizáló (WebP / JPEG tömörítés + átméretezés).
 * Cél: a telefonos vagy nagy felbontású előtte/utána kezelési fotókat (5-12 MB)
 * minimális látható veszteséggel ~60-150 KB-ra csökkenteni, EXIF metaadatok eltávolításával.
 */

export interface OptimizedImageResult {
  dataUrl: string;
  mimeType: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  width: number;
  height: number;
  savingsPercent: number;
}

export interface ImageOptimizeOptions {
  maxDimensionPx?: number;
  quality?: number;
  preferredMimeType?: 'image/webp' | 'image/jpeg';
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimensionPx = 1600,
): { width: number; height: number } {
  if (srcWidth <= maxDimensionPx && srcHeight <= maxDimensionPx) {
    return { width: srcWidth, height: srcHeight };
  }
  const ratio = srcWidth / srcHeight;
  if (srcWidth >= srcHeight) {
    return {
      width: maxDimensionPx,
      height: Math.max(1, Math.round(maxDimensionPx / ratio)),
    };
  }
  return {
    width: Math.max(1, Math.round(maxDimensionPx * ratio)),
    height: maxDimensionPx,
  };
}

export async function optimizeImageFile(
  file: File,
  options: ImageOptimizeOptions = {},
): Promise<OptimizedImageResult> {
  const maxDimensionPx = options.maxDimensionPx ?? 1600;
  const quality = options.quality ?? 0.82;
  const preferredMime = options.preferredMimeType ?? 'image/webp';

  const originalSizeBytes = file.size;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imageEl = new Image();
      imageEl.onload = () => resolve(imageEl);
      imageEl.onerror = () =>
        reject(new Error('Nem sikerült betölteni a képfájlt.'));
      imageEl.src = String(reader.result);
    };
    reader.onerror = () =>
      reject(new Error('Nem sikerült beolvasni a kiválasztott fájlt.'));
    reader.readAsDataURL(file);
  });

  const { width, height } = calculateTargetDimensions(
    img.naturalWidth || img.width || 1200,
    img.naturalHeight || img.height || 900,
    maxDimensionPx,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('A böngésző nem támogatja a 2D Canvas képfeldolgozást.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  let dataUrl = canvas.toDataURL(preferredMime, quality);
  let actualMime: string = preferredMime;

  // Ha a böngésző nem támogatja a WebP kódolást, fallback optimalizált JPEG-re
  if (!dataUrl.startsWith(`data:${preferredMime}`)) {
    actualMime = 'image/jpeg';
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  // Base64 payload becsült bájtmérete
  const base64Part = dataUrl.split(',')[1] ?? '';
  const compressedSizeBytes = Math.max(
    1,
    Math.round((base64Part.length * 3) / 4),
  );

  const savingsPercent =
    originalSizeBytes > 0
      ? Math.max(
          0,
          Math.round(
            ((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) *
              100,
          ),
        )
      : 0;

  return {
    dataUrl,
    mimeType: actualMime,
    originalSizeBytes,
    compressedSizeBytes,
    width,
    height,
    savingsPercent,
  };
}
