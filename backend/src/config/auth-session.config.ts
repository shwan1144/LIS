function parsePositiveInteger(input: string | undefined, fallback: number): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export const LAB_ACCESS_TOKEN_TTL_SECONDS = parsePositiveInteger(
  process.env.JWT_ACCESS_TTL,
  900,
);

export const PLATFORM_ACCESS_TOKEN_TTL_SECONDS = parsePositiveInteger(
  process.env.PLATFORM_JWT_ACCESS_TTL,
  900,
);

export const REFRESH_TOKEN_TTL_DAYS = parsePositiveInteger(
  process.env.REFRESH_TOKEN_TTL_DAYS,
  30,
);

export const LAB_ACCESS_TOKEN_TTL_MINUTES = Math.max(
  1,
  Math.ceil(LAB_ACCESS_TOKEN_TTL_SECONDS / 60),
);

export const PLATFORM_ACCESS_TOKEN_TTL_MINUTES = Math.max(
  1,
  Math.ceil(PLATFORM_ACCESS_TOKEN_TTL_SECONDS / 60),
);
