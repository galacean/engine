import type { Texture2D } from "@galacean/engine";
import { SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES } from "@galacean/engine-terrain/world/SeedWorldSurfaceColorField";

const SEED_WORLD_GRASS_COLOR_FIELD_DEFAULT_REPEAT_SIZE_METRES = 57.91867446899414;
const SEED_WORLD_GRASS_COLOR_FIELD_DEFAULT_UV_SCALE = 1 / SEED_WORLD_GRASS_COLOR_FIELD_DEFAULT_REPEAT_SIZE_METRES;
/** Whole-world UV transform used only by the Vista field. */
export const SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_SCALE = 1 / SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES;
/** Maps the centred Seed World bounds onto the Vista field once. */
export const SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_OFFSET = 0.5;
/** Keeps the authored local field unchanged through the complete near grass band. */
export const SEED_WORLD_GRASS_COLOR_FIELD_VISTA_BLEND_START_METRES = 0;
/** Completes the gradual handoff to the whole-world Vista field. */
export const SEED_WORLD_GRASS_COLOR_FIELD_VISTA_BLEND_END_METRES = 169;

/** World-space palette field shared by Seed World ground grass and grass blades. */
export interface SeedWorldGrassColorFieldTuning {
  readonly enabled: boolean;
  readonly colorA: readonly [red: number, green: number, blue: number];
  readonly colorB: readonly [red: number, green: number, blue: number];
  /** Road endpoints share this scalar field; zero strength retains the native road colour. */
  readonly roadColorA?: readonly [red: number, green: number, blue: number];
  readonly roadColorB?: readonly [red: number, green: number, blue: number];
  readonly roadColorStrength?: number;
  /** Road-only scalar remap; absent values preserve linear A/B interpolation. */
  readonly roadColorContrast?: number;
  readonly roadColorMidpoint?: number;
  /** Derived authored-channel masks; absent channels continue to receive Scene season colour. */
  readonly colorOverrideA?: readonly [red: number, green: number, blue: number];
  readonly colorOverrideB?: readonly [red: number, green: number, blue: number];
  /** Saturation multiplier applied after interpolating the two palette endpoints. */
  readonly saturation: number;
  /** Local authored-detail UV change per metre. */
  readonly uvScale: number;
  readonly angleRadians: number;
  readonly offset: readonly [u: number, v: number];
  /** Fixed world-space low-pass radius used by both Terrain and Grass. */
  readonly softnessMetres: number;
  /** Far-field filter footprint in metres; applies when Vista reuses the detail texture. */
  readonly vistaSoftnessMetres?: number;
  /** Contrast of the far scalar field around the source pattern mean; one preserves the sampled field. */
  readonly vistaContrast?: number;
  /** Mirrored far-pattern tile width in world metres. */
  readonly vistaRepeatSizeMetres?: number;
  /** Camera distance where Terrain starts blending from local R detail to the whole-world field. */
  readonly vistaBlendStartMetres: number;
  /** Camera distance where Terrain finishes blending to the whole-world field. */
  readonly vistaBlendEndMetres: number;
  readonly remapLow: number;
  readonly remapHigh: number;
}

/** Runtime texture plus the parameters that must remain identical on Terrain and Grass renderers. */
export interface SeedWorldGrassColorFieldBinding {
  readonly texture: Texture2D;
  /** Sample the near texture mip chain for Vista; omitted bindings retain legacy packed G. */
  readonly vistaFromDetail?: boolean;
  readonly tuning: SeedWorldGrassColorFieldTuning;
}

