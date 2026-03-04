export type OptimizeImageOptions = {
  maxWidth: number;
  maxHeight: number;
  outputType?: string;
  quality?: number;
  minQuality?: number;
  maxBytes?: number;
  preferOriginalIfWithinBounds?: boolean;
};

export type OptimizedImageData = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
};

const JPEG_WEBP_OUTPUT_PATTERN = /^image\/(jpeg|webp)$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return 0;
  const base64 = dataUrl.slice(commaIndex + 1);
  const padding =
    base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      if (!value) {
        reject(new Error('Could not read image data'));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(new Error('Could not read image data'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromObjectUrl(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image'));
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode image'));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

async function encodeCanvasWithOptionalByteLimit(
  canvas: HTMLCanvasElement,
  outputType: string,
  maxQuality: number,
  minQuality: number,
  maxBytes?: number,
): Promise<Blob> {
  let blob = await canvasToBlob(canvas, outputType, maxQuality);
  if (
    !maxBytes ||
    blob.size <= maxBytes ||
    !JPEG_WEBP_OUTPUT_PATTERN.test(outputType)
  ) {
    return blob;
  }

  let currentQuality = maxQuality;
  while (currentQuality > minQuality) {
    const nextQuality = Math.max(
      minQuality,
      Number((currentQuality - 0.04).toFixed(2)),
    );
    if (nextQuality === currentQuality) {
      break;
    }

    currentQuality = nextQuality;
    const candidate = await canvasToBlob(canvas, outputType, currentQuality);
    blob = candidate;
    if (candidate.size <= maxBytes) {
      break;
    }
  }

  return blob;
}

export async function optimizeImageFileToDataUrl(
  file: File,
  options: OptimizeImageOptions,
): Promise<OptimizedImageData> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('Invalid image dimensions');
    }

    const ratio = Math.min(
      1,
      options.maxWidth / sourceWidth,
      options.maxHeight / sourceHeight,
    );
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));
    const maxBytes =
      typeof options.maxBytes === 'number' && Number.isFinite(options.maxBytes) && options.maxBytes > 0
        ? Math.floor(options.maxBytes)
        : undefined;
    const canKeepOriginal =
      options.preferOriginalIfWithinBounds === true &&
      ratio >= 1 &&
      (!maxBytes || file.size <= maxBytes);

    if (canKeepOriginal) {
      const dataUrl = await readFileAsDataUrl(file);
      return {
        dataUrl,
        width: sourceWidth,
        height: sourceHeight,
        bytes: dataUrlBytes(dataUrl),
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is not available');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const requestedType = options.outputType || file.type || 'image/png';
    const outputType = /^image\/(png|jpeg|jpg|webp)$/i.test(requestedType)
      ? requestedType.toLowerCase().replace('image/jpg', 'image/jpeg')
      : 'image/png';
    const maxQuality = clamp(options.quality ?? 1, 0.1, 1);
    const minQuality = clamp(options.minQuality ?? 0.88, 0.1, maxQuality);
    const blob = await encodeCanvasWithOptionalByteLimit(
      canvas,
      outputType,
      maxQuality,
      minQuality,
      maxBytes,
    );
    const dataUrl = await readFileAsDataUrl(blob);

    return {
      dataUrl,
      width,
      height,
      bytes: dataUrlBytes(dataUrl),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
