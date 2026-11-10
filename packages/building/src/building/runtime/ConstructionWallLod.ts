import type { ProfileWallGeometry } from "./ProfileWallGeometry";
import type { ConstructionDrawInput } from "./ConstructionPackage";
import type { SupportCell } from "./PlacementSupport";
import type { MaterialUnit } from "./UnitPlacementStyle";

/** A distance facade cannot flatten units that protrude through the finish
 * envelope. Keep their original material renderer (including its unit LOD),
 * rather than baking a second plaster mask or approximating the brick bevel. */
export interface RetainedWallUnits {
  /** Optional attachment ownership for retained structural trim. */
  pickId?: string;
  ownerId: string;
  slot: number;
  material: MaterialUnit;
  cells: SupportCell[];
  brickRecords?: Uint8Array[];
  sourceDraw?: Pick<ConstructionDrawInput, "template" | "instances" | "bindings">;
  wallRoofJoint?: ProfileWallGeometry["wallRoofJoint"];
}
