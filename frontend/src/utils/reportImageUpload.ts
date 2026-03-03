export type OptimizeImageOptions = {
  maxWidth: number;
  maxHeight: number;
  outputType?: string;
  quality?: number;
};

export type OptimizedImageData = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
};

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
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is not available');
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const requestedType = options.outputType || file.type || 'image/png';
    const outputType = /^image\/(png|jpeg|jpg|webp)$/i.test(requestedType)
      ? requestedType.toLowerCase().replace('image/jpg', 'image/jpeg')
      : 'image/png';
    const quality = clamp(options.quality ?? 0.9, 0.1, 1);

    const blob = await canvasToBlob(canvas, outputType, quality);
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
