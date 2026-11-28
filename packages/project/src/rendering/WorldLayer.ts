import { Layer } from "@galacean/engine-core";

/** Fixed layer assignments shared by World systems. Ordinary entities use the engine default, Layer0. */
export const WorldLayer = {
  PhotoWorkspace: Layer.Layer25,
  Building: Layer.Layer26,
  PlayerCollision: Layer.Layer27,
  DirectorTarget: Layer.Layer28,
  PlanningTerrainDepth: Layer.Layer29,
  Water: Layer.Layer30
} as const;
