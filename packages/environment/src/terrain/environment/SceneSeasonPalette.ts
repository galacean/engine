export const TERRAIN_SEASONS = ["spring", "summer", "autumn", "winter"] as const;

export type TerrainSeason = (typeof TERRAIN_SEASONS)[number];

/** Season used when no Scene or URL authoring state selects another one. */
export const TERRAIN_DEFAULT_SEASON: TerrainSeason = "summer";

/** Linear target tone plus its influence while authored luminance variation remains intact. */
export interface TerrainSeasonColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly influence: number;
}

/** Scene categories whose seasonal colour is shared by every matching material. */
export interface TerrainSeasonPalette {
  readonly grass: Readonly<TerrainSeasonColor>;
  readonly treeLeaf: Readonly<TerrainSeasonColor>;
  readonly treeBark: Readonly<TerrainSeasonColor>;
}

/** Unit-luminance target tone uploaded to one Scene species channel. */
export interface TerrainResolvedSeasonTone {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly influence: number;
}

/** Scene-ready target tones resolved from the four authored season palettes. */
export interface TerrainResolvedSeasonPalette {
  readonly grass: Readonly<TerrainResolvedSeasonTone>;
  readonly treeLeaf: Readonly<TerrainResolvedSeasonTone>;
  readonly treeBark: Readonly<TerrainResolvedSeasonTone>;
}

export type TerrainSeasonPaletteTable = Readonly<Record<TerrainSeason, Readonly<TerrainSeasonPalette>>>;

export interface MutableTerrainSeasonColor {
  r: number;
  g: number;
  b: number;
  influence: number;
}

export interface MutableTerrainSeasonPalette {
  grass: MutableTerrainSeasonColor;
  treeLeaf: MutableTerrainSeasonColor;
  treeBark: MutableTerrainSeasonColor;
}

export type MutableTerrainSeasonPaletteTable = Record<TerrainSeason, MutableTerrainSeasonPalette>;

interface TerrainSeasonWeights {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

interface MutableSeasonColorOutput {
  set(r: number, g: number, b: number, a: number): unknown;
}

const LINEAR_LUMINANCE_RED = 0.2126;
const LINEAR_LUMINANCE_GREEN = 0.7152;
const LINEAR_LUMINANCE_BLUE = 0.0722;

/** Recolour in the caller's existing RGB encoding, retaining weighted signal brightness within the gamut. */
export function recolorRgb(source: readonly number[], target: readonly number[]): [number, number, number] {
  for (const color of [source, target]) {
    if (color.length !== 3 || !color.every((value) => Number.isFinite(value) && value >= 0 && value <= 1))
      throw new RangeError("Recolouring requires three finite RGB channels in [0, 1]");
  }
  // This is an RGB signal-level metric, not a colour-space transfer or a physical-luminance claim.
  const brightness = (color: readonly number[]) =>
    color[0] * LINEAR_LUMINANCE_RED + color[1] * LINEAR_LUMINANCE_GREEN + color[2] * LINEAR_LUMINANCE_BLUE;
  const targetBrightness = brightness(target);
  if (targetBrightness === 0) return [0, 0, 0];
  // Scale the complete vector together: clipping individual channels would change hue.
  const scale = Math.min(brightness(source) / targetBrightness, 1 / Math.max(...target));
  return target.map((value) => value * scale) as [number, number, number];
}

/** HSV saturation of an RGB signal, with zero defined for black and achromatic colours. */
export function rgbSaturation(rgb: readonly number[]): number {
  validateRgb(rgb);
  const maximum = Math.max(...rgb);
  return maximum === 0 ? 0 : (maximum - Math.min(...rgb)) / maximum;
}

/**
 * Enforce a requested saturation floor in the caller's RGB encoding, preserving hue and HSV value.
 * A source-owned hue reference can recover coloured highlights whose RGB became achromatic.
 * Black remains black; an achromatic colour without a chromatic reference has no hue to preserve.
 */
export function minimumRgbSaturation(
  rgb: readonly number[],
  minimum: number,
  hueReference?: readonly number[]
): [number, number, number] {
  validateRgb(rgb);
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1)
    throw new RangeError("Saturation floor must be finite and in [0, 1]");
  if (hueReference) validateRgb(hueReference);
  const maximum = Math.max(...rgb),
    minimumChannel = Math.min(...rgb);
  if (maximum === 0 || rgbSaturation(rgb) >= minimum) return [...rgb] as [number, number, number];
  const hue = maximum === minimumChannel ? (hueReference ?? rgb) : rgb;
  const hueMinimum = Math.min(...hue),
    hueRange = Math.max(...hue) - hueMinimum;
  if (hueRange === 0) return [...rgb] as [number, number, number];
  const chroma = maximum * minimum,
    neutral = maximum - chroma;
  return hue.map((channel) => neutral + ((channel - hueMinimum) / hueRange) * chroma) as [number, number, number];
}

function validateRgb(rgb: readonly number[]): void {
  if (rgb.length !== 3 || !rgb.every((value) => Number.isFinite(value) && value >= 0 && value <= 1))
    throw new RangeError("RGB requires three finite channels in [0, 1]");
}

/**
 * Scene-wide seasonal appearance expressed as category base tones. Influence changes chromaticity
 * without replacing material, instance, colour-field, or region-authored luminance variation.
 */
