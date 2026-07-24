import type { Engine, Entity } from "@galacean/engine-core";
import { OceanWaterRuntimeController } from "../../../runtime/ocean/OceanWaterRuntimeController";
import type { OceanPreviewConfig } from "./types";

/**
 * Demo compatibility adapter.
 *
 * All water, nearshore, geometry, material, and camera-feature resources are
 * owned by OceanWaterRuntimeController; the preview layer only preserves the
 * historical constructor/import surface used by the gallery.
 */
export class OceanPreviewController extends OceanWaterRuntimeController {
  constructor(engine: Engine, parent: Entity, config: OceanPreviewConfig) {
    super(engine, parent, config);
  }
}
