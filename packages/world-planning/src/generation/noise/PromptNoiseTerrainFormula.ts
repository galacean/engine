/** World-space point used by analytic terrain features. */
export interface PromptNoisePointV1 {
  /** World X coordinate in metres. */
  readonly x: number;
  /** World Z coordinate in metres. */
  readonly z: number;
}

/** Quadratic-curve riverbed that replaces the underlying procedural elevation. */
export interface PromptNoiseRiverFormulaV1 {
  /** Whether the river operator participates in height evaluation. */
  readonly enabled: boolean;
  /** Quadratic Bezier start point. */
  readonly start: PromptNoisePointV1;
  /** Quadratic Bezier control point controlling meander. */
  readonly control: PromptNoisePointV1;
  /** Quadratic Bezier end point. */
  readonly end: PromptNoisePointV1;
  /** Riverbed elevation at the start point in metres. */
  readonly startHeight: number;
  /** Riverbed elevation at the end point in metres. */
  readonly endHeight: number;
  /** Half width of the nearly flat riverbed in metres. */
  readonly halfWidth: number;
  /** Width over which the river primitive blends back into FBM terrain in metres. */
  readonly bankWidth: number;
  /** Elevation gained from the river center to the outer bank in metres. */
  readonly bankHeight: number;
  /** Replacement strength in the inclusive range 0–1. */
  readonly strength: number;
}

/** Compact circular height constraint equivalent to a replayable flatten brush. */
export interface PromptNoiseFlattenFormulaV1 {
  /** Whether the flatten operator participates in height evaluation. */
  readonly enabled: boolean;
  /** Center of the affected world-space disk. */
  readonly center: PromptNoisePointV1;
  /** Outer radius of the affected disk in metres. */
  readonly radius: number;
  /** Width of the smooth boundary transition in metres. */
  readonly falloff: number;
  /** Elevation approached inside the disk in metres. */
  readonly targetHeight: number;
  /** Flatten strength in the inclusive range 0–1. */
  readonly strength: number;
}

/** Local five-tap diffusion stencil equivalent to one replayable smooth-brush step. */
export interface PromptNoiseSmoothFormulaV1 {
  /** Whether the smooth operator participates in height evaluation. */
  readonly enabled: boolean;
  /** Center of the affected world-space disk. */
  readonly center: PromptNoisePointV1;
  /** Outer radius of the affected disk in metres. */
  readonly radius: number;
  /** Width of the smooth boundary transition in metres. */
  readonly falloff: number;
  /** Neighbor distance used by the five-tap stencil in metres. */
  readonly sampleRadius: number;
  /** Diffusion strength in the inclusive range 0–1. */
  readonly strength: number;
}

/** Versioned analytic terrain recipe persisted instead of raster height edits. */
export interface PromptNoiseTerrainFormulaV2 {
  /** Contract version used by copied world codes. */
  readonly version: 2;
  /** Root seed from which independent stochastic terrain stages are derived. */
  readonly rootSeed: number;
  /** Vertical contribution of the continuous seeded ridge field in metres. */
  readonly ridgeStrength: number;
  /** World-space ridge frequency in inverse metres. */
  readonly ridgeFrequency: number;
  /** Exponent controlling ridge width while preserving continuous crest lines. */
  readonly ridgeSharpness: number;
  /** Curve-skeleton river replacement operator. */
  readonly river: PromptNoiseRiverFormulaV1;
  /** Local target-height constraint operator. */
  readonly flatten: PromptNoiseFlattenFormulaV1;
  /** Local diffusion operator evaluated after river and flatten constraints. */
  readonly smooth: PromptNoiseSmoothFormulaV1;
}

/** Default formula showing all three analytic edit operators around the demo origin. */
export const DEFAULT_PROMPT_NOISE_TERRAIN_FORMULA: PromptNoiseTerrainFormulaV2 = normalizePromptNoiseTerrainFormula({
  version: 2,
  rootSeed: 0x2b61_4fe3,
  ridgeStrength: 72,
  ridgeFrequency: 0.0015,
  ridgeSharpness: 4,
  river: {
    enabled: true,
    start: { x: -1150, z: 520 },
    control: { x: -80, z: -620 },
    end: { x: 1150, z: 360 },
    startHeight: 135,
    endHeight: 95,
    halfWidth: 42,
    bankWidth: 210,
    bankHeight: 78,
    strength: 0.82
  },
  flatten: {
    enabled: true,
    center: { x: -460, z: -260 },
    radius: 230,
    falloff: 90,
    targetHeight: 135,
    strength: 0.82
  },
  smooth: {
    enabled: true,
    center: { x: 430, z: 250 },
    radius: 360,
    falloff: 150,
    sampleRadius: 42,
    strength: 0.9
  }
});

