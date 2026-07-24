import { Engine, Entity } from "@galacean/engine";
import { OceanPreviewController } from "../../../water-pcg/demo/examples/ocean-preview/OceanPreviewController";
import { curvedMainRiverOceanPreview } from "../../../water-pcg/demo/examples/ocean-preview/presets";

/** Bounds occupied by loaded terrain regions in world metres. */
export interface TerrainWaterDebugBounds {
  /** Centre of the loaded terrain extent. */
  readonly center: readonly [x: number, z: number];
  /** Largest loaded terrain extent. */
  readonly size: number;
}

/**
 * Restores the independent water-pcg diagnostic from the pre-rebuild terrain demo.
 * It does not alter terrain control words, holes, or material sampling.
 */
export class TerrainWaterDebug {
  private readonly _root: Entity;
  private _controller?: OceanPreviewController;
  private readonly _createController: () => OceanPreviewController;

  /**
   * Creates a water-pcg diagnostic plane centred on the exported terrain regions.
   * @param engine Engine that owns the diagnostic renderer.
   * @param parent Terrain scene root.
   * @param bounds Loaded terrain region extent.
   */
  constructor(engine: Engine, parent: Entity, bounds: TerrainWaterDebugBounds) {
    this._root = parent.createChild("terrain-water-debug");
    this._root.transform.setPosition(bounds.center[0], 9.5, bounds.center[1]);
    this._createController = () =>
      new OceanPreviewController(engine, this._root, {
        ...curvedMainRiverOceanPreview,
        size: bounds.size + 16000,
        waterLevel: 0,
        amplitudeScale: 8,
        timeScale: 1.4
      });
    this._root.isActive = false;
  }

  /**
   * Updates diagnostic visibility and world-space water height.
   * @param enabled Whether the diagnostic renderer is active.
   * @param height Water surface height in metres.
   */
  setState(enabled: boolean, height: number): void {
    if (enabled && !this._controller) this._controller = this._createController();
    this._root.isActive = enabled;
    this._root.transform.setPosition(this._root.transform.position.x, height - 0.5, this._root.transform.position.z);
  }

}
