import { ShaderProperty, Vector4 } from "@galacean/engine";
import type { TerrainSeason } from "@galacean/engine-environment/terrain/environment/SceneSeasonPalette";

export type OilPaintRgb = readonly [number, number, number];
export type MutableOilPaintRgb = [number, number, number];

/** Linear-space seasonal brushstroke palette uploaded to scene shaderData (zero hardcoded season colors in GLSL). */
export interface OilPaintSeasonPalette {
  /** Four discrete sunlit brushstroke dab colors (linear RGB) sampled by per-stroke pigment ID. */
  readonly dabs: readonly [OilPaintRgb, OilPaintRgb, OilPaintRgb, OilPaintRgb];
  /** Cool brushstroke temperature tint multiplier (linear RGB). */
  readonly coolTint: OilPaintRgb;
  /** Warm brushstroke temperature tint multiplier (linear RGB). */
  readonly warmTint: OilPaintRgb;
  /** Shadow/shaded brushstroke tint multiplier (linear RGB). */
  readonly shadeTint: OilPaintRgb;
  /** Palette blend strength on terrain & foliage surfaces [0, 1]. */
  readonly paletteBlend: number;
  /** Minimum surface chroma for palette dab application (negative in winter so white snow receives snow dabs). */
  readonly chromaThreshold: number;
}

export interface MutableOilPaintSeasonPalette {
  dabs: [MutableOilPaintRgb, MutableOilPaintRgb, MutableOilPaintRgb, MutableOilPaintRgb];
  coolTint: MutableOilPaintRgb;
  warmTint: MutableOilPaintRgb;
  shadeTint: MutableOilPaintRgb;
  paletteBlend: number;
  chromaThreshold: number;
}

export type OilPaintSeasonPaletteTable = Readonly<Record<TerrainSeason, OilPaintSeasonPalette>>;
export type MutableOilPaintSeasonPaletteTable = Record<TerrainSeason, MutableOilPaintSeasonPalette>;

const SPRING_SUMMER_PALETTE: OilPaintSeasonPalette = Object.freeze({
  // Monet Giverny sunlit Impressionist palette: luminous chartreuse, meadow emerald, lemon highlight, deep forest green.
  dabs: Object.freeze([
    Object.freeze([0.5, 0.72, 0.08] as const),
    Object.freeze([0.12, 0.48, 0.05] as const),
    Object.freeze([0.86, 0.76, 0.16] as const),
    Object.freeze([0.04, 0.28, 0.06] as const)
  ] as const),
  coolTint: Object.freeze([0.78, 0.96, 1.18] as const),
  warmTint: Object.freeze([1.16, 1.14, 0.82] as const),
  shadeTint: Object.freeze([0.66, 0.84, 0.96] as const),
  paletteBlend: 0.76,
  chromaThreshold: 0.14
});

const AUTUMN_PALETTE: OilPaintSeasonPalette = Object.freeze({
  // Autumn Wood Impressionist palette: cadmium gold, burnt tangerine, autumn crimson, warm olive.
  dabs: Object.freeze([
    Object.freeze([0.95, 0.7, 0.1] as const),
    Object.freeze([0.92, 0.44, 0.07] as const),
    Object.freeze([0.78, 0.16, 0.05] as const),
    Object.freeze([0.32, 0.54, 0.11] as const)
  ] as const),
  coolTint: Object.freeze([0.84, 0.88, 1.12] as const),
  warmTint: Object.freeze([1.18, 1.06, 0.8] as const),
  shadeTint: Object.freeze([0.84, 0.7, 0.72] as const),
  paletteBlend: 0.8,
  chromaThreshold: 0.14
});

const WINTER_PALETTE: OilPaintSeasonPalette = Object.freeze({
  // Monet "The Magpie" winter snowscape: warm ivory-cream sunlit snow, frost gold, ice-blue snow, frosted pine.
  dabs: Object.freeze([
    Object.freeze([0.92, 0.86, 0.76] as const),
    Object.freeze([0.86, 0.74, 0.58] as const),
    Object.freeze([0.68, 0.8, 0.94] as const),
    Object.freeze([0.16, 0.26, 0.25] as const)
  ] as const),
  coolTint: Object.freeze([0.74, 0.86, 1.22] as const),
  warmTint: Object.freeze([1.16, 1.08, 0.9] as const),
  shadeTint: Object.freeze([0.62, 0.76, 1.08] as const),
  paletteBlend: 0.78,
  chromaThreshold: -0.15
});

/** Seasonal oil-paint palettes indexed by TerrainSeason (spring & summer intentionally share one Impressionist palette). */
export const OIL_PAINT_SEASON_PALETTES: OilPaintSeasonPaletteTable = Object.freeze({
  spring: SPRING_SUMMER_PALETTE,
  summer: SPRING_SUMMER_PALETTE,
  autumn: AUTUMN_PALETTE,
  winter: WINTER_PALETTE
});

