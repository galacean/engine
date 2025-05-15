import { Quaternion, Vector3 } from "@galacean/engine-math";

/**
 * Base interface for all geometry types.
 */
export interface IGeometry {
  /**
   * Get the underlying PhysX geometry object.
   */
  getGeometry(): any;

  /**
   * Calculate the distance from a point to this geometry.
   * @param pose - The transform of the geometry
   * @param point - The point to calculate distance from
   * @returns Object containing distance and closest point
   */
  pointDistance(
    pose: { translation: Vector3; rotation: Quaternion },
    point: Vector3
  ): { distance: number; closestPoint: Vector3 };

  /**
   * Release the geometry resources.
   */
  release(): void;
}
