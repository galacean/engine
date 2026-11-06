/** Canonical field dependency extraction for every Surface Appearance V2 depth model. */
import type { WaterSurfaceDepthResponseV2 } from "./WaterSurfaceAppearanceTypes";
import { WaterSurfaceDepthResponseModelV2 } from "./WaterSurfaceAppearanceTypes";
import type { WaterFieldSemantic } from "./WaterSurfaceFieldTypes";

export function getWaterSurfaceDepthResponseSemantics(
  response: Readonly<WaterSurfaceDepthResponseV2>
): readonly WaterFieldSemantic[] {
  if (response.model === WaterSurfaceDepthResponseModelV2.CompositeExponential) {
    return Object.freeze([...new Set(response.terms.flatMap((term) => (term ? [term.field] : [])))]);
  }
  return Object.freeze([response.field]);
}
