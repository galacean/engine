import { ColorSpace } from "./enums/ColorSpace";
import { ShadowCascadesMode, ShadowMode, ShadowResolution } from "./shadow";
import { Vector3 } from "@oasis-engine/math";

/**
 * Render settings.
 */
export interface EngineSettings {
  /** Color space.*/
  colorSpace?: ColorSpace;

  /** How this light casts shadows */
  shadowMode?: ShadowMode;
  /** The resolution of the shadow maps. */
  shadowResolution?: ShadowResolution;
  /** Number of cascades to use for directional light shadows. */
  shadowCascades?: ShadowCascadesMode;
  /** The splits of two cascade distribution. */
  shadowTwoCascadeSplits?: number;
  /** The splits of four cascade distribution. */
  shadowFourCascadeSplits?: Vector3;
}
