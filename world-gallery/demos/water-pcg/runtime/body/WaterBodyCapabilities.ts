/** Honest P0 capability declarations for each currently implemented water body. */
export type WaterBodyType = "river" | "heightfield" | "pool" | "ocean";

export interface WaterBodyCapabilities {
  readonly finalSurfaceQuery: boolean;
  readonly batchQuery: boolean;
  readonly surfaceVelocity: boolean;
  readonly localCurrent: boolean;
  readonly deformation: boolean;
  readonly temporalFoam: boolean;
  readonly underwaterVolume: boolean;
  readonly queryLatencyFrames: 0 | 1 | 2;
}

export interface WaterSurfaceLayerDescription {
  readonly baseSurface: string;
  readonly visibleMacroSurface: string;
  readonly microNormal: string;
}

export interface WaterBodyCapabilityEntry {
  readonly type: WaterBodyType;
  readonly capabilities: WaterBodyCapabilities;
  readonly surfaceLayers: WaterSurfaceLayerDescription;
  readonly diagnostic?: string;
}

export const WATER_BODY_CAPABILITY_MATRIX: readonly WaterBodyCapabilityEntry[] = Object.freeze([
  Object.freeze({
    type: "river",
    capabilities: Object.freeze({
      finalSurfaceQuery: true,
      batchQuery: true,
      surfaceVelocity: true,
      localCurrent: true,
      deformation: true,
      temporalFoam: false,
      underwaterVolume: true,
      queryLatencyFrames: 0
    }),
    surfaceLayers: Object.freeze({
      baseSurface: "compiled reach and junction geometry",
      visibleMacroSurface: "CPU/GPU shared river surface motion",
      microNormal: "flow surface texture; intentionally excluded from gameplay queries"
    })
  }),
  Object.freeze({
    type: "heightfield",
    capabilities: Object.freeze({
      finalSurfaceQuery: true,
      batchQuery: true,
      surfaceVelocity: true,
      localCurrent: true,
      deformation: true,
      temporalFoam: false,
      underwaterVolume: false,
      queryLatencyFrames: 0
    }),
    surfaceLayers: Object.freeze({
      baseSurface: "compiled wet heightfield footprint",
      visibleMacroSurface: "flow-aligned CPU/GPU shared Gerstner displacement",
      microNormal: "flow surface texture; intentionally excluded from gameplay queries"
    }),
    diagnostic: "Finite underwater volume ownership is deferred; surface and depth queries are available."
  }),
  Object.freeze({
    type: "pool",
    capabilities: Object.freeze({
      finalSurfaceQuery: true,
      batchQuery: false,
      surfaceVelocity: true,
      localCurrent: true,
      deformation: true,
      temporalFoam: false,
      underwaterVolume: false,
      queryLatencyFrames: 0
    }),
    surfaceLayers: Object.freeze({
      baseSurface: "River-backed finite pool footprint",
      visibleMacroSurface: "shared rectangular CPU heightfield",
      microNormal: "pool ripple material detail; intentionally excluded from gameplay queries"
    }),
    diagnostic: "The current interactive pool keeps the explicit scalar provider fast path."
  }),
  Object.freeze({
    type: "ocean",
    capabilities: Object.freeze({
      finalSurfaceQuery: true,
      batchQuery: true,
      surfaceVelocity: true,
      localCurrent: false,
      deformation: true,
      temporalFoam: false,
      underwaterVolume: false,
      queryLatencyFrames: 0
    }),
    surfaceLayers: Object.freeze({
      baseSurface: "finite preview grid at authored water level",
      visibleMacroSurface: "CPU/GPU shared directional Gerstner waves",
      microNormal: "none in the P0 Ocean preview"
    }),
    diagnostic: "Queries are limited to the finite preview grid; infinite ocean and volume ownership are not implied."
  })
]);

export function getWaterBodyCapabilities(type: WaterBodyType): WaterBodyCapabilities {
  const entry = WATER_BODY_CAPABILITY_MATRIX.find((candidate) => candidate.type === type);
  if (!entry) throw new Error(`Unsupported water body type: ${type}.`);
  return entry.capabilities;
}
