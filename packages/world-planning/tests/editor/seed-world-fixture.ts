import type { SeedWorldLiveState } from "../../src/agent-adapter/ports/SeedWorldEnginePort";

export function state(): SeedWorldLiveState {
  return {
    world: { rootSeed: 1, sizeMetres: 1024 }, camera: { mode: "roam", position: [0, 2, 0], forward: [0, 0, -1] },
    plan: { summitCount: 0, riverReachCount: 0, roadCount: 0, poiCount: 0 },
    population: { residentCellCount: 0, residentAcceptedCounts: { tree: 0, shrub: 0, flower: 0, grass: 0 }, submittedCounts: { tree: 0, shrub: 0, flower: 0, grass: 0 } },
    decorations: { rocks: 0, smallRocks: 0, mushrooms: 0, lotus: 0 },
    water: { ready: true, visible: true, bodyCount: 0, chunkCount: 0, hostRevision: 0 },
    lighting: { timeHours: 12, phase: "day", playing: false, iblPhase: "ready", iblProgress: 1, iblPublishedRevision: 0, iblBakingEnabled: true },
    environment: { season: "summer", seasonTransitionProgress: 1, precipitation: "none", rainIntensity: 0, snowIntensity: 0, cloudCoverage: 0,
      fogIntensity: 0, windSpeed: 1, windIntensity: 0.1, windDirectionDegrees: 0, windGustiness: 0, windTurbulence: 0, lightningFrequency: 0, lightningIntensity: 0 }
  };
}
