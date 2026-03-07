import { spawnSync } from 'child_process';
import { logger } from './logger';

function encodeBase64(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64');
}

function decodeBase64(input: string): string {
  return Buffer.from(input, 'base64').toString('utf8');
}

function runPowershell(script: string, env: Record<string, string>): string {
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      env: {
        ...process.env,
        ...env,
      },
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || 'PowerShell DPAPI failed');
  }
  return (result.stdout || '').trim();
}

export function encryptSecret(rawValue: string): string {
  if (process.platform !== 'win32') {
    return `plain:${encodeBase64(rawValue)}`;
  }

  try {
    const encrypted = runPowershell(
      '$bytes = [Text.Encoding]::UTF8.GetBytes($env:LIS_GATEWAY_SECRET); ' +
      '$enc = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine); ' +
      '[Convert]::ToBase64String($enc)',
      { LIS_GATEWAY_SECRET: rawValue },
    );
    return `dpapi:${encrypted}`;
  } catch (error) {
    logger.warn(
      `DPAPI encrypt failed, using local fallback: ${error instanceof Error ? error.message : String(error)}`,
      'Security',
    );
    return `plain:${encodeBase64(rawValue)}`;
  }
}

export function decryptSecret(storedValue: string): string {
  if (!storedValue) return '';

  if (storedValue.startsWith('plain:')) {
    return decodeBase64(storedValue.slice('plain:'.length));
  }

  if (storedValue.startsWith('dpapi:') && process.platform === 'win32') {
    const encrypted = storedValue.slice('dpapi:'.length);
    try {
      return runPowershell(
        '$enc = [Convert]::FromBase64String($env:LIS_GATEWAY_SECRET); ' +
        '$dec = [Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine); ' +
        '[Text.Encoding]::UTF8.GetString($dec)',
        { LIS_GATEWAY_SECRET: encrypted },
      );
    } catch (error) {
      throw new Error(
        `Unable to decrypt DPAPI secret: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return decodeBase64(storedValue);
}
