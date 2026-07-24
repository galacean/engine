export interface OceanAnalyticWhitecapProfile {
  readonly compressionStart: number;
  readonly compressionEnd: number;
  readonly crestStart: number;
  readonly crestEnd: number;
}

export interface OceanAnalyticWhitecapSample {
  compression: number;
  mask: number;
}

export const DEFAULT_OCEAN_ANALYTIC_WHITECAP_PROFILE: Readonly<OceanAnalyticWhitecapProfile> =
  Object.freeze({
    compressionStart: 0.12,
    compressionEnd: 0.52,
    crestStart: 0.16,
    crestEnd: 0.64
  });

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const t = clamp01((value - minimum) / Math.max(maximum - minimum, 1e-8));
  return t * t * (3 - 2 * t);
}

export function createOceanAnalyticWhitecapSample(): OceanAnalyticWhitecapSample {
  return { compression: 0, mask: 0 };
}

/** Pure analytic crest-compression mask; it owns no finite Ocean history. */
export function evaluateOceanAnalyticWhitecap(
  horizontalJacobianDeterminant: number,
  normalizedCrest: number,
  out: OceanAnalyticWhitecapSample,
  profile: Readonly<OceanAnalyticWhitecapProfile> =
    DEFAULT_OCEAN_ANALYTIC_WHITECAP_PROFILE
): OceanAnalyticWhitecapSample {
  const safeJacobian = Number.isFinite(horizontalJacobianDeterminant)
    ? horizontalJacobianDeterminant
    : 1;
  const safeCrest = Number.isFinite(normalizedCrest)
    ? clamp01(normalizedCrest)
    : 0;
  const compression = clamp01(1 - safeJacobian);
  out.compression = compression;
  out.mask =
    smoothstep(
      profile.compressionStart,
      profile.compressionEnd,
      compression
    ) *
    smoothstep(profile.crestStart, profile.crestEnd, safeCrest);
  return out;
}

function glsl(value: number): string {
  return value.toFixed(8);
}

export function createOceanAnalyticWhitecapGlsl(): string {
  const profile = DEFAULT_OCEAN_ANALYTIC_WHITECAP_PROFILE;
  return `      float evaluateOceanAnalyticWhitecap(
        float horizontalJacobianDeterminant,
        float normalizedCrest
      ) {
        float compression = clamp(
          1.0 - horizontalJacobianDeterminant,
          0.0,
          1.0
        );
        return smoothstep(
          ${glsl(profile.compressionStart)},
          ${glsl(profile.compressionEnd)},
          compression
        ) * smoothstep(
          ${glsl(profile.crestStart)},
          ${glsl(profile.crestEnd)},
          clamp(normalizedCrest, 0.0, 1.0)
        );
      }`;
}
