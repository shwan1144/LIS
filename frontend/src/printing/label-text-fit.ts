type FitSingleLineFontSizeOptions = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  maxWidth: number;
  minFontSize: number;
  text: string;
};

let measurementCanvas: HTMLCanvasElement | null = null;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') {
    return null;
  }

  measurementCanvas ??= document.createElement('canvas');
  return measurementCanvas.getContext('2d');
}

export function fitSingleLineFontSize(options: FitSingleLineFontSizeOptions): number {
  const context = getMeasurementContext();
  if (!context) {
    return options.fontSize;
  }

  const normalizedText = normalizeText(options.text);
  if (!normalizedText || options.maxWidth <= 0) {
    return options.fontSize;
  }

  let fontSize = options.fontSize;
  const minFontSize = Math.min(options.fontSize, options.minFontSize);

  while (fontSize > minFontSize) {
    context.font = `${options.fontWeight} ${fontSize}px ${options.fontFamily}`;
    if (context.measureText(normalizedText).width <= options.maxWidth) {
      return roundFontSize(fontSize);
    }
    fontSize = Math.max(minFontSize, fontSize - 0.25);
  }

  return roundFontSize(minFontSize);
}

export function singleLineTextNeedsShrink(options: FitSingleLineFontSizeOptions): boolean {
  return fitSingleLineFontSize(options) < (options.fontSize - 0.01);
}

function roundFontSize(value: number): number {
  return Math.round(value * 100) / 100;
}
