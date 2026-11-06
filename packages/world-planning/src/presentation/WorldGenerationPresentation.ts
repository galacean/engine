/** Shared presentation timings for the conversational world demonstration. */
export interface WorldGenerationPresentationSettings {
  /** Duration of the first world-scale reveal. */
  readonly entranceDurationMs: number;
  /** Duration of one locally generated flora reveal. */
  readonly vegetationRevealDurationMs: number;
  /** Duration of the authored water reveal. */
  readonly waterRevealDurationMs: number;
  /** Duration of the daylight transition. */
  readonly timeTransitionDurationMs: number;
  /** Minimum visible planning time before one chat action starts. */
  readonly chatThinkingMinimumMs: number;
  /** Additional bounded variation applied to chat planning time. */
  readonly chatThinkingVariationMs: number;
  /** World-space vertical amplitude used by the entry wave crest. */
  readonly entranceLiftMetres: number;
  /** World-space crest height used by generated flora. */
  readonly vegetationLiftMetres: number;
}

/** Fixed visual pacing collected away from data and command semantics. */
export const WORLD_GENERATION_PRESENTATION: WorldGenerationPresentationSettings = Object.freeze({
  entranceDurationMs: 3200,
  vegetationRevealDurationMs: 3600,
  waterRevealDurationMs: 1800,
  timeTransitionDurationMs: 5200,
  chatThinkingMinimumMs: 1440,
  chatThinkingVariationMs: 1080,
  entranceLiftMetres: 0,
  vegetationLiftMetres: 2.4
});

/**
 * Accelerates the entrance wave from rest while preserving its exact endpoints.
 * @param progress Linear playback progress.
 * @returns Cubic ease-in progress clamped to `[0, 1]`.
 * @throws If `progress` is not finite.
 */
export function easeInWorldEntranceWave(progress: number): number {
  if (!Number.isFinite(progress)) throw new RangeError("World entrance wave progress must be finite");
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * clamped * clamped;
}

/** One sampled point on the local reveal curve. */
export interface WorldGenerationRevealSample {
  /** Fraction of the target content that may be visible. */
  readonly reveal: number;
  /** Vertical displacement in metres relative to the authored position. */
  readonly verticalOffset: number;
}

/**
 * Samples the localized crest used by temporary generated content.
 * @param progress Normalized reveal progress.
 * @param liftMetres Maximum vertical crest displacement.
 * @returns Visibility and vertical offset that both settle exactly at authored state.
 */
export function resolveWorldGenerationRevealSample(progress: number, liftMetres: number): WorldGenerationRevealSample {
  const clamped = clampUnit(progress);
  if (!Number.isFinite(liftMetres) || liftMetres < 0) {
    throw new RangeError("World generation reveal lift must be finite and non-negative");
  }
  return {
    reveal: clamped,
    verticalOffset: clamped === 0 || clamped === 1 ? 0 : Math.sin(clamped * Math.PI) * liftMetres * 0.24
  };
}

/**
 * Interpolates a local clock by the shortest 24-hour arc.
 * @param fromHours Current local hour in `[0, 24)`.
 * @param targetHours Requested local hour in `[0, 24)`.
 * @param progress Normalized animation progress.
 * @returns Normalized local hour in `[0, 24)`.
 */
export function interpolateWorldGenerationTime(fromHours: number, targetHours: number, progress: number): number {
  if (!Number.isFinite(fromHours) || !Number.isFinite(targetHours)) {
    throw new RangeError("World generation time values must be finite");
  }
  const from = normalizeHours(fromHours);
  const target = normalizeHours(targetHours);
  const delta = ((target - from + 36) % 24) - 12;
  return normalizeHours(from + delta * clampUnit(progress));
}

/**
 * Resolves a bounded randomized planning delay for one chat action.
 * @param random Source of a normalized random sample.
 * @returns Visible planning duration in milliseconds.
 */
export function resolveWorldGenerationChatThinkingDuration(random: () => number = Math.random): number {
  const sample = clampUnit(random());
  return (
    WORLD_GENERATION_PRESENTATION.chatThinkingMinimumMs +
    Math.round(sample * WORLD_GENERATION_PRESENTATION.chatThinkingVariationMs)
  );
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeHours(value: number): number {
  return ((value % 24) + 24) % 24;
}
