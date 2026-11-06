import type { BuildingDesignPart } from "./BuildingDesignIdentity";
import type { BuildingSupport, BuildingPlacementBatch } from "../BuildingAlgorithms";
import type { BuildingPose } from "../BuildingLayout";
import type { BuildingGroup } from "./BuildingDraft";

/** Computed placements consumed by the instance renderer, never an execution path. */
export interface BuildingInstancePlacement {
  part: BuildingDesignPart;
  group: BuildingGroup;
  support: BuildingSupport;
  placements: readonly BuildingPose[] | BuildingPlacementBatch;
}
