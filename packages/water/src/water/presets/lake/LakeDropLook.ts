import { FARMLANDS_DROP_LOOK } from "../../authoring/river/FarmlandsDropLook";
import { resolveRiverDropLook } from "../../authoring/river/RiverDropLook";
import { LAKE_WATER_OPTICAL_PROFILE } from "./LakeWaterDefaults";

const foamColor = [0.87, 0.95, 0.98] as const;
const tint = (whiteMix: number): readonly [number, number, number] => {
  const water = LAKE_WATER_OPTICAL_PROFILE.scatteringColor;
  return [0, 1, 2].map((axis) => water[axis] * (1 - whiteMix) + foamColor[axis] * whiteMix) as [number, number, number];
};

/** Lake-colored River drops; reuse the existing textures without inheriting the saturated Farmlands curtain. */
export const LAKE_DROP_LOOK = resolveRiverDropLook({
  ...FARMLANDS_DROP_LOOK,
  // The former RiverDrop shader mixed optics.scatteringColor with this blue-white
  // at 0.25..0.60 before landing foam, and used alpha 0.68..0.86 (midpoint 0.77).
  colors: [tint(0.25), tint(0.425), tint(0.6), foamColor],
  opacity: 0.77,
  normalStrength: 0,
  colorContrast: 1,
  parallaxDepth: 0,
  foamOpacity: 0.35,
  sprayOpacity: 0,
  mistOpacity: 0,
  curtain: {
    ...FARMLANDS_DROP_LOOK.curtain,
    lineDistortion: 0.1,
    lineOpacity: 0.35,
    lineReveal: 0,
    bottomFoamStart: 0.65,
    bottomFoamThreshold: 0.3,
    edgeCutout: 0,
    edgeFoamOpacity: 0.1,
    entryFade: 100,
    dotsOpacity: 0
  }
});
