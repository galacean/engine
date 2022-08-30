import { ColorSpace } from "./enums/ColorSpace";
import { ShadowCascadesMode, ShadowMode, ShadowResolution } from "./shadow";

/**
 * Render settings.
 */
export interface EngineSettings {
  /** Color space.*/
  colorSpace?: ColorSpace;

  /** How this light casts shadows */
  shadowMode?: ShadowMode;
  /** The default resolution of the shadow maps. */
  shadowResolution?: ShadowResolution;
  /** Number of cascades to use for directional light shadows. */
  shadowCascades?: ShadowCascadesMode;
  /** The ratio of cascade distribution. */
  shadowCascadeSplitRatio?: number;
}
