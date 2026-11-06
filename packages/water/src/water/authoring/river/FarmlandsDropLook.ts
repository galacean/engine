import type { WaterBodyAssetRegistry } from "../../runtime/body/WaterBodyAssetRegistry";
import { FARMLANDS_DROP_ASSETS } from "../../resources/river/FarmlandsDropAssets";
import { resolveRiverDropLook, type RiverDropLook } from "./RiverDropLook";

const linear = (rgb: readonly [number, number, number]): readonly [number, number, number] =>
  rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];

/** PF_Waterfall_01 / MI_Waterfall_01 + impact foam, adapted to generated River geometry. */
export const FARMLANDS_DROP_LOOK: Readonly<RiverDropLook> = resolveRiverDropLook({
  textures: Object.fromEntries(
    Object.entries(FARMLANDS_DROP_ASSETS).map(([slot, { descriptor }]) => [
      slot,
      { assetId: descriptor.id, contentHash: descriptor.contentHash }
    ])
  ) as unknown as RiverDropLook["textures"],
  layers: {
    directional: { scale: [1, 2], velocity: [0, -0.94] },
    cloud: { scale: [0.2, 0.5], velocity: [-0.03, 0] },
    lines: { scale: [4, 3], velocity: [0, -1] },
    edge: { scale: [1, 1], velocity: [0, -0.45] },
    voronoi: { scale: [0.7, 2.2], velocity: [0, -0.42] },
    foam: { scale: [1.3, 1.52], velocity: [0, -0.48] }
  },
  colors: [linear([0, 0.38415438, 0.7372549]), linear([0, 0.6912751, 1]), linear([0, 0.8939395, 1]), [1, 1, 1]],
  speed: 1,
  opacity: 1,
  normalStrength: 0.1,
  colorContrast: 0.37,
  parallaxDepth: 0.192,
  foamOpacity: 1,
  sprayOpacity: 0.6,
  mistOpacity: 0.24,
  curtain: {
    lineDistortion: 0.3,
    lineOpacity: 1.23,
    lineReveal: 0.45,
    bottomFoamStart: 0.338,
    bottomFoamThreshold: 0.181,
    edgeCutout: 0.1,
    edgeFoamThreshold: 0.6,
    edgeFoamOpacity: 0.5,
    entryFade: 7.2,
    dotsThreshold: 0.752,
    dotsOpacity: 0.313
  },
  impact: {
    scale: [0.4, 1.42],
    // Source impact V points toward the lip; generated River patches point downstream.
    velocity: -0.35,
    distortion: 0.1061,
    lengthMultiplier: 1.07,
    lengthPower: 1.31,
    widthPower: 0.21,
    threshold: 0.22
  }
});

/** Shared runtime fallback for River drops, including rivers using derived Looks without riverDrops. */
export const RIVER_DEFAULT_DROP_LOOK = FARMLANDS_DROP_LOOK;

/** River and Lake Looks share these immutable identities, including through Host registration facades. */
export function registerRiverDropResources(registry: WaterBodyAssetRegistry): void {
  for (const { descriptor } of Object.values(FARMLANDS_DROP_ASSETS)) {
    const existing = registry.getResource(descriptor.id);
    if (existing?.contentHash !== descriptor.contentHash) registry.registerResource(descriptor);
  }
}
