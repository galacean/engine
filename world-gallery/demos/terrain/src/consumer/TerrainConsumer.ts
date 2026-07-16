// Consumer contract for downstream systems (water-pcg, foliage, cliff, building, lighting…) that need
// to react to terrain data. See design.md §3.5 for the full protocol; this file is the runtime.
//
// Data flow:
//   TerrainSystem holds the authoritative context (heightmaps, controlmaps, layers).
//   Consumers register with an id + `interests` filter. Only events matching one of their interests are
//   dispatched to them. Consumers may pull additional info via the `TerrainContext` handed in on register.
//   Push (event) + Pull (context API) — see design.md §3.5 "关键原则".

import { LayerKind, LayerSpec } from "../loader/ManifestLoader";

export enum ConsumerInterest {
  HeightMap = "HeightMap",
  ControlMap = "ControlMap",
  ColorMap = "ColorMap",
  LayerConfig = "LayerConfig",
  RegionChange = "RegionChange",
  All = "All"
}

export interface RegionRef {
  id: string;
  positionXZ: [number, number];
  sizeMeter: number;
}

export interface TerrainChangeEvent {
  type: ConsumerInterest;
  dirtyRegions: RegionRef[];
  /** Optional world-space AABB when the change is smaller than a whole region (brush strokes, etc). */
  dirtyBoundsWorld?: { min: [number, number, number]; max: [number, number, number] };
  layerIdFilter?: number[];
}

/**
 * Read + query surface handed to consumers. Kept minimal — extended per real consumer need.
 */
export interface TerrainRegionCoverage {
  /** Region id these texels belong to. */
  regionId: string;
  /** Texel indices where the requested layer/kind is present. */
  texels: Uint32Array;
  /** World-space AABB min corner over matched texels (Y = actual sampled height min). */
  min: [number, number, number];
  /** World-space AABB max corner over matched texels (Y = actual sampled height max). */
  max: [number, number, number];
  /** Convenience: `max - min` on X/Z, so `size[0]` is the width and `size[1]` is the depth in metres. */
  size: [number, number];
  /**
   * Suggested world Y for a system that wants to place a horizontal surface across the coverage.
   * For LayerKind.Water this is the waterline — the highest sampled elevation among the water
   * texels, which corresponds to where water meets land. Downstream systems (WaterPcgConsumer's
   * ocean plane) place their mesh at this Y without any manual configuration.
   */
  surfaceY: number;
}

export interface TerrainContext {
  /** World-space raw height in metres, bilinearly filtered across the region grid. */
  sampleHeight(x: number, z: number): number;
  /** Approximate slope (tan-of-angle) at the world XZ position. */
  sampleSlope(x: number, z: number): number;
  /** Full 32-bit ControlMap bitfield at the world XZ position (uint32 packed as-is). */
  sampleControl(x: number, z: number): number;
  /** Convenience: find every texel index whose base layer id equals the queried id (for mesh scatter). */
  findTexelsByLayer(regionId: string, layerId: number): Uint32Array;
  /**
   * Semantic accessor for Consumers that don't want to touch raw bit positions. TerrainSystem maps
   * LayerKind → the controlmap bit that stores that kind's presence (e.g. LayerKind.Water → bit 3).
   * Returns per-region coverage — bounding box + texels — that a Consumer can hand to its own mesh
   * factory (e.g. size an OceanPreview plane to `coverage[0].size`).
   */
  findRegionsByLayerKind(kind: LayerKind): TerrainRegionCoverage[];
  getLayers(): LayerSpec[];
  getRegions(): RegionRef[];
}

export interface TerrainConsumer {
  readonly id: string;
  readonly interests: ConsumerInterest[];
  onRegister(ctx: TerrainContext): void;
  onDataChanged(evt: TerrainChangeEvent): void;
  onUnregister(): void;
}
