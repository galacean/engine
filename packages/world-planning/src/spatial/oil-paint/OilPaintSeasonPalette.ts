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

export type OilPaintColorSchemeId =
  | "season"
  | "warm-ochre"
  | "monet-meadow"
  | "twilight-blue"
  | "subdued-natural"
  | "custom";

export interface OilPaintColorSchemeInfo {
  readonly id: OilPaintColorSchemeId;
  readonly label: string;
  readonly palette?: OilPaintSeasonPalette;
}

const SPRING_SUMMER_PALETTE: OilPaintSeasonPalette = Object.freeze({
  // Monet Giverny sunlit Impressionist palette: harmonious chartreuse, meadow emerald, warm sunlight, deep olive.
  dabs: Object.freeze([
    Object.freeze([0.46, 0.66, 0.12] as const),
    Object.freeze([0.22, 0.5, 0.1] as const),
    Object.freeze([0.74, 0.68, 0.2] as const),
    Object.freeze([0.14, 0.36, 0.1] as const)
  ] as const),
  coolTint: Object.freeze([0.84, 0.96, 1.12] as const),
  warmTint: Object.freeze([1.14, 1.1, 0.86] as const),
  shadeTint: Object.freeze([0.72, 0.86, 0.96] as const),
  paletteBlend: 0.52,
  chromaThreshold: 0.14
});

const AUTUMN_PALETTE: OilPaintSeasonPalette = Object.freeze({
  // Harmonious Autumn Wood oil palette: cohesive golden ochre, honey amber, roasted sienna, warm olive-gold.
  dabs: Object.freeze([
    Object.freeze([0.9, 0.66, 0.16] as const),
    Object.freeze([0.84, 0.46, 0.11] as const),
    Object.freeze([0.72, 0.28, 0.09] as const),
    Object.freeze([0.54, 0.48, 0.15] as const)
  ] as const),
  coolTint: Object.freeze([0.88, 0.9, 1.08] as const),
  warmTint: Object.freeze([1.14, 1.05, 0.84] as const),
  shadeTint: Object.freeze([0.84, 0.74, 0.74] as const),
  paletteBlend: 0.52,
  chromaThreshold: 0.14
});

const WINTER_PALETTE: OilPaintSeasonPalette = Object.freeze({
  // Monet "The Magpie" winter snowscape: warm ivory-cream sunlit snow, frost gold, ice-blue snow, frosted pine.
  dabs: Object.freeze([
    Object.freeze([0.92, 0.86, 0.76] as const),
    Object.freeze([0.86, 0.74, 0.58] as const),
    Object.freeze([0.68, 0.8, 0.94] as const),
    Object.freeze([0.2, 0.3, 0.28] as const)
  ] as const),
  coolTint: Object.freeze([0.78, 0.88, 1.18] as const),
  warmTint: Object.freeze([1.14, 1.07, 0.92] as const),
  shadeTint: Object.freeze([0.66, 0.78, 1.06] as const),
  paletteBlend: 0.62,
  chromaThreshold: -0.15
});

const WARM_OCHRE_SCHEME: OilPaintSeasonPalette = Object.freeze({
  // Unified low-fragmentation golden ochre / honey / raw umber family (zero harsh hue jumps).
  dabs: Object.freeze([
    Object.freeze([0.88, 0.68, 0.22] as const),
    Object.freeze([0.78, 0.54, 0.16] as const),
    Object.freeze([0.66, 0.4, 0.13] as const),
    Object.freeze([0.52, 0.36, 0.15] as const)
  ] as const),
  coolTint: Object.freeze([0.9, 0.92, 1.04] as const),
  warmTint: Object.freeze([1.1, 1.04, 0.88] as const),
  shadeTint: Object.freeze([0.82, 0.74, 0.72] as const),
  paletteBlend: 0.45,
  chromaThreshold: 0.14
});

const MONET_MEADOW_SCHEME: OilPaintSeasonPalette = Object.freeze({
  // Soft Impressionist sage, sunlit straw, olive-gold, muted viridian.
  dabs: Object.freeze([
    Object.freeze([0.62, 0.68, 0.26] as const),
    Object.freeze([0.42, 0.58, 0.24] as const),
    Object.freeze([0.82, 0.76, 0.36] as const),
    Object.freeze([0.28, 0.44, 0.24] as const)
  ] as const),
  coolTint: Object.freeze([0.84, 0.95, 1.1] as const),
  warmTint: Object.freeze([1.12, 1.08, 0.88] as const),
  shadeTint: Object.freeze([0.74, 0.84, 0.96] as const),
  paletteBlend: 0.46,
  chromaThreshold: 0.14
});

const TWILIGHT_BLUE_SCHEME: OilPaintSeasonPalette = Object.freeze({
  // Van Gogh indigo / slate-cobalt paired with warm ochre & amber highlights.
  dabs: Object.freeze([
    Object.freeze([0.22, 0.34, 0.58] as const),
    Object.freeze([0.34, 0.46, 0.64] as const),
    Object.freeze([0.82, 0.64, 0.24] as const),
    Object.freeze([0.16, 0.24, 0.42] as const)
  ] as const),
  coolTint: Object.freeze([0.78, 0.88, 1.18] as const),
  warmTint: Object.freeze([1.14, 1.04, 0.84] as const),
  shadeTint: Object.freeze([0.64, 0.72, 0.96] as const),
  paletteBlend: 0.52,
  chromaThreshold: 0.12
});

const SUBDUED_NATURAL_SCHEME: OilPaintSeasonPalette = Object.freeze({
  // Very subtle cohesive tinting: lets native terrain/foliage colors lead with zero speckled confetti.
  dabs: Object.freeze([
    Object.freeze([0.76, 0.62, 0.34] as const),
    Object.freeze([0.68, 0.54, 0.3] as const),
    Object.freeze([0.6, 0.48, 0.28] as const),
    Object.freeze([0.52, 0.44, 0.26] as const)
  ] as const),
  coolTint: Object.freeze([0.94, 0.96, 1.04] as const),
  warmTint: Object.freeze([1.06, 1.03, 0.94] as const),
  shadeTint: Object.freeze([0.88, 0.84, 0.84] as const),
  paletteBlend: 0.22,
  chromaThreshold: 0.16
});

/** Curated oil-paint brush color schemes exposed directly in the Oil Paint debug panel. */
export const OIL_PAINT_COLOR_SCHEMES: readonly OilPaintColorSchemeInfo[] = Object.freeze([
  { id: "season", label: "Season Default / 随季节默认" },
  { id: "warm-ochre", label: "Warm Ochre / 暖金赭石・统一", palette: WARM_OCHRE_SCHEME },
  { id: "monet-meadow", label: "Monet Soft / 莫奈柔彩", palette: MONET_MEADOW_SCHEME },
  { id: "twilight-blue", label: "Van Gogh Indigo / 梵高靛金", palette: TWILIGHT_BLUE_SCHEME },
  { id: "subdued-natural", label: "Natural Unified / 自然克制・不碎", palette: SUBDUED_NATURAL_SCHEME },
  { id: "custom", label: "Custom / 自定义色板" }
]);

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
    dab0: new Vector4(0.9, 0.66, 0.16, 0.52),
    dab1: new Vector4(0.84, 0.46, 0.11, 0.14),
    dab2: new Vector4(0.72, 0.28, 0.09, 0),
    dab3: new Vector4(0.54, 0.48, 0.15, 0),
    coolTint: new Vector4(0.88, 0.9, 1.08, 1),
    warmTint: new Vector4(1.14, 1.05, 0.84, 1),
    shadeTint: new Vector4(0.84, 0.74, 0.74, 1)
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
