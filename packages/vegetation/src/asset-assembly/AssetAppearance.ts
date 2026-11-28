import type { AssetSeedColor } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";

/**
 * Converts an editable sRGB appearance color into the linear multiplier consumed by production Materials.
 * @param appearanceColor Desired visible source color stored by the appearance Seed.
 * @param authoredColor Production Material base color represented as sRGB8.
 * @returns Linear RGB multiplier that preserves the authored Material when both colors match.
 */
export function resolveAssetAppearanceTint(
  appearanceColor: AssetSeedColor,
  authoredColor: AssetSeedColor
): readonly [number, number, number] {
  return appearanceColor.map((channel, index) => {
    const desiredLinear = srgb8ToLinear(channel);
    const authoredLinear = srgb8ToLinear(authoredColor[index]);
    return authoredLinear > 0 ? desiredLinear / authoredLinear : desiredLinear;
  }) as [number, number, number];
}

function srgb8ToLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}
