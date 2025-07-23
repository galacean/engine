import { IGeometry } from "./IGeometry";

/**
 * Interface for capsule geometry.
 */
export interface ICapsuleGeometry extends IGeometry {
  /**
   * Radius of the capsule.
   */
  radius: number;

  /**
   * Half height of the capsule.
   */
  halfHeight: number;
}
