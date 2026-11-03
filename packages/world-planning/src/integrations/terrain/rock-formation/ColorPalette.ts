import type { SpatialField } from "../../../spatial/SpatialDocument.ts";

/** Linear RGB multiplier. Hex controls cross the sRGB boundary exactly once. */
export type RockPaletteColor = [number, number, number];
export interface RockColorBlend {
  color: RockPaletteColor;
}

export function rockPaletteHexToLinear(hex: string): RockPaletteColor {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw Error("Expected a six-digit rock color / 岩石颜色须为六位十六进制");
  return [1, 3, 5].map((offset) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as RockPaletteColor;
}
export function rockPaletteLinearToHex(color: readonly number[]): string {
  return (
    "#" +
    color
      .map((c) => {
        const value = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(Math.max(0, Math.min(1, value)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

export const ROCK_COLOR_FIELDS: SpatialField[] = (["r", "g", "b"] as const).map((channel) => ({
  key: `color.${channel}`,
  label: `Rock Color / 岩石颜色 · ${channel.toUpperCase()}`,
  type: "number",
  min: 0,
  max: 1,
  step: 0.01,
  unit: "linear RGB",
  default: 1,
  affectsLayout: false
}));
export const ROCK_COLOR_FIELD_KEYS = new Set(ROCK_COLOR_FIELDS.map((field) => field.key));

/** White preserves the baked grayscale texture; black remains an explicit color. */
export function readRockColorBlend(values: Record<string, unknown> = {}): RockColorBlend {
  return { color: ["r", "g", "b"].map((channel) => Number(values[`color.${channel}`] ?? 1)) as RockPaletteColor };
}

/** The retired pigment model must not recolor a grayscale project on import. */
export function retireRockPaletteFields(values: Record<string, unknown>): void {
  for (const key of Object.keys(values)) {
    if (
      /^palette\.(spring|summer|autumn|winter)\.color[AB]\.[rgb]$/.test(key) ||
      ["colorBalance", "colorStrength", "colorSaturation"].includes(key)
    )
      delete values[key];
  }
}
