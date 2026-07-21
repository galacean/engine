/** Adapter-first water-body contract kept inside the demo during P0 incubation. */
import type { WaterSurfaceProvider } from "../query/WaterSurfaceProvider";
import type { WaterBodyCapabilities, WaterBodyType } from "./WaterBodyCapabilities";

export interface WaterBoundsXZ {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface WaterBodyMetrics {
  readonly meshUploadCount: number;
  readonly drawCount: number;
  readonly triangleCount: number;
  readonly resourceBytes: number;
}

export interface WaterBodyRuntime {
  readonly id: string;
  readonly type: WaterBodyType;
  readonly capabilities: WaterBodyCapabilities;
  readonly surface: WaterSurfaceProvider;
  readonly bounds: WaterBoundsXZ;
  readonly exclusionBounds: readonly WaterBoundsXZ[];
  readonly priority: number;
  readonly metrics: WaterBodyMetrics;
  enabled: boolean;
}

export interface WaterBodyRuntimeConfig extends Omit<WaterBodyRuntime, "enabled" | "exclusionBounds"> {
  readonly enabled?: boolean;
  readonly exclusionBounds?: readonly WaterBoundsXZ[];
}

export class WaterBodyRuntimeAdapter implements WaterBodyRuntime {
  readonly id: string;
  readonly type: WaterBodyType;
  readonly capabilities: WaterBodyCapabilities;
  readonly surface: WaterSurfaceProvider;
  readonly bounds: WaterBoundsXZ;
  readonly exclusionBounds: readonly WaterBoundsXZ[];
  readonly priority: number;
  readonly metrics: WaterBodyMetrics;
  enabled: boolean;

  constructor(config: WaterBodyRuntimeConfig) {
    this.id = config.id;
    this.type = config.type;
    this.capabilities = config.capabilities;
    this.surface = config.surface;
    this.bounds = config.bounds;
    this.exclusionBounds = config.exclusionBounds ?? Object.freeze([]);
    this.priority = config.priority;
    this.metrics = config.metrics;
    this.enabled = config.enabled ?? true;
  }
}

export function containsWaterBounds(bounds: WaterBoundsXZ, worldX: number, worldZ: number): boolean {
  return worldX >= bounds.minX && worldX <= bounds.maxX && worldZ >= bounds.minZ && worldZ <= bounds.maxZ;
}
