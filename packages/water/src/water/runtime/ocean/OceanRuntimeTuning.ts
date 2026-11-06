import {
  WaterSurfaceDepthResponseModelV2,
  type WaterSurfaceDepthResponseV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { OCEAN_LOOK } from "../../authoring/ocean/presets/OceanLook";

export interface OceanRuntimeTuning {
  readonly wave: Readonly<{
    height: number;
    distance: number;
    speed: number;
    steepness: number;
    /** Artistic macro-normal slope gain; does not affect wave geometry or geometric depth. */
    normalStrength: number;
    fadeStartMetres: number;
    fadeEndMetres: number;
    animationSpeed: number;
  }>;
  readonly normal: Readonly<{
    strength: number;
    tiling: readonly [number, number];
    subTiling: number;
    speed: number;
    subSpeed: number;
    distanceTiling: number;
    distanceFadeStartMetres: number;
    distanceFadeEndMetres: number;
  }>;
  readonly color: Readonly<{
    deep: readonly [number, number, number, number];
    shallow: readonly [number, number, number, number];
    horizon: readonly [number, number, number, number];
  }>;
  readonly depth: Readonly<{
    horizontal: number;
    vertical: number;
    exponent: number;
  }>;
  readonly reflection: Readonly<{
    strength: number;
    distortion: number;
    fresnelExponent: number;
    blur: number;
    sunStrength: number;
    sunSize: number;
    sunDistortion: number;
  }>;
  readonly refraction: Readonly<{
    enabled: boolean;
    strength: number;
  }>;
  readonly surfaceFoam: Readonly<{
    enabled: boolean;
    color: readonly [number, number, number, number];
    baseAmount: number;
    tiling: readonly [number, number];
    subTiling: number;
    speed: number;
    subSpeed: number;
    distortion: number;
  }>;
  readonly intersection: Readonly<{
    enabled: boolean;
    color: readonly [number, number, number, number];
    lengthMetres: number;
    falloff: number;
    tiling: number;
    speed: number;
    clipping: number;
    distortion: number;
    rippleDistance: number;
    rippleStrength: number;
  }>;
  readonly caustics: Readonly<{
    enabled: boolean;
    brightness: number;
    chromance: number;
    distortion: number;
    speed: number;
    tiling: number;
  }>;
  readonly translucency: Readonly<{
    enabled: boolean;
    strength: number;
    directStrength: number;
    exponent: number;
    curvatureMask: number;
  }>;
}

export interface OceanTuningRange {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
}

function range(minimum: number, maximum: number, step: number): OceanTuningRange {
  return Object.freeze({ minimum, maximum, step });
}

/** Safe live-editing bounds shared by the runtime validator and Water DevTools. */
export const OCEAN_TUNING_LIMITS = Object.freeze({
  wave: Object.freeze({
    height: range(0, 0.5, 0.001),
    distance: range(0, 0.95, 0.001),
    speed: range(0, 8, 0.01),
    steepness: range(0, 10, 0.01),
    normalStrength: range(0, 2, 0.001),
    fadeStartMetres: range(0, 1_000, 0.1),
    fadeEndMetres: range(1, 2_000, 0.1),
    animationSpeed: range(0, 4, 0.01)
  }),
  normal: Object.freeze({
    strength: range(0, 2, 0.001),
    tiling: range(0.001, 4, 0.001),
    subTiling: range(0.01, 4, 0.001),
    speed: range(-4, 4, 0.001),
    subSpeed: range(-4, 4, 0.001),
    distanceTiling: range(0.001, 4, 0.001),
    distanceFadeStartMetres: range(0, 1_000, 0.1),
    distanceFadeEndMetres: range(1, 2_000, 0.1)
  }),
  depth: Object.freeze({
    horizontal: range(0, 20, 0.01),
    vertical: range(0, 20, 0.01),
    exponent: range(0, 1, 0.001)
  }),
  reflection: Object.freeze({
    strength: range(0, 4, 0.01),
    distortion: range(0, 1, 0.001),
    fresnelExponent: range(0.1, 20, 0.01),
    blur: range(0, 1, 0.001),
    sunStrength: range(0, 20, 0.01),
    sunSize: range(0, 1, 0.001),
    sunDistortion: range(0, 1, 0.001)
  }),
  refraction: Object.freeze({
    strength: range(0, 1, 0.001)
  }),
  surfaceFoam: Object.freeze({
    baseAmount: range(0, 1, 0.001),
    tiling: range(0.001, 2, 0.001),
    subTiling: range(0.01, 4, 0.001),
    speed: range(-2, 2, 0.001),
    subSpeed: range(-2, 2, 0.001),
    distortion: range(0, 2, 0.001)
  }),
  intersection: Object.freeze({
    lengthMetres: range(0.01, 20, 0.01),
    falloff: range(0.01, 2, 0.001),
    tiling: range(0.001, 2, 0.001),
    speed: range(-2, 2, 0.001),
    clipping: range(0, 1, 0.001),
    distortion: range(0, 2, 0.001),
    rippleDistance: range(0, 100, 0.1),
    rippleStrength: range(0, 2, 0.001)
  }),
  caustics: Object.freeze({
    brightness: range(0, 10, 0.01),
    chromance: range(0, 1, 0.001),
    distortion: range(0, 1, 0.001),
    speed: range(-2, 2, 0.001),
    tiling: range(0.001, 2, 0.001)
  }),
  translucency: Object.freeze({
    strength: range(0, 4, 0.01),
    directStrength: range(0, 2, 0.001),
    exponent: range(0.1, 16, 0.01),
    curvatureMask: range(0, 1, 0.001)
  })
});

function assertRange(path: string, value: number, limit: OceanTuningRange): void {
  if (!Number.isFinite(value) || value < limit.minimum || value > limit.maximum) {
    throw new RangeError(`Ocean tuning '${path}' must be within [${limit.minimum}, ${limit.maximum}].`);
  }
}

function assertColor(path: string, color: readonly number[]): void {
  if (color.length !== 4) throw new RangeError(`Ocean tuning '${path}' must contain RGBA.`);
  color.forEach((value, index) => assertRange(`${path}[${index}]`, value, range(0, 1, 0.001)));
}

function assertBoolean(path: string, value: boolean): void {
  if (typeof value !== "boolean") throw new TypeError(`Ocean tuning '${path}' must be boolean.`);
}

export function assertOceanRuntimeTuning(tuning: Readonly<OceanRuntimeTuning>): void {
  const limits = OCEAN_TUNING_LIMITS;
  assertRange("wave.height", tuning.wave.height, limits.wave.height);
  assertRange("wave.distance", tuning.wave.distance, limits.wave.distance);
  assertRange("wave.speed", tuning.wave.speed, limits.wave.speed);
  assertRange("wave.steepness", tuning.wave.steepness, limits.wave.steepness);
  assertRange("wave.normalStrength", tuning.wave.normalStrength, limits.wave.normalStrength);
  assertRange("wave.fadeStartMetres", tuning.wave.fadeStartMetres, limits.wave.fadeStartMetres);
  assertRange("wave.fadeEndMetres", tuning.wave.fadeEndMetres, limits.wave.fadeEndMetres);
  if (tuning.wave.fadeEndMetres <= tuning.wave.fadeStartMetres) {
    throw new RangeError("Ocean wave fade end must be greater than fade start.");
  }
  assertRange("wave.animationSpeed", tuning.wave.animationSpeed, limits.wave.animationSpeed);

  assertRange("normal.strength", tuning.normal.strength, limits.normal.strength);
  tuning.normal.tiling.forEach((value, index) => assertRange(`normal.tiling[${index}]`, value, limits.normal.tiling));
  assertRange("normal.subTiling", tuning.normal.subTiling, limits.normal.subTiling);
  assertRange("normal.speed", tuning.normal.speed, limits.normal.speed);
  assertRange("normal.subSpeed", tuning.normal.subSpeed, limits.normal.subSpeed);
  assertRange("normal.distanceTiling", tuning.normal.distanceTiling, limits.normal.distanceTiling);
  assertRange(
    "normal.distanceFadeStartMetres",
    tuning.normal.distanceFadeStartMetres,
    limits.normal.distanceFadeStartMetres
  );
  assertRange("normal.distanceFadeEndMetres", tuning.normal.distanceFadeEndMetres, limits.normal.distanceFadeEndMetres);
  if (tuning.normal.distanceFadeEndMetres <= tuning.normal.distanceFadeStartMetres) {
    throw new RangeError("Ocean normal fade end must be greater than fade start.");
  }

  assertColor("color.deep", tuning.color.deep);
  assertColor("color.shallow", tuning.color.shallow);
  assertColor("color.horizon", tuning.color.horizon);
  assertRange("depth.horizontal", tuning.depth.horizontal, limits.depth.horizontal);
  assertRange("depth.vertical", tuning.depth.vertical, limits.depth.vertical);
  assertRange("depth.exponent", tuning.depth.exponent, limits.depth.exponent);

  assertRange("reflection.strength", tuning.reflection.strength, limits.reflection.strength);
  assertRange("reflection.distortion", tuning.reflection.distortion, limits.reflection.distortion);
  assertRange("reflection.fresnelExponent", tuning.reflection.fresnelExponent, limits.reflection.fresnelExponent);
  assertRange("reflection.blur", tuning.reflection.blur, limits.reflection.blur);
  assertRange("reflection.sunStrength", tuning.reflection.sunStrength, limits.reflection.sunStrength);
  assertRange("reflection.sunSize", tuning.reflection.sunSize, limits.reflection.sunSize);
  assertRange("reflection.sunDistortion", tuning.reflection.sunDistortion, limits.reflection.sunDistortion);
  assertRange("refraction.strength", tuning.refraction.strength, limits.refraction.strength);
  assertBoolean("refraction.enabled", tuning.refraction.enabled);

  assertBoolean("surfaceFoam.enabled", tuning.surfaceFoam.enabled);
  assertColor("surfaceFoam.color", tuning.surfaceFoam.color);
  assertRange("surfaceFoam.baseAmount", tuning.surfaceFoam.baseAmount, limits.surfaceFoam.baseAmount);
  tuning.surfaceFoam.tiling.forEach((value, index) =>
    assertRange(`surfaceFoam.tiling[${index}]`, value, limits.surfaceFoam.tiling)
  );
  assertRange("surfaceFoam.subTiling", tuning.surfaceFoam.subTiling, limits.surfaceFoam.subTiling);
  assertRange("surfaceFoam.speed", tuning.surfaceFoam.speed, limits.surfaceFoam.speed);
  assertRange("surfaceFoam.subSpeed", tuning.surfaceFoam.subSpeed, limits.surfaceFoam.subSpeed);
  assertRange("surfaceFoam.distortion", tuning.surfaceFoam.distortion, limits.surfaceFoam.distortion);

  assertBoolean("intersection.enabled", tuning.intersection.enabled);
  assertColor("intersection.color", tuning.intersection.color);
  assertRange("intersection.lengthMetres", tuning.intersection.lengthMetres, limits.intersection.lengthMetres);
  assertRange("intersection.falloff", tuning.intersection.falloff, limits.intersection.falloff);
  assertRange("intersection.tiling", tuning.intersection.tiling, limits.intersection.tiling);
  assertRange("intersection.speed", tuning.intersection.speed, limits.intersection.speed);
  assertRange("intersection.clipping", tuning.intersection.clipping, limits.intersection.clipping);
  assertRange("intersection.distortion", tuning.intersection.distortion, limits.intersection.distortion);
  assertRange("intersection.rippleDistance", tuning.intersection.rippleDistance, limits.intersection.rippleDistance);
  assertRange("intersection.rippleStrength", tuning.intersection.rippleStrength, limits.intersection.rippleStrength);

  assertBoolean("caustics.enabled", tuning.caustics.enabled);
  assertRange("caustics.brightness", tuning.caustics.brightness, limits.caustics.brightness);
  assertRange("caustics.chromance", tuning.caustics.chromance, limits.caustics.chromance);
  assertRange("caustics.distortion", tuning.caustics.distortion, limits.caustics.distortion);
  assertRange("caustics.speed", tuning.caustics.speed, limits.caustics.speed);
  assertRange("caustics.tiling", tuning.caustics.tiling, limits.caustics.tiling);
  assertBoolean("translucency.enabled", tuning.translucency.enabled);
  assertRange("translucency.strength", tuning.translucency.strength, limits.translucency.strength);
  assertRange("translucency.directStrength", tuning.translucency.directStrength, limits.translucency.directStrength);
  assertRange("translucency.exponent", tuning.translucency.exponent, limits.translucency.exponent);
  assertRange("translucency.curvatureMask", tuning.translucency.curvatureMask, limits.translucency.curvatureMask);
}

function freezeColor(color: readonly [number, number, number, number]): readonly [number, number, number, number] {
  return Object.freeze([...color] as [number, number, number, number]);
}

/** Creates an owned immutable tuning snapshot, defaulting to the Ocean material. */
export function createOceanRuntimeTuning(
  source: Readonly<OceanRuntimeTuning> = OCEAN_LOOK
): Readonly<OceanRuntimeTuning> {
  assertOceanRuntimeTuning(source);
  if (
    source.depth.exponent !== OCEAN_LOOK.depth.exponent ||
    source.reflection.fresnelExponent !== OCEAN_LOOK.reflection.fresnelExponent
  ) {
    throw new Error(
      "Ocean depth.exponent and reflection.fresnelExponent are retired: shared CompositeExponential and Schlick/DFG own these responses."
    );
  }
  return Object.freeze({
    wave: Object.freeze({
      height: source.wave.height,
      distance: source.wave.distance,
      speed: source.wave.speed,
      steepness: source.wave.steepness,
      normalStrength: source.wave.normalStrength,
      fadeStartMetres: source.wave.fadeStartMetres,
      fadeEndMetres: source.wave.fadeEndMetres,
      animationSpeed: source.wave.animationSpeed
    }),
    normal: Object.freeze({
      strength: source.normal.strength,
      tiling: Object.freeze([...source.normal.tiling] as [number, number]),
      subTiling: source.normal.subTiling,
      speed: source.normal.speed,
      subSpeed: source.normal.subSpeed,
      distanceTiling: source.normal.distanceTiling,
      distanceFadeStartMetres: source.normal.distanceFadeStartMetres,
      distanceFadeEndMetres: source.normal.distanceFadeEndMetres
    }),
    color: Object.freeze({
      deep: freezeColor(source.color.deep),
      shallow: freezeColor(source.color.shallow),
      horizon: freezeColor(source.color.horizon)
    }),
    depth: Object.freeze({
      horizontal: source.depth.horizontal,
      vertical: source.depth.vertical,
      exponent: source.depth.exponent
    }),
    reflection: Object.freeze({
      strength: source.reflection.strength,
      distortion: source.reflection.distortion,
      fresnelExponent: source.reflection.fresnelExponent,
      blur: source.reflection.blur,
      sunStrength: source.reflection.sunStrength,
      sunSize: source.reflection.sunSize,
      sunDistortion: source.reflection.sunDistortion
    }),
    refraction: Object.freeze({
      enabled: source.refraction.enabled,
      strength: source.refraction.strength
    }),
    surfaceFoam: Object.freeze({
      enabled: source.surfaceFoam.enabled,
      color: freezeColor(source.surfaceFoam.color),
      baseAmount: source.surfaceFoam.baseAmount,
      tiling: Object.freeze([...source.surfaceFoam.tiling] as [number, number]),
      subTiling: source.surfaceFoam.subTiling,
      speed: source.surfaceFoam.speed,
      subSpeed: source.surfaceFoam.subSpeed,
      distortion: source.surfaceFoam.distortion
    }),
    intersection: Object.freeze({
      enabled: source.intersection.enabled,
      color: freezeColor(source.intersection.color),
      lengthMetres: source.intersection.lengthMetres,
      falloff: source.intersection.falloff,
      tiling: source.intersection.tiling,
      speed: source.intersection.speed,
      clipping: source.intersection.clipping,
      distortion: source.intersection.distortion,
      rippleDistance: source.intersection.rippleDistance,
      rippleStrength: source.intersection.rippleStrength
    }),
    caustics: Object.freeze({
      enabled: source.caustics.enabled,
      brightness: source.caustics.brightness,
      chromance: source.caustics.chromance,
      distortion: source.caustics.distortion,
      speed: source.caustics.speed,
      tiling: source.caustics.tiling
    }),
    translucency: Object.freeze({
      enabled: source.translucency.enabled,
      strength: source.translucency.strength,
      directStrength: source.translucency.directStrength,
      exponent: source.translucency.exponent,
      curvatureMask: source.translucency.curvatureMask
    })
  });
}

/** Projects the published Water Look colors into both finite Ocean renderers. */
export function resolveOceanRuntimeColor(depth: Readonly<WaterSurfaceDepthResponseV2>): OceanRuntimeTuning["color"] {
  if (depth.model !== WaterSurfaceDepthResponseModelV2.CompositeExponential) {
    throw new Error("Ocean color authoring requires a composite-exponential depth response.");
  }
  return Object.freeze({
    shallow: Object.freeze([...depth.shallowColor] as [number, number, number, number]),
    deep: Object.freeze([...depth.deepColor] as [number, number, number, number]),
    horizon: OCEAN_LOOK.color.horizon
  });
}
