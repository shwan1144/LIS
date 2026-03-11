const DEFAULT_PUBLIC_RESULTS_LAB_BASE_DOMAIN = 'medilis.net';

type BuildPublicResultUrlOptions = {
  labSubdomain?: string | null;
  apiBaseUrl?: string;
  labBaseDomain?: string;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isValidSubdomain(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
}

function normalizeLabBaseDomain(value: string | null | undefined): string | null {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (!raw) return null;
  if (raw.includes('..')) return null;
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(raw)) return null;
  return raw;
}

export function buildPublicResultUrl(
  orderId: string,
  options: BuildPublicResultUrlOptions = {},
): string {
  const encodedOrderId = encodeURIComponent(orderId);
  const labSubdomain = String(options.labSubdomain ?? '')
    .trim()
    .toLowerCase();
  const labBaseDomain = normalizeLabBaseDomain(
    options.labBaseDomain ??
      import.meta.env.VITE_PUBLIC_RESULTS_LAB_BASE_DOMAIN ??
      DEFAULT_PUBLIC_RESULTS_LAB_BASE_DOMAIN,
  );

  if (labBaseDomain && isValidSubdomain(labSubdomain)) {
    return `https://${labSubdomain}.${labBaseDomain}/public/results/${encodedOrderId}`;
  }

  const fallbackOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  const apiBase = normalizeBaseUrl(options.apiBaseUrl || fallbackOrigin);
  return `${apiBase}/public/results/${encodedOrderId}`;
}