/**
 * Validates and detaches an analytic terrain recipe.
 * @param formula Candidate formula from GUI, world code, or a prompt compiler.
 * @returns Frozen formula safe to retain as the authoritative replay recipe.
 * @throws If a version, coordinate, unit, or normalized strength is invalid.
 */
export function normalizePromptNoiseTerrainFormula(formula: PromptNoiseTerrainFormulaV2): PromptNoiseTerrainFormulaV2 {
  if (
    formula.version !== 2 ||
    !Number.isInteger(formula.rootSeed) ||
    formula.rootSeed < 0 ||
    formula.rootSeed > 0xffff_ffff ||
    !isNonNegativeFinite(formula.ridgeStrength) ||
    !isPositiveFinite(formula.ridgeFrequency) ||
    !isPositiveFinite(formula.ridgeSharpness) ||
    formula.ridgeSharpness < 1
  ) {
    throw new RangeError("Prompt-noise terrain base formula is invalid");
  }
  assertPoint(formula.river.start, "river start");
  assertPoint(formula.river.control, "river control");
  assertPoint(formula.river.end, "river end");
  if (
    !Number.isFinite(formula.river.startHeight) ||
    !Number.isFinite(formula.river.endHeight) ||
    !isPositiveFinite(formula.river.halfWidth) ||
    !isPositiveFinite(formula.river.bankWidth) ||
    !isNonNegativeFinite(formula.river.bankHeight) ||
    !isUnitInterval(formula.river.strength)
  ) {
    throw new RangeError("Prompt-noise river formula is invalid");
  }
  assertPoint(formula.flatten.center, "flatten center");
  if (
    !isPositiveFinite(formula.flatten.radius) ||
    !isPositiveFinite(formula.flatten.falloff) ||
    formula.flatten.falloff > formula.flatten.radius ||
    !Number.isFinite(formula.flatten.targetHeight) ||
    !isUnitInterval(formula.flatten.strength)
  ) {
    throw new RangeError("Prompt-noise flatten formula is invalid");
  }
  assertPoint(formula.smooth.center, "smooth center");
  if (
    !isPositiveFinite(formula.smooth.radius) ||
    !isPositiveFinite(formula.smooth.falloff) ||
    formula.smooth.falloff > formula.smooth.radius ||
    !isPositiveFinite(formula.smooth.sampleRadius) ||
    !isUnitInterval(formula.smooth.strength)
  ) {
    throw new RangeError("Prompt-noise smooth formula is invalid");
  }

  return Object.freeze({
    version: 2,
    rootSeed: formula.rootSeed >>> 0,
    ridgeStrength: formula.ridgeStrength,
    ridgeFrequency: formula.ridgeFrequency,
    ridgeSharpness: formula.ridgeSharpness,
    river: freezeRiver(formula.river),
    flatten: freezeFlatten(formula.flatten),
    smooth: freezeSmooth(formula.smooth)
  });
}

/**
 * Encodes every seed and analytic operator parameter into a portable world code.
 * @param formula Formula to validate and serialize.
 * @returns Base64URL world code that replays the same continuous height function.
 */
export function encodePromptNoiseWorldCode(formula: PromptNoiseTerrainFormulaV2): string {
  const json = JSON.stringify(normalizePromptNoiseTerrainFormula(formula));
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `pnw2.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "")}`;
}

/**
 * Decodes and validates a portable analytic terrain world code.
 * @param worldCode Code produced by {@link encodePromptNoiseWorldCode}.
 * @returns Frozen replay formula.
 * @throws If the prefix, Base64URL payload, JSON, or formula values are invalid.
 */
export function decodePromptNoiseWorldCode(worldCode: string): PromptNoiseTerrainFormulaV2 {
  if (!worldCode.startsWith("pnw2.")) throw new RangeError("Prompt-noise world code prefix is invalid");
  const encoded = worldCode.slice(5).replaceAll("-", "+").replaceAll("_", "/");
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return normalizePromptNoiseTerrainFormula(JSON.parse(new TextDecoder().decode(bytes)));
}

function freezePoint(point: PromptNoisePointV1): PromptNoisePointV1 {
  return Object.freeze({ x: point.x, z: point.z });
}

function freezeRiver(river: PromptNoiseRiverFormulaV1): PromptNoiseRiverFormulaV1 {
  return Object.freeze({
    ...river,
    start: freezePoint(river.start),
    control: freezePoint(river.control),
    end: freezePoint(river.end)
  });
}

function freezeFlatten(flatten: PromptNoiseFlattenFormulaV1): PromptNoiseFlattenFormulaV1 {
  return Object.freeze({ ...flatten, center: freezePoint(flatten.center) });
}

function freezeSmooth(smooth: PromptNoiseSmoothFormulaV1): PromptNoiseSmoothFormulaV1 {
  return Object.freeze({ ...smooth, center: freezePoint(smooth.center) });
}

function assertPoint(point: PromptNoisePointV1, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    throw new RangeError(`Prompt-noise ${label} is invalid`);
  }
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
