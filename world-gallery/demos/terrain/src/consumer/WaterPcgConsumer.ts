import { Engine, Entity } from "@galacean/engine";
import { OceanPreviewController } from "../../../water-pcg/demo/examples/ocean-preview/OceanPreviewController";
import { riverExpandedLakeOceanPreview } from "../../../water-pcg/demo/examples/ocean-preview/presets";
import { LayerKind } from "../loader/ManifestLoader";
import {
  ConsumerInterest,
  TerrainChangeEvent,
  TerrainConsumer,
  TerrainContext
} from "./TerrainConsumer";

/**
 * Bridges Terrain (data producer) → water-pcg (renderer). The Consumer subscribes to controlmap
 * changes, asks TerrainSystem for the coverage of `LayerKind.Water` (semantic — no bit knowledge),
 * and sizes a water-pcg OceanPreview plane to match that coverage. The terrain shader already
 * discards texels where hole bit = 1 (baker sets water=1 + hole=1 together), so the ocean plane
 * shows through the tile's underwater regions without any manual masking.
 *
 * Not going through the River pipeline yet: the current terrain fixture describes a plain flat sea
 * around the island, and OceanPreview's Gerstner wave ocean is exactly what fits that. When the
 * fixture describes a river valley (a narrow water strip), the same Consumer will switch to the
 * River pipeline.
 */
export class WaterPcgConsumer implements TerrainConsumer {
  readonly id = "water-pcg";
  // Subscribed events:
  //   ControlMap  → water pixel set / bounds may have changed.
  //   HeightMap   → same pixels, but their elevations moved (min/max slider) — surfaceY re-derives.
  //   RegionChange → region added / removed.
  //   All         → initial snapshot broadcast after registration.
  readonly interests = [
    ConsumerInterest.ControlMap,
    ConsumerInterest.HeightMap,
    ConsumerInterest.RegionChange,
    ConsumerInterest.All
  ];

  private _root: Entity | null = null;
  private _controller: OceanPreviewController | null = null;
  private _ctx: TerrainContext | null = null;
  private _log: (msg: string) => void;

  constructor(
    private readonly _engine: Engine,
    private readonly _sceneRoot: Entity,
    log?: (msg: string) => void
  ) {
    this._log = log ?? (() => {});
  }

  onRegister(ctx: TerrainContext): void {
    this._ctx = ctx;
    this._root = this._sceneRoot.createChild("water-pcg-ocean");
    // Placement (XZ + Y) fully derived from TerrainContext coverage in _refreshCoverage — no
    // hand-supplied sea level. This is the reason the Consumer hook exists in the first place.
    this._log(`[water-pcg] register · surface Y will be inferred from terrain coverage`);
  }

  onDataChanged(evt: TerrainChangeEvent): void {
    const affectsCoverage =
      evt.type === ConsumerInterest.ControlMap ||
      evt.type === ConsumerInterest.HeightMap ||
      evt.type === ConsumerInterest.RegionChange ||
      evt.type === ConsumerInterest.All;
    if (!affectsCoverage) return;
    this._refreshCoverage();
  }

  onUnregister(): void {
    if (this._controller) {
      // OceanPreviewController owns its root entity — destroying that entity is enough.
      this._controller = null;
    }
    if (this._root) {
      this._root.destroy();
      this._root = null;
    }
    this._ctx = null;
  }

  private _refreshCoverage(): void {
    if (!this._ctx || !this._root) return;
    const coverage = this._ctx.findRegionsByLayerKind(LayerKind.Water);
    if (coverage.length === 0) {
      this._log("[water-pcg] no water region · ocean plane hidden");
      this._root.isActive = false;
      return;
    }
    this._root.isActive = true;
    // Pick the first region for MVP; multi-region tiles will spawn one controller per coverage
    // entry in a later stage. XZ = coverage centre; Y = TerrainSystem-suggested surface height
    // (waterline). Nothing here reaches into terrain internals.
    const first = coverage[0];
    const centerX = (first.min[0] + first.max[0]) * 0.5;
    const centerZ = (first.min[2] + first.max[2]) * 0.5;
    this._root.transform.setPosition(centerX, first.surfaceY, centerZ);
    // OceanPreview mesh is a square plane sized `size` in local metres — pick the longer edge of
    // the coverage bbox to guarantee full cover, then bump ~5% for safety around the coastline.
    const worldSize = Math.max(first.size[0], first.size[1]) * 1.05;
    // amplitudeScale bumped from the preset default (1.0) → wave motion is legible from the demo
    // camera at ~2500m distance.
    const oceanCfg = { ...riverExpandedLakeOceanPreview, size: worldSize, waterLevel: 0, amplitudeScale: 3.0 };
    if (!this._controller) {
      this._controller = new OceanPreviewController(this._engine, this._root, oceanCfg);
    } else {
      this._controller.setConfig(oceanCfg);
    }
    this._log(
      `[water-pcg] ocean · y=${first.surfaceY.toFixed(1)}m · size=${worldSize.toFixed(0)}m · ${first.texels.length} texels`
    );
  }
}
