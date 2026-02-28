export type AuthScope = 'LAB' | 'PLATFORM';

function getHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname.toLowerCase();
}

export function isAdminHost(hostname = getHostname()): boolean {
  return hostname === 'admin.localhost' || hostname.startsWith('admin.');
}

export function getCurrentAuthScope(hostname = getHostname()): AuthScope {
  return isAdminHost(hostname) ? 'PLATFORM' : 'LAB';
}

export function resolveApiBaseUrl(envBase?: string): string {
  const fallback = 'http://localhost:3000';
  if (typeof window === 'undefined') {
    return envBase || fallback;
  }

  const hostname = window.location.hostname;
  const protocol = window.location.protocol || 'http:';
  const normalizedEnv = envBase?.trim();

  if (!normalizedEnv) {
    const port = hostname === 'localhost' || hostname.endsWith('.localhost') ? ':3000' : '';
    return `${protocol}//${hostname}${port}`;
  }

  try {
    const parsed = new URL(normalizedEnv);
    const isLocal = hostname === 'localhost' || hostname.endsWith('.localhost');
    const isLocalApiHost = parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost');

    // Local multi-subdomain dev: keep current host (lab01.localhost, admin.localhost),
    // but preserve API protocol/port/path from VITE_API_URL.
    if (isLocal && isLocalApiHost) {
      const port = parsed.port || '3000';
      const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${parsed.protocol}//${hostname}:${port}${pathname}`;
    }

    // Production/staging: if VITE_API_URL is set, use it directly.
    return normalizedEnv.replace(/\/+$/, '');
  } catch {
    return normalizedEnv.replace(/\/+$/, '');
  }
}
