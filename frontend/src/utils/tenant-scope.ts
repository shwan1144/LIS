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
    const isSubdomainHost = hostname.includes('.');

    if (!isSubdomainHost) {
      return normalizedEnv.replace(/\/+$/, '');
    }

    const port = parsed.port || (isLocal ? '3000' : '');
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
  } catch {
    return normalizedEnv.replace(/\/+$/, '');
  }
}
