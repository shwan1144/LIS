import { createHash } from 'crypto';

type ReportBrandingShape = {
  bannerDataUrl?: string | null;
  footerDataUrl?: string | null;
  logoDataUrl?: string | null;
  watermarkDataUrl?: string | null;
};

type ReportDesignFingerprintInput = {
  reportBranding?: ReportBrandingShape | null;
  reportStyle?: unknown;
};

function stableJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') {
      return input;
    }
    if (input instanceof Date) {
      return input.toISOString();
    }
    if (Array.isArray(input)) {
      return input.map((item) => normalize(item));
    }
    if (seen.has(input as object)) {
      return '[Circular]';
    }
    seen.add(input as object);

    const source = input as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      normalized[key] = normalize(source[key]);
    }
    return normalized;
  };

  try {
    return JSON.stringify(normalize(value));
  } catch {
    return '';
  }
}

export function buildReportDesignFingerprint(input: ReportDesignFingerprintInput): string {
  const reportBranding = input.reportBranding ?? {};
  const rawDesignPayload = [
    reportBranding.bannerDataUrl ?? '',
    reportBranding.footerDataUrl ?? '',
    reportBranding.logoDataUrl ?? '',
    reportBranding.watermarkDataUrl ?? '',
    stableJsonStringify(input.reportStyle ?? null),
  ].join('::');

  return createHash('sha1').update(rawDesignPayload).digest('hex');
}