/** Original authored local-detail transform retained by the packed R channel. */
export const SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS = freezeSeedWorldGrassColorFieldTuning({
  enabled: true,
  colorA: [0, 0.1609002947807312, 0.10072337836027145],
  colorB: [0.2549428939819336, 0.5400000214576721, 0],
  roadColorA: [0.5400000214576721, 0.5250678062438965, 0.3240000307559967],
  roadColorB: paletteHexToLinear(0x66553b),
  roadColorStrength: 1,
  roadColorContrast: 1,
  roadColorMidpoint: 0.6,
  saturation: 1.1,
  uvScale: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULT_UV_SCALE,
  angleRadians: 0,
  offset: [0.25, 0.75],
  softnessMetres: 0,
  vistaSoftnessMetres: 0,
  vistaContrast: 1,
  vistaRepeatSizeMetres: 1024,
  vistaBlendStartMetres: SEED_WORLD_GRASS_COLOR_FIELD_VISTA_BLEND_START_METRES,
  vistaBlendEndMetres: SEED_WORLD_GRASS_COLOR_FIELD_VISTA_BLEND_END_METRES,
  remapLow: 0,
  remapHigh: 1
});

function paletteHexToLinear(hex: number): readonly [number, number, number] {
  return [16, 8, 0].map((shift) => {
    const channel = ((hex >> shift) & 255) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

/** Surface-only presets; world fields, season inheritance and lighting remain independent. */
export const SEED_WORLD_SURFACE_PALETTE_PRESETS = Object.freeze({
  原始草地: {
    colorA: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS.colorA,
    colorB: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS.colorB,
    roadColorA: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS.roadColorA,
    roadColorB: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS.roadColorB,
    saturation: SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS.saturation
  },
  樱花粉: {
    colorA: paletteHexToLinear(0xe55959),
    colorB: paletteHexToLinear(0xfc5a7a),
    roadColorA: paletteHexToLinear(0xf1cbc5),
    roadColorB: paletteHexToLinear(0xdca3ae),
    saturation: 1
  }
});

/** Validates and detaches one complete shared colour-field tuning value. */
export function freezeSeedWorldGrassColorFieldTuning(
  tuning: SeedWorldGrassColorFieldTuning
): SeedWorldGrassColorFieldTuning {
  if (typeof tuning.enabled !== "boolean") {
    throw new TypeError("Seed World grass colour field enabled state must be boolean");
  }
  if (!Number.isFinite(tuning.uvScale) || tuning.uvScale <= 0) {
    throw new RangeError("Seed World grass colour field UV scale must be finite and positive");
  }
  if (!Number.isFinite(tuning.angleRadians) || !tuning.offset.every(Number.isFinite)) {
    throw new RangeError("Seed World grass colour field transform must be finite");
  }
  if (!Number.isFinite(tuning.softnessMetres) || tuning.softnessMetres < 0 || tuning.softnessMetres > 32) {
    throw new RangeError("Seed World grass colour softness must be between zero and 32 metres");
  }
  if (
    tuning.vistaSoftnessMetres !== undefined &&
    (!Number.isFinite(tuning.vistaSoftnessMetres) || tuning.vistaSoftnessMetres < 0 || tuning.vistaSoftnessMetres > 768)
  ) {
    throw new RangeError("Seed World Vista softness must be between zero and 768 metres");
  }
  if (
    tuning.vistaContrast !== undefined &&
    (!Number.isFinite(tuning.vistaContrast) || tuning.vistaContrast < 1 || tuning.vistaContrast > 4)
  ) {
    throw new RangeError("Seed World Vista contrast must be between one and four");
  }
  if (
    tuning.vistaRepeatSizeMetres !== undefined &&
    (!Number.isFinite(tuning.vistaRepeatSizeMetres) ||
      tuning.vistaRepeatSizeMetres < 128 ||
      tuning.vistaRepeatSizeMetres > SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES)
  ) {
    throw new RangeError("Seed World Vista repeat size must be between 128 and 3072 metres");
  }
  if (
    !Number.isFinite(tuning.vistaBlendStartMetres) ||
    !Number.isFinite(tuning.vistaBlendEndMetres) ||
    tuning.vistaBlendStartMetres < 0 ||
    tuning.vistaBlendEndMetres <= tuning.vistaBlendStartMetres
  ) {
    throw new RangeError("Seed World grass Vista blend distances must be finite, non-negative, and ordered");
  }
  if (
    !Number.isFinite(tuning.remapLow) ||
    !Number.isFinite(tuning.remapHigh) ||
    tuning.remapLow < 0 ||
    tuning.remapHigh > 1 ||
    tuning.remapLow >= tuning.remapHigh
  ) {
    throw new RangeError("Seed World grass colour remap must be ordered inside zero and one");
  }
  if (
    ![...tuning.colorA, ...tuning.colorB].every(
      (component) => Number.isFinite(component) && component >= 0 && component <= 1
    )
  ) {
    throw new RangeError("Seed World grass palette endpoints must be finite and between zero and one");
  }
  if (!Number.isFinite(tuning.saturation) || tuning.saturation < 0 || tuning.saturation > 2) {
    throw new RangeError("Seed World grass palette saturation must be between zero and two");
  }
  for (const color of [tuning.roadColorA, tuning.roadColorB]) {
    if (color && (color.length !== 3 || !color.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)))
      throw new RangeError("Road palette endpoints must contain three finite channels within zero and one");
  }
  if (
    tuning.roadColorStrength !== undefined &&
    (!Number.isFinite(tuning.roadColorStrength) ||
      tuning.roadColorStrength < 0 ||
      tuning.roadColorStrength > 1 ||
      (tuning.roadColorStrength > 0 && (!tuning.roadColorA || !tuning.roadColorB)))
  )
    throw new RangeError("Road colour strength must be within zero and one and requires both endpoints when enabled");
  if (
    tuning.roadColorContrast !== undefined &&
    (!Number.isFinite(tuning.roadColorContrast) || tuning.roadColorContrast < 1)
  )
    throw new RangeError("Road colour contrast must be finite and at least one");
  if (
    tuning.roadColorMidpoint !== undefined &&
    (!Number.isFinite(tuning.roadColorMidpoint) || tuning.roadColorMidpoint < 0 || tuning.roadColorMidpoint > 1)
  )
    throw new RangeError("Road colour midpoint must be within zero and one");
  for (const mask of [tuning.colorOverrideA, tuning.colorOverrideB]) {
    if (mask && (mask.length !== 3 || !mask.every((value) => value === 0 || value === 1)))
      throw new RangeError("Grass authored-channel masks must contain three binary channels");
  }
  return Object.freeze({
    enabled: tuning.enabled,
    colorA: Object.freeze([...tuning.colorA] as [number, number, number]),
    colorB: Object.freeze([...tuning.colorB] as [number, number, number]),
    ...(tuning.roadColorA ? { roadColorA: Object.freeze([...tuning.roadColorA] as [number, number, number]) } : {}),
    ...(tuning.roadColorB ? { roadColorB: Object.freeze([...tuning.roadColorB] as [number, number, number]) } : {}),
    ...(tuning.roadColorStrength !== undefined ? { roadColorStrength: tuning.roadColorStrength } : {}),
    ...(tuning.roadColorContrast !== undefined ? { roadColorContrast: tuning.roadColorContrast } : {}),
    ...(tuning.roadColorMidpoint !== undefined ? { roadColorMidpoint: tuning.roadColorMidpoint } : {}),
    ...(tuning.colorOverrideA
      ? { colorOverrideA: Object.freeze([...tuning.colorOverrideA] as [number, number, number]) }
      : {}),
    ...(tuning.colorOverrideB
      ? { colorOverrideB: Object.freeze([...tuning.colorOverrideB] as [number, number, number]) }
      : {}),
    saturation: tuning.saturation,
    uvScale: tuning.uvScale,
    angleRadians: tuning.angleRadians,
    offset: Object.freeze([...tuning.offset] as [number, number]),
    softnessMetres: tuning.softnessMetres,
    ...(tuning.vistaSoftnessMetres !== undefined ? { vistaSoftnessMetres: tuning.vistaSoftnessMetres } : {}),
    ...(tuning.vistaContrast !== undefined ? { vistaContrast: tuning.vistaContrast } : {}),
    ...(tuning.vistaRepeatSizeMetres !== undefined ? { vistaRepeatSizeMetres: tuning.vistaRepeatSizeMetres } : {}),
    vistaBlendStartMetres: tuning.vistaBlendStartMetres,
    vistaBlendEndMetres: tuning.vistaBlendEndMetres,
    remapLow: tuning.remapLow,
    remapHigh: tuning.remapHigh
  });
}
