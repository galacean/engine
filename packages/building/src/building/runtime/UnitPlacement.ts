import type { MaterialUnit, ArrangementRule } from "./UnitPlacementStyle";

/** A material laid on a building surface, and a local edit of it, as the renderer takes them. */
export interface UnitPlacementBinding {
  id: string;
  geometry_id: string;
  variationKey?: string;
  rule: { type: ArrangementRule };
  unit_id: MaterialUnit;
  /** Size of one unit in metres. */
  footprint: { width: number; height: number; depth: number };
  seed: "source" | number;
}

export interface UnitPlacementOverride {
  id: string;
  binding_id: string;
  region: { space: "surface_uv"; polygon: number[][] };
  effect: { unit_id?: MaterialUnit; hidden?: boolean };
}
