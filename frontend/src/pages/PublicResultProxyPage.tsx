import { useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function deriveApiBaseUrl(): string {
  const envBase = String(import.meta.env.VITE_API_URL ?? '').trim();
  if (envBase.length > 0) {
    return normalizeBaseUrl(envBase);
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const { protocol, hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return `${protocol}//${hostname}:3001`;
  }

  if (!hostname.startsWith('api.')) {
    const hostParts = hostname.split('.');
    if (hostParts.length >= 2) {
      const baseDomain = hostParts.slice(-2).join('.');
      return `${protocol}//api.${baseDomain}`;
    }
  }

  return normalizeBaseUrl(origin);
}

export function PublicResultProxyPage() {
  const { id, '*': remainder } = useParams();
  const location = useLocation();

  const targetUrl = useMemo(() => {
    if (!id) return null;
    const base = deriveApiBaseUrl();
    const encodedId = encodeURIComponent(id);
    const suffix = remainder ? `/${remainder}` : '';
    return `${base}/public/results/${encodedId}${suffix}${location.search || ''}`;
  }, [id, remainder, location.search]);

  useEffect(() => {
    if (!targetUrl || typeof window === 'undefined') return;
    const currentUrl = window.location.href;
    if (currentUrl === targetUrl) return;
    window.location.replace(targetUrl);
  }, [targetUrl]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)',
          padding: 20,
          textAlign: 'center',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Redirecting to result page...</div>
        <div style={{ color: '#64748b', fontSize: 14 }}>
          ئەم پەڕەیە بە شێوەی خۆکار دەگوازرێتەوە | سيتم تحويل الصفحة تلقائياً
        </div>
        {targetUrl ? (
          <div style={{ marginTop: 14 }}>
            <a href={targetUrl} style={{ color: '#2563eb' }}>
              Open result page
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

