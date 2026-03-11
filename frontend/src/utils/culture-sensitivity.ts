import type { AntibioticDto, CultureResultPayload } from '../api/client';

type UnknownRecord = Record<string, unknown>;

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toNullableText(value: unknown): string | null {
  const text = toText(value);
  return text.length > 0 ? text : null;
}

export function formatCultureResultSummary(
  result: CultureResultPayload | null | undefined,
): string | null {
  if (!result || typeof result !== 'object') return null;
  if (result.noGrowth === true) {
    const noGrowthResult = toText(result.noGrowthResult);
    return noGrowthResult.length > 0 ? noGrowthResult : 'No growth';
  }
  if (!Array.isArray(result.isolates) || result.isolates.length === 0) {
    const notes = toText(result.notes);
    return notes.length > 0 ? 'Culture notes entered' : null;
  }
  const isolateCount = result.isolates.length;
  const antibioticCount = result.isolates.reduce(
    (sum, isolate) =>
      sum + (Array.isArray(isolate.antibiotics) ? isolate.antibiotics.length : 0),
    0,
  );
  return `${isolateCount} isolate${isolateCount === 1 ? '' : 's'} - ${antibioticCount} antibiotic${antibioticCount === 1 ? '' : 's'} entered`;
}

export function normalizeCultureResultForForm(
  rawResult: CultureResultPayload | null | undefined,
): CultureResultPayload {
  if (!rawResult || typeof rawResult !== 'object') {
    return {
      noGrowth: false,
      noGrowthResult: '',
      notes: '',
      isolates: [],
    };
  }

  const noGrowth = rawResult.noGrowth === true;
  const noGrowthResult =
    typeof rawResult.noGrowthResult === 'string' ? rawResult.noGrowthResult : '';
  const notes = typeof rawResult.notes === 'string' ? rawResult.notes : '';
  const rawIsolates = Array.isArray(rawResult.isolates) ? rawResult.isolates : [];

  const isolates = rawIsolates
    .map((isolate, isolateIndex) => {
      const isolateKey = toText(isolate?.isolateKey) || `isolate-${isolateIndex + 1}`;
      const organism = toText(isolate?.organism);
      const source = typeof isolate?.source === 'string' ? isolate.source : '';
      const condition = typeof isolate?.condition === 'string' ? isolate.condition : '';
      const colonyCount =
        typeof isolate?.colonyCount === 'string' ? isolate.colonyCount : '';
      const comment = typeof isolate?.comment === 'string' ? isolate.comment : '';
      const rawRows = Array.isArray(isolate?.antibiotics) ? isolate.antibiotics : [];

      const antibiotics = rawRows
        .map((row) => {
          const antibioticId = toNullableText(row?.antibioticId);
          const antibioticCode = toNullableText(row?.antibioticCode);
          const antibioticName = toNullableText(row?.antibioticName);
          const interpretation = toText(row?.interpretation).toUpperCase();
          const mic = toNullableText(row?.mic);
          if (
            !antibioticId &&
            !antibioticCode &&
            !antibioticName &&
            !interpretation &&
            !mic
          ) {
            return null;
          }
          return {
            antibioticId: antibioticId ?? undefined,
            antibioticCode: antibioticCode ?? undefined,
            antibioticName: antibioticName ?? undefined,
            interpretation,
            mic: mic ?? '',
          };
        })
        .filter(
          (
            row,
          ): row is {
            antibioticId?: string;
            antibioticCode?: string;
            antibioticName?: string;
            interpretation: string;
            mic: string;
          } => Boolean(row),
        );

      if (
        !organism &&
        !source &&
        !condition &&
        !colonyCount &&
        !comment &&
        antibiotics.length === 0
      ) {
        return null;
      }
      return {
        isolateKey,
        organism,
        source,
        condition,
        colonyCount,
        comment,
        antibiotics,
      };
    })
    .filter(
      (
        isolate,
      ): isolate is {
        isolateKey: string;
        organism: string;
        source: string;
        condition: string;
        colonyCount: string;
        comment: string;
        antibiotics: Array<{
          antibioticId?: string;
          antibioticCode?: string;
          antibioticName?: string;
          interpretation: string;
          mic: string;
        }>;
      } => Boolean(isolate),
    );

  return {
    noGrowth,
    noGrowthResult,
    notes,
    isolates,
  };
}

