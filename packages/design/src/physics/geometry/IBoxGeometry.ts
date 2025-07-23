import { Vector3 } from "@galacean/engine-math";
import { IGeometry } from "./IGeometry";

/**
 * Interface for box geometry.
 */
export interface IBoxGeometry extends IGeometry {
  /**
   * Half extents of the box.
   */
  halfExtents: Pick<Vector3, "x" | "y" | "z">;
}