function clonePalette(source: OilPaintSeasonPalette): MutableOilPaintSeasonPalette {
  return {
    dabs: [
      [source.dabs[0][0], source.dabs[0][1], source.dabs[0][2]],
      [source.dabs[1][0], source.dabs[1][1], source.dabs[1][2]],
      [source.dabs[2][0], source.dabs[2][1], source.dabs[2][2]],
      [source.dabs[3][0], source.dabs[3][1], source.dabs[3][2]]
    ],
    coolTint: [source.coolTint[0], source.coolTint[1], source.coolTint[2]],
    warmTint: [source.warmTint[0], source.warmTint[1], source.warmTint[2]],
    shadeTint: [source.shadeTint[0], source.shadeTint[1], source.shadeTint[2]],
    paletteBlend: source.paletteBlend,
    chromaThreshold: source.chromaThreshold
  };
}

export function cloneOilPaintSeasonPalettes(
  source: OilPaintSeasonPaletteTable = OIL_PAINT_SEASON_PALETTES
): MutableOilPaintSeasonPaletteTable {
  return {
    spring: clonePalette(source.spring),
    summer: clonePalette(source.summer),
    autumn: clonePalette(source.autumn),
    winter: clonePalette(source.winter)
  };
}

export const OIL_PAINT_DAB0 = ShaderProperty.getByName("scene_OilPaintDab0");
export const OIL_PAINT_DAB1 = ShaderProperty.getByName("scene_OilPaintDab1");
export const OIL_PAINT_DAB2 = ShaderProperty.getByName("scene_OilPaintDab2");
export const OIL_PAINT_DAB3 = ShaderProperty.getByName("scene_OilPaintDab3");
export const OIL_PAINT_COOL_TINT = ShaderProperty.getByName("scene_OilPaintCoolTint");
export const OIL_PAINT_WARM_TINT = ShaderProperty.getByName("scene_OilPaintWarmTint");
export const OIL_PAINT_SHADE_TINT = ShaderProperty.getByName("scene_OilPaintShadeTint");

export interface OilPaintSeasonUniforms {
  readonly dab0: Vector4;
  readonly dab1: Vector4;
  readonly dab2: Vector4;
  readonly dab3: Vector4;
  readonly coolTint: Vector4;
  readonly warmTint: Vector4;
  readonly shadeTint: Vector4;
}

export function createOilPaintSeasonUniforms(): OilPaintSeasonUniforms {
  return {
    dab0: new Vector4(0.95, 0.7, 0.1, 0.8),
    dab1: new Vector4(0.92, 0.44, 0.07, 0.14),
    dab2: new Vector4(0.78, 0.16, 0.05, 0),
    dab3: new Vector4(0.32, 0.54, 0.11, 0),
    coolTint: new Vector4(0.84, 0.88, 1.12, 1),
    warmTint: new Vector4(1.18, 1.06, 0.8, 1),
    shadeTint: new Vector4(0.84, 0.7, 0.72, 1)
  };
}

/** Smoothly resolves seasonal oil-paint uniforms in-place from normalized [spring, summer, autumn, winter] weights. */
export function resolveOilPaintSeasonPalette(
  weights: Readonly<{ x: number; y: number; z: number; w: number }>,
  palettes: OilPaintSeasonPaletteTable,
  out: OilPaintSeasonUniforms
): void {
  const sum = weights.x + weights.y + weights.z + weights.w;
  const inv = sum > 1e-6 ? 1 / sum : 1;
  const wSp = weights.x * inv;
  const wSu = weights.y * inv;
  const wAu = weights.z * inv;
  const wWi = weights.w * inv;

  const sp = palettes.spring;
  const su = palettes.summer;
  const au = palettes.autumn;
  const wi = palettes.winter;

  const mixRgb = (
    a: OilPaintRgb,
    b: OilPaintRgb,
    c: OilPaintRgb,
    d: OilPaintRgb,
    dst: Vector4,
    wChannel: number
  ): void => {
    dst.set(
      a[0] * wSp + b[0] * wSu + c[0] * wAu + d[0] * wWi,
      a[1] * wSp + b[1] * wSu + c[1] * wAu + d[1] * wWi,
      a[2] * wSp + b[2] * wSu + c[2] * wAu + d[2] * wWi,
      wChannel
    );
  };

  const paletteBlend = sp.paletteBlend * wSp + su.paletteBlend * wSu + au.paletteBlend * wAu + wi.paletteBlend * wWi;
  const chromaThreshold =
    sp.chromaThreshold * wSp + su.chromaThreshold * wSu + au.chromaThreshold * wAu + wi.chromaThreshold * wWi;

  mixRgb(sp.dabs[0], su.dabs[0], au.dabs[0], wi.dabs[0], out.dab0, paletteBlend);
  mixRgb(sp.dabs[1], su.dabs[1], au.dabs[1], wi.dabs[1], out.dab1, chromaThreshold);
  mixRgb(sp.dabs[2], su.dabs[2], au.dabs[2], wi.dabs[2], out.dab2, 0);
  mixRgb(sp.dabs[3], su.dabs[3], au.dabs[3], wi.dabs[3], out.dab3, 0);
  mixRgb(sp.coolTint, su.coolTint, au.coolTint, wi.coolTint, out.coolTint, 1);
  mixRgb(sp.warmTint, su.warmTint, au.warmTint, wi.warmTint, out.warmTint, 1);
  mixRgb(sp.shadeTint, su.shadeTint, au.shadeTint, wi.shadeTint, out.shadeTint, 1);
}
