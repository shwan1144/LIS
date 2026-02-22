const warnedDevFallbacks = new Set<string>();

export function isProductionEnv(): boolean {
  return (process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function warnDevFallback(envName: string, source: string): void {
  const key = `${source}:${envName}`;
  if (warnedDevFallbacks.has(key)) {
    return;
  }
  warnedDevFallbacks.add(key);

  // Intentionally loud so local/dev users see that secret management is required in production.
  // eslint-disable-next-line no-console
  console.warn(
    `[SECURITY WARNING] ${source} is using a development fallback for ${envName}. ` +
      `Set ${envName} in environment variables before production deployment.`,
  );
}

export function requireSecret(
  envName: string,
  devFallback: string,
  source: string,
): string {
  const value = process.env[envName]?.trim();
  if (value) {
    return value;
  }

  if (isProductionEnv()) {
    throw new Error(
      `[SECURITY] Missing required environment variable "${envName}" in production (${source}).`,
    );
  }

  warnDevFallback(envName, source);
  return devFallback;
}

export function assertRequiredProductionEnv(envNames: string[], source: string): void {
  if (!isProductionEnv()) {
    return;
  }

  const missing = envNames.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[SECURITY] Missing required environment variables in production (${source}): ${missing.join(', ')}`,
    );
  }
}

export function isRlsStrictModeEnabled(): boolean {
  const configured = process.env.RLS_STRICT_MODE;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return isTruthy(configured);
  }
  return isProductionEnv();
}
