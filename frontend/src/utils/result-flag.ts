import type { ResultFlag } from '../api/client';

export const RESULT_FLAG_COLOR: Record<ResultFlag, string> = {
  N: 'green',
  H: 'orange',
  L: 'blue',
  POS: 'red',
  NEG: 'green',
  ABN: 'purple',
};

export const RESULT_FLAG_LABEL: Record<ResultFlag, string> = {
  N: 'Normal',
  H: 'High',
  L: 'Low',
  POS: 'Positive',
  NEG: 'Negative',
  ABN: 'Abnormal',
};

export function normalizeResultFlag(
  flag: string | null | undefined,
): ResultFlag | null {
  const normalized = String(flag ?? '').trim().toUpperCase();
  if (normalized === 'N') return 'N';
  if (normalized === 'H' || normalized === 'HH') return 'H';
  if (normalized === 'L' || normalized === 'LL') return 'L';
  if (normalized === 'POS') return 'POS';
  if (normalized === 'NEG') return 'NEG';
  if (normalized === 'ABN') return 'ABN';
  return null;
}

export function getResultFlagTagColor(
  flag: string | null | undefined,
  fallback = 'default',
): string {
  const normalized = normalizeResultFlag(flag);
  return normalized ? RESULT_FLAG_COLOR[normalized] : fallback;
}

export function getResultFlagLabel(
  flag: string | null | undefined,
): string | null {
  const normalized = normalizeResultFlag(flag);
  return normalized ? RESULT_FLAG_LABEL[normalized] : null;
}