export function buildCultureResultPayloadFromForm(
  rawValue: unknown,
  antibioticById: Map<string, AntibioticDto>,
): CultureResultPayload {
  const value =
    rawValue && typeof rawValue === 'object'
      ? (rawValue as UnknownRecord)
      : ({} as UnknownRecord);
  const noGrowth = value.noGrowth === true;
  const noGrowthResult = toNullableText(value.noGrowthResult);
  const notes = toNullableText(value.notes);
  const rawIsolates = Array.isArray(value.isolates) ? value.isolates : [];

  const isolates = rawIsolates
    .map((rawIsolate, isolateIndex) => {
        const isolate =
          rawIsolate && typeof rawIsolate === 'object'
            ? (rawIsolate as UnknownRecord)
            : ({} as UnknownRecord);

        const isolateKey =
          toText(isolate.isolateKey) || `isolate-${isolateIndex + 1}`;
        const organism = toText(isolate.organism);
        const source = toNullableText(isolate.source);
        const condition = toNullableText(isolate.condition);
        const colonyCount = toNullableText(isolate.colonyCount);
        const comment = toNullableText(isolate.comment);
        const rawRows = Array.isArray(isolate.antibiotics) ? isolate.antibiotics : [];

        const antibiotics = rawRows
          .map((rawRow) => {
            const row =
              rawRow && typeof rawRow === 'object'
                ? (rawRow as UnknownRecord)
                : ({} as UnknownRecord);

            const antibioticId = toNullableText(row.antibioticId);
            const knownAntibiotic = antibioticId
              ? antibioticById.get(antibioticId)
              : null;
            const antibioticCode = (
              knownAntibiotic?.code ?? toNullableText(row.antibioticCode)
            )?.toUpperCase() || null;
            const antibioticName =
              knownAntibiotic?.name ?? toNullableText(row.antibioticName);
            const interpretation = toText(row.interpretation).toUpperCase();
            const mic = toNullableText(row.mic);

            if (
              !antibioticId &&
              !antibioticCode &&
              !antibioticName &&
              !interpretation &&
              !mic
            ) {
              return null;
            }

            return {
              antibioticId,
              antibioticCode,
              antibioticName,
              interpretation,
              mic,
            };
          })
          .filter(
            (
              row,
            ): row is {
              antibioticId: string | null;
              antibioticCode: string | null;
              antibioticName: string | null;
              interpretation: string;
              mic: string | null;
            } => Boolean(row),
          );

        if (
          !organism &&
          !source &&
          !condition &&
          !colonyCount &&
          !comment &&
          antibiotics.length === 0
        ) {
          return null;
        }

        return {
          isolateKey,
          organism,
          source,
          condition,
          colonyCount,
          comment,
          antibiotics,
        };
      })
    .filter(
      (
        isolate,
      ): isolate is {
        isolateKey: string;
        organism: string;
        source: string | null;
        condition: string | null;
        colonyCount: string | null;
        comment: string | null;
        antibiotics: Array<{
          antibioticId: string | null;
          antibioticCode: string | null;
          antibioticName: string | null;
          interpretation: string;
          mic: string | null;
        }>;
      } => Boolean(isolate),
    );

  return {
    noGrowth,
    noGrowthResult,
    notes,
    isolates,
  };
}

export function buildCultureAntibioticOptions(
  antibiotics: AntibioticDto[],
  preferredIds: string[] | undefined,
): Array<{ value: string; label: string }> {
  const preferred = new Set((preferredIds ?? []).filter((id) => id.trim().length > 0));
  const ordered: AntibioticDto[] = [];
  const seen = new Set<string>();

  for (const id of preferred) {
    const matched = antibiotics.find((antibiotic) => antibiotic.id === id);
    if (matched && !seen.has(matched.id)) {
      ordered.push(matched);
      seen.add(matched.id);
    }
  }

  for (const antibiotic of antibiotics) {
    if (seen.has(antibiotic.id)) continue;
    if (!antibiotic.isActive && !preferred.has(antibiotic.id)) continue;
    ordered.push(antibiotic);
    seen.add(antibiotic.id);
  }

  return ordered.map((antibiotic) => ({
    value: antibiotic.id,
    label: `${antibiotic.code} - ${antibiotic.name}`,
  }));
}