export const TERRAIN_DEFAULT_SEASON_PALETTES: TerrainSeasonPaletteTable = Object.freeze({
  spring: freezePalette({
    // Fresh yellow-green growth lightly unifies the Scene while preserving species variation.
    grass: { r: 0.187821, g: 0.47932, b: 0.072272, influence: 0.18 },
    treeLeaf: { r: 0.171441, g: 0.57758, b: 0.102242, influence: 0.16 },
    treeBark: { r: 0.254152, g: 0.138432, b: 0.06301, influence: 0.06 }
  }),
  summer: freezePalette({
    // Mature vegetation uses denser, cooler greens with a stronger but still partial blend.
    grass: { r: 0.049707, g: 0.266356, b: 0.042311, influence: 0.24 },
    treeLeaf: { r: 0.021219, g: 0.171441, b: 0.046665, influence: 0.22 },
    treeBark: { r: 0.147027, g: 0.082283, b: 0.039546, influence: 0.1 }
  }),
  autumn: freezePalette({
    grass: {
      r: 0.5457244613701866,
      g: 0.13286832155381798,
      b: 0.06847816984440017,
      influence: 1
    },
    treeLeaf: {
      r: 0.9473065367331999,
      g: 0.02315336617811041,
      b: 0.006512090792594475,
      influence: 0.7
    },
    treeBark: {
      r: 0.31398871337571754,
      g: 0.31398871337571754,
      b: 0.31398871337571754,
      influence: 0.55
    }
  }),
  winter: freezePalette({
    // Dormant grass and surviving foliage shift toward cool, low-chroma winter tones without snow.
    grass: { r: 0.258183, g: 0.242281, b: 0.147027, influence: 0.5 },
    treeLeaf: { r: 0.097587, g: 0.132868, b: 0.0865, influence: 0.4 },
    treeBark: { r: 0.152926, g: 0.122139, b: 0.095307, influence: 0.12 }
  })
});

/** Creates the one mutable authoring table owned by a World environment runtime. */
export function createTerrainSeasonPaletteTable(
  source: TerrainSeasonPaletteTable = TERRAIN_DEFAULT_SEASON_PALETTES
): MutableTerrainSeasonPaletteTable {
  return {
    spring: clonePalette(source.spring),
    summer: clonePalette(source.summer),
    autumn: clonePalette(source.autumn),
    winter: clonePalette(source.winter)
  };
}

/** Resolves the active palette into caller-owned, unit-luminance Scene tones without allocating. */
export function resolveTerrainSeasonColors(
  weights: Readonly<TerrainSeasonWeights>,
  palettes: TerrainSeasonPaletteTable,
  grass: MutableSeasonColorOutput,
  treeLeaf: MutableSeasonColorOutput,
  treeBark: MutableSeasonColorOutput
): void {
  resolveCategory(weights, palettes, "grass", grass);
  resolveCategory(weights, palettes, "treeLeaf", treeLeaf);
  resolveCategory(weights, palettes, "treeBark", treeBark);
}

function resolveCategory(
  weights: Readonly<TerrainSeasonWeights>,
  palettes: TerrainSeasonPaletteTable,
  category: keyof TerrainSeasonPalette,
  output: MutableSeasonColorOutput
): void {
  const spring = palettes.spring[category];
  const summer = palettes.summer[category];
  const autumn = palettes.autumn[category];
  const winter = palettes.winter[category];
  const springAmount = weights.x * spring.influence;
  const summerAmount = weights.y * summer.influence;
  const autumnAmount = weights.z * autumn.influence;
  const winterAmount = weights.w * winter.influence;
  const influence = clamp01(springAmount + summerAmount + autumnAmount + winterAmount);
  if (influence <= 1e-6) {
    output.set(1, 1, 1, 0);
    return;
  }
  const inverseInfluence = 1 / influence;
  const targetR =
    (spring.r * springAmount + summer.r * summerAmount + autumn.r * autumnAmount + winter.r * winterAmount) *
    inverseInfluence;
  const targetG =
    (spring.g * springAmount + summer.g * summerAmount + autumn.g * autumnAmount + winter.g * winterAmount) *
    inverseInfluence;
  const targetB =
    (spring.b * springAmount + summer.b * summerAmount + autumn.b * autumnAmount + winter.b * winterAmount) *
    inverseInfluence;
  const targetLuminance =
    targetR * LINEAR_LUMINANCE_RED + targetG * LINEAR_LUMINANCE_GREEN + targetB * LINEAR_LUMINANCE_BLUE;
  if (targetLuminance <= 1e-6) {
    output.set(1, 1, 1, 0);
    return;
  }
  const inverseTargetLuminance = 1 / targetLuminance;
  output.set(
    targetR * inverseTargetLuminance,
    targetG * inverseTargetLuminance,
    targetB * inverseTargetLuminance,
    influence
  );
}

function clonePalette(source: Readonly<TerrainSeasonPalette>): MutableTerrainSeasonPalette {
  return {
    grass: { ...source.grass },
    treeLeaf: { ...source.treeLeaf },
    treeBark: { ...source.treeBark }
  };
}

function freezePalette(palette: TerrainSeasonPalette): Readonly<TerrainSeasonPalette> {
  return Object.freeze({
    grass: Object.freeze({ ...palette.grass }),
    treeLeaf: Object.freeze({ ...palette.treeLeaf }),
    treeBark: Object.freeze({ ...palette.treeBark })
  });
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
