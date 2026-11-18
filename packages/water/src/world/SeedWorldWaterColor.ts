import type { WaterLookAuthoringDraft, WaterLookAuthoringComponents } from "../water/index";
import { WaterSurfaceAppearanceSchemaVersion } from "../water/index";

/** Artist-facing sRGB bytes; Water Look colors are stored in linear space. */
export type SeedWorldWaterColorRgb = readonly [number, number, number];

export function validateSeedWorldWaterColor(color: SeedWorldWaterColorRgb): void {
  if (color.length !== 3 || color.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new RangeError("Water colorRgb must contain three sRGB integers in [0, 255].");
  }
}

export function withSeedWorldWaterColor(
  current: Readonly<WaterLookAuthoringComponents>,
  color: SeedWorldWaterColorRgb
): WaterLookAuthoringDraft {
  validateSeedWorldWaterColor(color);
  const rgb = color.map((byte) => {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  const appearance = current.appearance.appearance;
  if (appearance.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2) {
    throw new Error("Water color requires Surface Appearance V2.");
  }
  const rgba = (alpha: number): readonly [number, number, number, number] => [...rgb, alpha];
  const depth = appearance.depthResponse;
  const depthResponse =
    "scatteringTint" in depth && depth.scatteringTint
      ? {
          ...depth,
          scatteringTint: {
            ...depth.scatteringTint,
            shallowColor: rgba(depth.scatteringTint.shallowColor[3]),
            deepColor: rgba(depth.scatteringTint.deepColor[3])
          }
        }
      : "color" in depth
        ? { ...depth, color: rgba(depth.color[3]) }
        : "colors" in depth
          ? { ...depth, colors: depth.colors.map((stop) => ({ ...stop, color: rgba(stop.color[3]) })) }
          : "shallowColor" in depth
            ? { ...depth, shallowColor: rgba(depth.shallowColor[3]), deepColor: rgba(depth.deepColor[3]) }
            : depth;
  return {
    ...current,
    appearance: { ...current.appearance, appearance: { ...appearance, depthResponse } },
    optics:
      "scatteringTint" in depth && depth.scatteringTint
        ? current.optics
        : { ...current.optics, profile: { ...current.optics.profile, scatteringColor: rgb } }
  };
}

export function readSeedWorldWaterColor(current: Readonly<WaterLookAuthoringComponents>): SeedWorldWaterColorRgb {
  const appearance = current.appearance.appearance;
  const depth =
    appearance.schemaVersion === WaterSurfaceAppearanceSchemaVersion.V2 ? appearance.depthResponse : undefined;
  const rgb =
    depth && "scatteringTint" in depth && depth.scatteringTint
      ? depth.scatteringTint.deepColor
      : depth && "color" in depth
        ? depth.color
        : depth && "colors" in depth
          ? depth.colors[depth.colors.length - 1]!.color
          : depth && "deepColor" in depth
            ? depth.deepColor
            : current.optics.profile.scatteringColor;
  return Object.freeze(
    rgb
      .slice(0, 3)
      .map((value) =>
        Math.round(
          255 * Math.min(1, Math.max(0, value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055))
        )
      ) as [number, number, number]
  );
}
