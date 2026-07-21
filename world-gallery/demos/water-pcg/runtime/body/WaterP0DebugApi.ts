/** Browser-facing P0 observability without coupling hot query paths to the DOM. */
import { Vector3 } from "@galacean/engine-math";
import { createWaterSurfaceSample } from "../query/WaterSurfaceProvider";
import { WATER_BODY_CAPABILITY_MATRIX, type WaterBodyCapabilityEntry } from "./WaterBodyCapabilities";
import type { WaterWorld, WaterWorldBodySnapshot, WaterWorldMetrics } from "./WaterWorld";

export interface WaterP0QuerySnapshot {
  readonly hit: boolean;
  readonly waterBodyId: string;
  readonly surfacePosition: readonly [number, number, number];
  readonly surfaceNormal: readonly [number, number, number];
  readonly waterVelocity: readonly [number, number, number];
  readonly waterDepth: number;
}

export interface WaterP0DebugApi {
  readonly capabilityMatrix: readonly WaterBodyCapabilityEntry[];
  readonly worldMetrics: WaterWorldMetrics;
  readonly bodyMetrics: readonly WaterWorldBodySnapshot[];
  querySurface(worldX: number, worldY: number, worldZ: number): WaterP0QuerySnapshot;
}

declare global {
  interface Window {
    waterPcgP0?: WaterP0DebugApi;
  }
}

export class WaterP0DebugController implements WaterP0DebugApi {
  readonly capabilityMatrix = WATER_BODY_CAPABILITY_MATRIX;
  private readonly _position = new Vector3();
  private readonly _sample = createWaterSurfaceSample();

  constructor(private readonly _world: WaterWorld) {}

  get worldMetrics(): WaterWorldMetrics {
    return this._world.metrics;
  }

  get bodyMetrics(): readonly WaterWorldBodySnapshot[] {
    return this._world.bodyMetrics;
  }

  querySurface(worldX: number, worldY: number, worldZ: number): WaterP0QuerySnapshot {
    this._position.set(worldX, worldY, worldZ);
    const hit = this._world.sampleSurface(this._position, this._sample);
    const sample = this._sample;
    return Object.freeze({
      hit,
      waterBodyId: sample.waterBodyId,
      surfacePosition: Object.freeze([
        sample.surfacePosition.x,
        sample.surfacePosition.y,
        sample.surfacePosition.z
      ] as const),
      surfaceNormal: Object.freeze([sample.surfaceNormal.x, sample.surfaceNormal.y, sample.surfaceNormal.z] as const),
      waterVelocity: Object.freeze([sample.waterVelocity.x, sample.waterVelocity.y, sample.waterVelocity.z] as const),
      waterDepth: sample.waterDepth
    });
  }
}
