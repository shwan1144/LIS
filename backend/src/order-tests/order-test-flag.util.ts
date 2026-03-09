import { ResultFlag } from '../entities/order-test.entity';

export type PublicResultFlag =
  | ResultFlag.NORMAL
  | ResultFlag.HIGH
  | ResultFlag.LOW
  | ResultFlag.POSITIVE
  | ResultFlag.NEGATIVE
  | ResultFlag.ABNORMAL;

export function normalizeOrderTestFlag(
  flag: string | ResultFlag | null | undefined,
): ResultFlag | null {
  const normalized = String(flag ?? '').trim().toUpperCase();
  if (!normalized) return null;

  if (normalized === ResultFlag.NORMAL) return ResultFlag.NORMAL;
  if (normalized === ResultFlag.HIGH || normalized === ResultFlag.CRITICAL_HIGH) {
    return ResultFlag.HIGH;
  }
  if (normalized === ResultFlag.LOW || normalized === ResultFlag.CRITICAL_LOW) {
    return ResultFlag.LOW;
  }
  if (normalized === ResultFlag.POSITIVE) return ResultFlag.POSITIVE;
  if (normalized === ResultFlag.NEGATIVE) return ResultFlag.NEGATIVE;
  if (normalized === ResultFlag.ABNORMAL) return ResultFlag.ABNORMAL;

  return null;
}
