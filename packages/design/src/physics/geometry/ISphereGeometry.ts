import { IGeometry } from "./IGeometry";

/**
 * Interface for sphere geometry.
 */
export interface ISphereGeometry extends IGeometry {
  /**
   * Radius of the sphere.
   */
  radius: number;
}
