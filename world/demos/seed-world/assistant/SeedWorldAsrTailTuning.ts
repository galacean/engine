export interface SeedWorldAsrTailTuning {
  readonly minimumMilliseconds: number;
  readonly textSettleMilliseconds: number;
  readonly maximumMilliseconds: number;
}

export const DEFAULT_SEED_WORLD_ASR_TAIL_TUNING: SeedWorldAsrTailTuning = Object.freeze({
  minimumMilliseconds: 2_000,
  textSettleMilliseconds: 300,
  maximumMilliseconds: 2_500
});

export const SEED_WORLD_ASR_TAIL_TUNING_LIMITS = Object.freeze({
  minimumMilliseconds: Object.freeze({ minimum: 0, maximum: 5_000 }),
  textSettleMilliseconds: Object.freeze({ minimum: 0, maximum: 2_000 }),
  maximumMilliseconds: Object.freeze({ minimum: 100, maximum: 8_000 })
});

export const SEED_WORLD_ASR_TAIL_TUNING_STORAGE_KEY = "seed-world-asr-tail-tuning-v1";

export function normalizeSeedWorldAsrTailTuning(value: unknown): SeedWorldAsrTailTuning {
  const record = isRecord(value) ? value : {};
  const minimumMilliseconds = boundedInteger(
    record.minimumMilliseconds,
    DEFAULT_SEED_WORLD_ASR_TAIL_TUNING.minimumMilliseconds,
    SEED_WORLD_ASR_TAIL_TUNING_LIMITS.minimumMilliseconds
  );
  const textSettleMilliseconds = boundedInteger(
    record.textSettleMilliseconds,
    DEFAULT_SEED_WORLD_ASR_TAIL_TUNING.textSettleMilliseconds,
    SEED_WORLD_ASR_TAIL_TUNING_LIMITS.textSettleMilliseconds
  );
  const requestedMaximumMilliseconds = boundedInteger(
    record.maximumMilliseconds,
    DEFAULT_SEED_WORLD_ASR_TAIL_TUNING.maximumMilliseconds,
    SEED_WORLD_ASR_TAIL_TUNING_LIMITS.maximumMilliseconds
  );
  return Object.freeze({
    minimumMilliseconds,
    textSettleMilliseconds,
    maximumMilliseconds: Math.max(minimumMilliseconds, requestedMaximumMilliseconds)
  });
}

export function loadSeedWorldAsrTailTuning(
  storage: Pick<Storage, "getItem"> | undefined = browserStorage()
): SeedWorldAsrTailTuning {
  if (!storage) return DEFAULT_SEED_WORLD_ASR_TAIL_TUNING;
  try {
    const serialized = storage.getItem(SEED_WORLD_ASR_TAIL_TUNING_STORAGE_KEY);
    return serialized ? normalizeSeedWorldAsrTailTuning(JSON.parse(serialized)) : DEFAULT_SEED_WORLD_ASR_TAIL_TUNING;
  } catch {
    return DEFAULT_SEED_WORLD_ASR_TAIL_TUNING;
  }
}

export function saveSeedWorldAsrTailTuning(
  value: SeedWorldAsrTailTuning,
  storage: Pick<Storage, "setItem"> | undefined = browserStorage()
): SeedWorldAsrTailTuning {
  const normalized = normalizeSeedWorldAsrTailTuning(value);
  try {
    storage?.setItem(SEED_WORLD_ASR_TAIL_TUNING_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
  return normalized;
}

export function resolveSeedWorldAsrTailDeadlineMilliseconds(
  tuning: SeedWorldAsrTailTuning,
  releasedAtMilliseconds: number,
  lastTranscriptAtMilliseconds: number | undefined
): number {
  const minimumDeadline = releasedAtMilliseconds + tuning.minimumMilliseconds;
  const maximumDeadline = releasedAtMilliseconds + tuning.maximumMilliseconds;
  const textSettledDeadline =
    lastTranscriptAtMilliseconds !== undefined && lastTranscriptAtMilliseconds > releasedAtMilliseconds
      ? lastTranscriptAtMilliseconds + tuning.textSettleMilliseconds
      : minimumDeadline;
  return Math.min(maximumDeadline, Math.max(minimumDeadline, textSettledDeadline));
}

function boundedInteger(
  value: unknown,
  fallback: number,
  limits: Readonly<{ minimum: number; maximum: number }>
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(limits.maximum, Math.max(limits.minimum, Math.round(numeric)));
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
