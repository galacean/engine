import { ColorSpace } from "./enums/ColorSpace";
import { ShadowCascadesMode, ShadowMode, ShadowResolution } from "./shadow";
import { Vector3 } from "@oasis-engine/math";

/**
 * Render settings.
 */
export interface EngineSettings {
  /** Color space.*/
  colorSpace?: ColorSpace;
}
